// Core logic for the hybrid ONCHAIN_METRIC_VERIFY service. Runtime-agnostic: uses only
// fetch, AbortController, crypto.randomUUID and BigInt, so it runs unchanged on Node >= 19
// and Cloudflare Workers.
//
// Every state read is pinned to a selected chain and block. Only latest Ethereum native
// balance may use the Ethereum-only Ethplorer fallback.

export const MAX_BYTES = 4096;
export const REQUEST_DEADLINE_MS = 8000; // total budget for one request, all upstream calls included
export const ATTEMPT_TIMEOUT_MS = 2500;  // per upstream attempt
export const HEDGE = 2;                  // RPCs raced in parallel at the start
const ZERO = "0x0000000000000000000000000000000000000000";

// The chain ID is checked with eth_chainId before each provider is trusted.
export const CHAINS = Object.freeze({
  ethereum: Object.freeze({
    id: 1, nativeSymbol: "ETH",
    rpcs: Object.freeze([
      "https://ethereum-rpc.publicnode.com",
      "https://eth-mainnet.public.blastapi.io",
      "https://eth-pokt.nodies.app",
      "https://ethereum-mainnet.gateway.tatum.io",
      "https://rpc.mevblocker.io",
      "https://eth.drpc.org",
      "https://gateway.tenderly.co/public/mainnet",
    ]),
  }),
  polygon: Object.freeze({
    id: 137, nativeSymbol: "POL",
    rpcs: Object.freeze([
      "https://polygon.drpc.org",
      "https://polygon.publicnode.com",
      "https://polygon-mainnet.gateway.tatum.io",
    ]),
  }),
  "arbitrum-one": Object.freeze({
    id: 42161, nativeSymbol: "ETH",
    rpcs: Object.freeze([
      "https://arbitrum.publicnode.com",
      "https://arbitrum.drpc.org",
    ]),
  }),
});

export const DEFAULT_ARCHIVE_RPCS = CHAINS.ethereum.rpcs;

const METRICS = new Set(["eth_balance", "tx_count", "code", "erc20_balance", "tx_receipt", "logs", "total_supply"]);
const ADDRESS_KEYS = ["address", "wallet", "account", "addr"];
const BLOCK_KEYS = ["block_number", "block", "blockNumber", "blockNo", "block_height", "blockTag", "height"];
const CHAIN_KEYS = ["chain", "chain_id", "chainId"];
const TOKEN_KEYS = ["token", "token_address", "contract"];
const TX_HASH_KEYS = ["tx_hash", "transaction_hash", "txHash"];
const MAX_LOG_RANGE = 2000n;
const MAX_LOGS = 100;
const MAX_DECIMALS = 255;

export class ServiceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

class ChainIdMismatch extends Error {
  constructor(expected, actual) {
    super(`expected chain ID ${expected}, provider returned ${actual}`);
    this.name = "ChainIdMismatch";
  }
}

// ---------- tiny TTL/LRU cache ----------
const cache = new Map();
const CACHE_MAX = 500;
function cacheGet(k) {
  const e = cache.get(k);
  if (!e) return undefined;
  if (e.exp && e.exp < Date.now()) { cache.delete(k); return undefined; }
  cache.delete(k); cache.set(k, e);
  return e.v;
}
function cacheSet(k, v, ttlMs) {
  cache.set(k, { v, exp: ttlMs ? Date.now() + ttlMs : 0 });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}
export function clearCache() { cache.clear(); }

// ---------- parsing ----------
function first(params, keys) {
  for (const k of keys) { const v = params.get(k); if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim(); }
  return undefined;
}
function all(params, keys) {
  return keys.flatMap((key) => params.getAll(key)).map((value) => String(value).trim()).filter(Boolean);
}
export function parseAddress(v, label = "address") {
  if (!v) throw new ServiceError(400, "MISSING_ADDRESS", `${label} is required (0x + 40 hex characters)`);
  let s = String(v).trim().replace(/^["'\s]+|["'\s]+$/g, "");
  if (/^0X[0-9a-fA-F]{40}$/.test(s)) s = "0x" + s.slice(2);
  else if (/^[0-9a-fA-F]{40}$/.test(s)) s = "0x" + s;
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) throw new ServiceError(400, "INVALID_ADDRESS", `${label} must be 0x followed by exactly 40 hex characters; ENS names are not supported`);
  return s.toLowerCase();
}
// Returns "latest" or a non-negative BigInt block number.
export function parseBlock(v) {
  if (v === undefined) return "latest";
  const s = v.toLowerCase().replace(/[_,\s]/g, "");
  if (s === "latest" || s === "") return "latest";
  if (!/^0x[0-9a-f]+$/.test(s) && !/^[0-9]+$/.test(s)) {
    throw new ServiceError(400, "INVALID_BLOCK", "block must be latest, a decimal integer or a 0x-prefixed hex integer");
  }
  if ((s.startsWith("0x") ? s.length - 2 : s.length) > 16) {
    throw new ServiceError(400, "INVALID_BLOCK", "block exceeds the supported exact integer range");
  }
  const block = BigInt(s);
  if (block > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ServiceError(400, "INVALID_BLOCK", "block exceeds the supported exact integer range");
  }
  return block;
}
function parseChain(params) {
  const values = all(params, CHAIN_KEYS);
  if (!values.length) throw new ServiceError(400, "CHAIN_REQUIRED", "chain is required; choose ethereum, polygon or arbitrum-one");
  const aliases = new Map([
    ["ethereum", "ethereum"], ["ethereum-mainnet", "ethereum"], ["eth", "ethereum"], ["1", "ethereum"], ["0x1", "ethereum"],
    ["polygon", "polygon"], ["polygon-pos", "polygon"], ["matic", "polygon"], ["137", "polygon"], ["0x89", "polygon"],
    ["arbitrum", "arbitrum-one"], ["arbitrum-one", "arbitrum-one"], ["arb", "arbitrum-one"], ["42161", "arbitrum-one"], ["0xa4b1", "arbitrum-one"],
  ]);
  const parsed = values.map((value) => aliases.get(value.toLowerCase()));
  if (parsed.some((chain) => !chain)) {
    throw new ServiceError(400, "UNSUPPORTED_CHAIN", "chain must be ethereum, polygon or arbitrum-one");
  }
  if (new Set(parsed).size > 1) {
    throw new ServiceError(400, "CONFLICTING_CHAIN", "chain and chain_id inputs conflict");
  }
  return { name: parsed[0], requested: values[0], config: CHAINS[parsed[0]] };
}
function parseHash(v, label = "tx_hash") {
  if (!v) throw new ServiceError(400, `MISSING_${label.toUpperCase()}`, `${label} is required (0x + 64 hex characters)`);
  const hash = String(v).trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new ServiceError(400, `INVALID_${label.toUpperCase()}`, `${label} must be 0x followed by exactly 64 hex characters`);
  }
  return hash.toLowerCase();
}
function parseLogBlock(params, keys, label) {
  const raw = first(params, keys);
  if (raw === undefined || raw.toLowerCase() === "latest") {
    throw new ServiceError(400, "LOG_BLOCK_RANGE_REQUIRED", `${label} is required as a decimal or hex block number`);
  }
  const block = parseBlock(raw);
  if (block === "latest") throw new ServiceError(400, "INVALID_BLOCK", `${label} must be a numbered block`);
  return block;
}
function parseTopics(params) {
  const topics = [];
  for (let i = 0; i < 4; i++) {
    const topic = first(params, [`topic${i}`]);
    topics.push(topic === undefined ? null : parseHash(topic, `topic${i}`));
  }
  while (topics.length && topics[topics.length - 1] === null) topics.pop();
  return topics;
}
export function parseRequest(params) {
  const chain = parseChain(params);
  if (params.has("question")) {
    throw new ServiceError(400, "QUESTION_UNSUPPORTED", "question parsing is not available; supply an explicit metric and arguments");
  }
  const rpcUrlKeys = new Set(["rpc_url", "rpcurl", "rpc", "provider_url", "providerurl", "rpc_endpoint", "rpcendpoint"]);
  if ([...params.keys()].some((key) => rpcUrlKeys.has(key.toLowerCase()))) {
    throw new ServiceError(400, "RPC_URL_NOT_ALLOWED", "RPC URLs are selected from the fixed chain allowlist");
  }
  const metric = (first(params, ["metric", "operation", "method", "what"]) || "eth_balance").toLowerCase();
  if (!METRICS.has(metric)) throw new ServiceError(400, "UNSUPPORTED_METRIC", `metric must be one of ${[...METRICS].join(", ")}`);

  if (metric === "tx_receipt") {
    return { metric, ...chain, txHash: parseHash(first(params, TX_HASH_KEYS)) };
  }
  if (metric === "logs") {
    const fromBlock = parseLogBlock(params, ["from_block", "fromBlock"], "from_block");
    const toBlock = parseLogBlock(params, ["to_block", "toBlock"], "to_block");
    if (toBlock < fromBlock) throw new ServiceError(400, "INVALID_LOG_RANGE", "to_block must be greater than or equal to from_block");
    if (toBlock - fromBlock > MAX_LOG_RANGE) throw new ServiceError(400, "LOG_RANGE_TOO_LARGE", `log ranges are limited to ${MAX_LOG_RANGE} blocks`);
    const rawAddress = first(params, ADDRESS_KEYS);
    const address = rawAddress ? parseAddress(rawAddress, "address") : undefined;
    const topics = parseTopics(params);
    if (!address && !topics.some(Boolean)) {
      throw new ServiceError(400, "LOG_FILTER_REQUIRED", "logs require a contract address or at least one topic filter");
    }
    return { metric, ...chain, address, topics, fromBlock, toBlock };
  }

  const address = metric === "total_supply" ? undefined : parseAddress(first(params, ADDRESS_KEYS));
  const rawBlock = first(params, BLOCK_KEYS);
  if (metric === "total_supply" && rawBlock === undefined) {
    throw new ServiceError(400, "BLOCK_REQUIRED", "total_supply requires a specific block_number");
  }
  const block = parseBlock(rawBlock);
  if (metric === "total_supply" && block === "latest") {
    throw new ServiceError(400, "BLOCK_REQUIRED", "total_supply requires a numbered block, not latest");
  }
  const token = ["erc20_balance", "total_supply"].includes(metric)
    ? parseAddress(first(params, TOKEN_KEYS), "token")
    : undefined;
  return { metric, ...chain, address, block, token };
}

// ---------- units ----------
export function weiToEth(wei) {
  const neg = wei < 0n; const w = neg ? -wei : wei;
  const whole = w / 10n ** 18n; const frac = (w % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "");
}
function weiToGwei(wei) {
  const neg = wei < 0n; const w = neg ? -wei : wei;
  const whole = w / 10n ** 9n; const frac6 = (w % 10n ** 9n).toString().padStart(9, "0").slice(0, 6);
  return Number((neg ? "-" : "") + whole.toString() + "." + frac6);
}
function scale(raw, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new ServiceError(502, "INVALID_TOKEN_DECIMALS", "token decimals are outside the supported uint8 range");
  }
  const d = BigInt(decimals); const base = 10n ** d;
  const whole = raw / base; const frac = d ? (raw % base).toString().padStart(Number(d), "0").replace(/0+$/, "") : "";
  return whole.toString() + (frac ? "." + frac : "");
}
const hex = (n) => "0x" + n.toString(16);

// ---------- per-request context ----------
// Holds the total deadline, the fetch implementation (injectable for tests) and the
// counters that go into the request log. Never stores URLs: only safe labels.
export function makeCtx(env = {}, fetchImpl = globalThis.fetch) {
  return { start: Date.now(), deadline: Date.now() + (Number(env.REQUEST_DEADLINE_MS) || REQUEST_DEADLINE_MS),
    attemptMs: Number(env.ATTEMPT_TIMEOUT_MS) || ATTEMPT_TIMEOUT_MS,
    // Wrapped, not stored bare: ctx.fetch(...) would call fetch with this=ctx, which Workers
    // rejects with "Illegal invocation" (Node tolerates it).
    fetch: (url, init) => fetchImpl(url, init), env,
    attempts: 0, failures: [], sources: [] };
}
const remaining = (ctx) => ctx.deadline - Date.now();

// Labels are what logs and error messages show. Configured URLs are never exposed.
function rpcList(chain, env) {
  const extra = env && env.ARCHIVE_RPC_URL ? String(env.ARCHIVE_RPC_URL).split(",").map((s) => s.trim()).filter(Boolean) : [];
  const configured = extra.map((url, i) => {
    let parsed;
    try { parsed = new URL(url); } catch { throw new ServiceError(500, "INVALID_RPC_CONFIGURATION", "ARCHIVE_RPC_URL contains an invalid URL"); }
    if (parsed.protocol !== "https:") throw new ServiceError(500, "INVALID_RPC_CONFIGURATION", "ARCHIVE_RPC_URL endpoints must use HTTPS");
    return { url, label: `ARCHIVE_RPC_URL#${i + 1}` };
  });
  return [
    ...configured,
    ...chain.rpcs.map((url) => ({ url, label: new URL(url).host })),
  ];
}

function classify(e) {
  const m = String(e && e.message || e);
  if (e instanceof ChainIdMismatch) return "chain_id_mismatch";
  if (e && e.name === "AbortError" || /abort|timeout/i.test(m)) return "timeout";
  if (/HTTP 429|rate/i.test(m)) return "rate_limited";
  if (/pruned|historical state|archive|missing trie/i.test(m)) return "no_archive";
  if (/HTTP 5\d\d/.test(m)) return "http_5xx";
  if (/HTTP 4\d\d/.test(m)) return "http_4xx";
  if (/rpc error/.test(m)) return "rpc_error";
  return "network";
}

// One upstream attempt, bounded by min(per-attempt timeout, time left in the request).
// `outer` aborts it early when a hedged sibling has already won.
async function attempt(ctx, url, init, outer) {
  const budget = Math.min(ctx.attemptMs, remaining(ctx));
  if (budget <= 0) throw new Error("timeout: request deadline reached");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), budget);
  const onOuter = () => ac.abort();
  if (outer) {
    if (outer.aborted) ac.abort();
    else outer.addEventListener("abort", onOuter);
  }
  ctx.attempts++;
  try {
    const res = await ctx.fetch(url, { ...init, signal: ac.signal });
    const declaredBytes = Number(res.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > 2_000_000) throw new Error("upstream body too large");
    const text = await res.text();
    if (new TextEncoder().encode(text).length > 2_000_000) throw new Error("upstream body too large");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let json; try { json = JSON.parse(text); } catch { throw new Error(`non-JSON HTTP ${res.status}`); }
    return json;
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener("abort", onOuter);
  }
}

// Hedged, bounded failover: race the first HEDGE providers; every failure starts the next
// provider; the first valid result wins and aborts the rest; stop at the request deadline.
async function rpc(ctx, chain, method, params) {
  const list = rpcList(chain.config, ctx.env);
  const winner = new AbortController();
  return await new Promise((resolve, reject) => {
    let next = 0, inFlight = 0, done = false;
    const deadlineTimer = setTimeout(() => finish(new ServiceError(504, "DEADLINE_EXCEEDED", `no RPC answered ${method} within ${ctx.deadline - ctx.start} ms`)), Math.max(0, remaining(ctx)));
    function finish(err, val) {
      if (done) return; done = true; clearTimeout(deadlineTimer); winner.abort();
      err ? reject(err) : resolve(val);
    }
    function launch() {
      if (done) return;
      if (next >= list.length) {
        if (inFlight === 0) {
          const failures = ctx.failures.filter((f) => f.method === method).slice(-6);
          const mismatches = ctx.failures.filter((f) => f.method === method && f.reason === "chain_id_mismatch").length;
          if (mismatches === list.length) {
            finish(new ServiceError(502, "CHAIN_ID_MISMATCH", `all RPC providers returned a chain ID other than ${chain.config.id}`));
          } else {
            const code = remaining(ctx) <= 0 ? "DEADLINE_EXCEEDED" : "NO_ARCHIVE_SOURCE";
            finish(new ServiceError(504, code, `every RPC failed ${method}: ${failures.map((f) => `${f.rpc}=${f.reason}`).join(", ")}`));
          }
        }
        return;
      }
      if (remaining(ctx) <= 0) return;
      const p = list[next++]; inFlight++;
      const request = (rpcMethod, rpcParams) => attempt(ctx, p.url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: rpcMethod, params: rpcParams }),
      }, winner.signal);
      request("eth_chainId", [])
        .then((identity) => {
          if (identity.error) throw new Error(`rpc error ${identity.error.code}: ${String(identity.error.message).slice(0, 80)}`);
          if (typeof identity.result !== "string" || !/^0x[0-9a-f]+$/i.test(identity.result)) {
            throw new Error("eth_chainId returned an invalid result");
          }
          let actual;
          try { actual = BigInt(identity.result); } catch { throw new Error("eth_chainId returned an invalid result"); }
          if (actual !== BigInt(chain.config.id)) throw new ChainIdMismatch(chain.config.id, actual.toString());
          return request(method, params);
        })
        .then((j) => {
          if (j.error) throw new Error(`rpc error ${j.error.code}: ${String(j.error.message).slice(0, 80)}`);
          if (j.result === undefined || (j.result === null && !["eth_getTransactionByHash", "eth_getTransactionReceipt"].includes(method))) {
            throw new Error("empty result");
          }
          ctx.sources.push(p.label);
          finish(null, { result: j.result, source: p.label });
        })
        .catch((e) => { if (!done) ctx.failures.push({ rpc: p.label, method, reason: classify(e) }); })
        .finally(() => { inFlight--; if (!done) launch(); });
    }
    for (let i = 0; i < Math.min(HEDGE, list.length); i++) launch();
  });
}

async function headBlock(ctx, chain) {
  const key = `head:${chain.name}`;
  const c = cacheGet(key); if (c !== undefined) return c;
  const { result } = await rpc(ctx, chain, "eth_blockNumber", []);
  const n = rpcQuantity(result, "head block");
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new ServiceError(502, "INVALID_RPC_RESPONSE", "head block exceeds the supported exact integer range");
  cacheSet(key, n, 6000); return n;
}

async function ethplorerLatest(ctx, address) {
  try { return await ethplorerLatestRaw(ctx, address); }
  catch (e) {
    ctx.failures.push({ rpc: "api.ethplorer.io", method: "getAddressInfo", reason: classify(e) });
    throw new ServiceError(504, remaining(ctx) <= 0 ? "DEADLINE_EXCEEDED" : "NO_SOURCE", "RPCs and Ethplorer fallback all failed for latest eth_balance");
  }
}
async function ethplorerLatestRaw(ctx, address) {
  const base = "https://api.ethplorer.io";
  const j = await attempt(ctx, `${base}/getAddressInfo/${address}?apiKey=freekey&token=${ZERO}&showETHTotals=false`, {});
  if (j.error || !j.ETH || j.ETH.rawBalance === undefined) throw new Error("ethplorer: unexpected body");
  const b = await attempt(ctx, `${base}/getLastBlock?apiKey=freekey`, {});
  if (!b || !Number.isInteger(b.lastBlock)) throw new Error("ethplorer: no lastBlock");
  ctx.sources.push("api.ethplorer.io");
  return { wei: BigInt(j.ETH.rawBalance), block: BigInt(b.lastBlock) };
}

function resultCacheKey(req) {
  const args = { chain: req.name, requestedChain: req.requested, metric: req.metric };
  if (req.metric === "tx_receipt") args.txHash = req.txHash;
  else if (req.metric === "logs") {
    Object.assign(args, { address: req.address || null, topics: req.topics, fromBlock: req.fromBlock.toString(), toBlock: req.toBlock.toString() });
  } else {
    Object.assign(args, { address: req.address || null, token: req.token || null, block: req.block === "latest" ? "latest" : req.block.toString() });
  }
  return `result:${JSON.stringify(args)}`;
}

function provenance(req, block, blockTag) {
  return {
    chain: req.name, requested_chain: req.requested, chain_id: req.config.id,
    requested_block: req.block === undefined ? null : req.block === "latest" ? "latest" : req.block.toString(),
    block: block === null ? null : Number(block), block_tag: blockTag,
  };
}

function rpcQuantity(value, field) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new ServiceError(502, "INVALID_RPC_RESPONSE", `${field} was not a valid JSON-RPC quantity`);
  }
  return BigInt(value);
}

async function tokenDecimals(ctx, req, token, tag) {
  try {
    const r = await rpc(ctx, req, "eth_call", [{ to: token, data: "0x313ce567" }, tag]);
    const decimals = Number(rpcQuantity(r.result, "decimals"));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
      return { decimals: null, decimals_error: "INVALID_TOKEN_DECIMALS" };
    }
    return { decimals, decimals_source: r.source };
  } catch (e) {
    return { decimals: null, decimals_error: e instanceof ServiceError ? e.code : classify(e) };
  }
}

// ---------- main ----------
export async function answer(params, ctx) {
  const req = parseRequest(params);
  ctx.req = req;
  const key = resultCacheKey(req);
  const cached = cacheGet(key);
  if (cached) { ctx.cached = true; return { ...cached, cached: true }; }
  if (req.metric === "tx_receipt") return transactionReceipt(ctx, req, key);
  if (req.metric === "logs") return logsQuery(ctx, req, key);

  const isLatest = req.block === "latest";
  const tagName = isLatest ? "latest" : "number";
  let blockNum;
  if (isLatest) {
    try { blockNum = await headBlock(ctx, req); }
    catch (e) {
      if (req.metric !== "eth_balance" || req.name !== "ethereum" || e.code === "CHAIN_ID_MISMATCH") throw e;
      const { wei, block } = await ethplorerLatest(ctx, req.address);
      ctx.blockNum = block;
      const native = weiToEth(wei);
      return finalize({
        metric: req.metric, address: req.address, ...provenance(req, block, tagName),
        value: native, unit: "ETH", native_symbol: "ETH", balance_native: native,
        balance_wei: wei.toString(), balance_eth: native, balance_gwei: weiToGwei(wei),
        source: "api.ethplorer.io", block_note: "Ethereum-only fallback; block from Ethplorer getLastBlock",
      }, key, 15000);
    }
  } else {
    blockNum = req.block;
    const head = await headBlock(ctx, req);
    if (blockNum > head) throw new ServiceError(400, "FUTURE_BLOCK", `block ${blockNum} is after the ${req.name} head ${head}`);
  }
  ctx.blockNum = blockNum;
  return query(ctx, req, blockNum, isLatest, tagName, key);
}

async function query(ctx, req, blockNum, isLatest, tagName, key) {
  const out = { metric: req.metric, address: req.address, ...provenance(req, blockNum, tagName) };
  const tag = hex(blockNum);
  if (req.metric === "eth_balance") {
    let wei, source;
    try {
      const r = await rpc(ctx, req, "eth_getBalance", [req.address, tag]);
      wei = rpcQuantity(r.result, "balance"); source = r.source;
    } catch (e) {
      if (!isLatest || req.name !== "ethereum" || e.code === "CHAIN_ID_MISMATCH") throw e;
      const fallback = await ethplorerLatest(ctx, req.address);
      wei = fallback.wei; source = "api.ethplorer.io";
      Object.assign(out, provenance(req, fallback.block, tagName));
      out.block_note = "Ethereum-only fallback; block from Ethplorer getLastBlock";
    }
    const native = weiToEth(wei);
    Object.assign(out, {
      value: native, unit: req.config.nativeSymbol, native_symbol: req.config.nativeSymbol,
      balance_native: native, balance_wei: wei.toString(), source,
    });
    if (req.config.nativeSymbol === "ETH") Object.assign(out, { balance_eth: native, balance_gwei: weiToGwei(wei) });
  } else if (req.metric === "tx_count") {
    const r = await rpc(ctx, req, "eth_getTransactionCount", [req.address, tag]);
    const nonce = rpcQuantity(r.result, "nonce").toString();
    Object.assign(out, { value: nonce, nonce, unit: "nonce", source: r.source });
  } else if (req.metric === "code") {
    const r = await rpc(ctx, req, "eth_getCode", [req.address, tag]);
    if (typeof r.result !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(r.result)) {
      throw new ServiceError(502, "INVALID_RPC_RESPONSE", "eth_getCode returned malformed bytecode");
    }
    const size = (r.result.length - 2) / 2;
    Object.assign(out, { value: size > 0, has_code: size > 0, unit: "has_code", code_size_bytes: size, source: r.source });
  } else if (req.metric === "erc20_balance") {
    const data = "0x70a08231" + req.address.slice(2).padStart(64, "0");
    const r = await rpc(ctx, req, "eth_call", [{ to: req.token, data }, tag]);
    const raw = rpcQuantity(r.result, "balanceOf");
    const meta = await tokenDecimals(ctx, req, req.token, tag);
    Object.assign(out, {
      token: req.token, value: meta.decimals === null ? raw.toString() : scale(raw, meta.decimals),
      unit: meta.decimals === null ? "raw token units" : "tokens",
      raw_balance: raw.toString(), source: r.source, ...meta,
      sources: [...new Set([r.source, meta.decimals_source].filter(Boolean))],
    });
  } else if (req.metric === "total_supply") {
    const r = await rpc(ctx, req, "eth_call", [{ to: req.token, data: "0x18160ddd" }, tag]);
    const raw = rpcQuantity(r.result, "totalSupply");
    const meta = await tokenDecimals(ctx, req, req.token, tag);
    Object.assign(out, {
      token: req.token, value: meta.decimals === null ? raw.toString() : scale(raw, meta.decimals),
      unit: meta.decimals === null ? "raw token units" : "tokens",
      raw_total_supply: raw.toString(), source: r.source, ...meta,
      sources: [...new Set([r.source, meta.decimals_source].filter(Boolean))],
      supply_kind: "totalSupply; not circulating supply",
    });
  }
  return finalize(out, key, isLatest ? 15000 : 0);
}

async function transactionReceipt(ctx, req, key) {
  const [txResult, receiptResult] = await Promise.all([
    rpc(ctx, req, "eth_getTransactionByHash", [req.txHash]),
    rpc(ctx, req, "eth_getTransactionReceipt", [req.txHash]),
  ]);
  const tx = txResult.result;
  const receipt = receiptResult.result;
  if (tx === null && receipt === null) {
    throw new ServiceError(404, "TRANSACTION_NOT_FOUND", "no transaction or receipt was found for tx_hash");
  }
  const mined = receipt !== null;
  const rawBlock = receipt?.blockNumber ?? tx?.blockNumber ?? null;
  const blockValue = rawBlock === null ? null : rpcQuantity(rawBlock, "transaction block");
  if (blockValue !== null && blockValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ServiceError(502, "INVALID_RPC_RESPONSE", "transaction block exceeds the supported exact integer range");
  }
  const block = blockValue === null ? null : Number(blockValue);
  const out = {
    metric: req.metric, tx_hash: req.txHash, ...provenance(req, block, mined ? "number" : "pending"),
    state: mined ? "mined" : "pending",
    transaction: tx ? {
      from: tx.from || null, to: tx.to || null,
      value_wei: tx.value === undefined ? null : rpcQuantity(tx.value, "transaction value").toString(),
      nonce: tx.nonce === undefined ? null : rpcQuantity(tx.nonce, "transaction nonce").toString(),
    } : null,
    source: receiptResult.source,
    sources: [...new Set([txResult.source, receiptResult.source])],
  };
  if (mined) {
    if (receipt.gasUsed === undefined) throw new ServiceError(502, "INVALID_RPC_RESPONSE", "mined receipt omitted gasUsed");
    const gasUsed = rpcQuantity(receipt.gasUsed, "gasUsed");
    const effectivePrice = receipt.effectiveGasPrice ?? null;
    const effectivePriceWei = effectivePrice === null ? null : rpcQuantity(effectivePrice, "effective gas price");
    const receiptStatus = receipt.status === undefined ? null : Number(rpcQuantity(receipt.status, "receipt status"));
    if (receiptStatus !== null && receiptStatus !== 0 && receiptStatus !== 1) {
      throw new ServiceError(502, "INVALID_RPC_RESPONSE", "receipt status must be 0 or 1");
    }
    Object.assign(out, {
      receipt_status: receiptStatus, gas_used: gasUsed.toString(),
      effective_gas_price_wei: effectivePriceWei === null ? null : effectivePriceWei.toString(),
      fee_paid_wei: effectivePriceWei === null ? null : (gasUsed * effectivePriceWei).toString(),
      fee_status: effectivePriceWei === null ? "effective gas price unavailable" : "exact",
    });
  }
  return finalize(out, key, 2000);
}

async function logsQuery(ctx, req, key) {
  const head = await headBlock(ctx, req);
  if (req.toBlock > head) {
    throw new ServiceError(400, "FUTURE_BLOCK", `to_block ${req.toBlock} is after the ${req.name} head ${head}`);
  }
  const filter = { fromBlock: hex(req.fromBlock), toBlock: hex(req.toBlock) };
  if (req.address) filter.address = req.address;
  if (req.topics.length) filter.topics = req.topics;
  const r = await rpc(ctx, req, "eth_getLogs", [filter]);
  if (!Array.isArray(r.result)) throw new ServiceError(502, "INVALID_RPC_RESPONSE", "eth_getLogs did not return an array");
  if (r.result.length > MAX_LOGS) throw new ServiceError(413, "TOO_MANY_LOGS", `log results are limited to ${MAX_LOGS}`);
  return finalize({
    metric: req.metric, ...provenance(req, null, "range"),
    from_block: Number(req.fromBlock), to_block: Number(req.toBlock),
    address: req.address || null, topics: req.topics, count: r.result.length, logs: r.result, source: r.source,
  }, key, 15000);
}

function finalize(out, key, ttlMs) {
  const full = { ok: true, ...out, sources: out.sources || (out.source ? [out.source] : []), as_of: new Date().toISOString() };
  if (key) cacheSet(key, full, ttlMs);
  return full;
}

export function errorBody(e) {
  const status = e instanceof ServiceError ? e.status : 502;
  return { status, body: { ok: false, error: e instanceof ServiceError ? e.code : "UPSTREAM_ERROR", message: String(e.message || e).slice(0, 300) } };
}

// Oversized answers are HTTP failures, never success-shaped truncation.
export function serialize(obj) {
  const s = JSON.stringify(obj);
  if (new TextEncoder().encode(s).length > MAX_BYTES) {
    throw new ServiceError(413, "ANSWER_TOO_LARGE", `answer exceeded ${MAX_BYTES} bytes`);
  }
  return s;
}

function rawFirst(params, keys) {
  for (const k of keys) {
    const v = params.get(k);
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

function boundedLogValue(value) {
  if (value.length <= 128) return value;
  return `${value.slice(0, 128)}...[truncated, len=${value.length}]`;
}

// One structured JSON line per request. Never log upstream URLs; invalid input fields are capped.
function logLine(ctx, reqId, path, status, text, errCode) {
  const r = ctx.req || {};
  const raw = ctx.raw || {};
  console.log(JSON.stringify({
    ts: new Date().toISOString(), req_id: reqId, path, status,
    error: errCode || undefined,
    address: r.address, raw_address: !r.address && raw.address !== undefined ? boundedLogValue(raw.address) : undefined,
    token: r.token, raw_token: !r.token && raw.token !== undefined ? boundedLogValue(raw.token) : undefined,
    metric: r.metric, raw_metric: !r.metric && raw.metric !== undefined ? boundedLogValue(raw.metric) : undefined,
    chain: r.name, requested_chain: r.requested,
    tx_hash: r.txHash, raw_tx_hash: !r.txHash && raw.txHash !== undefined ? boundedLogValue(raw.txHash) : undefined,
    raw_block: r.block === undefined && raw.block !== undefined ? boundedLogValue(raw.block) : undefined,
    block: ctx.blockNum !== undefined ? Number(ctx.blockNum) : undefined,
    block_tag: r.block === undefined ? undefined : (r.block === "latest" ? "latest" : "number"),
    source: ctx.sources.length ? ctx.sources[ctx.sources.length - 1] : undefined,
    cached: ctx.cached || false, attempts: ctx.attempts,
    rpc_failures: ctx.failures.length ? ctx.failures : undefined,
    latency_ms: Date.now() - ctx.start, bytes: new TextEncoder().encode(text).length,
  }));
}

export async function handle(url, env = {}, opts = {}) {
  const u = new URL(url);
  const ctx = makeCtx(env, opts.fetch || globalThis.fetch);
  const reqId = opts.requestId || (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  let status, text, errCode;
  if (String(url).length > 16384) {
    status = 413; errCode = "REQUEST_TOO_LARGE";
    text = serialize({ ok: false, error: errCode, message: "request URL exceeded 16384 characters" });
  } else if (u.pathname === "/health") { status = 200; text = serialize({ ok: true }); }
  else if (u.pathname !== "/query") { status = 404; errCode = "NOT_FOUND"; text = serialize({ ok: false, error: "NOT_FOUND", message: "use GET /query?address=0x..&block_number=..&metric=eth_balance" }); }
  else {
    ctx.raw = {
      address: rawFirst(u.searchParams, ADDRESS_KEYS),
      token: rawFirst(u.searchParams, TOKEN_KEYS),
      block: rawFirst(u.searchParams, BLOCK_KEYS),
      metric: rawFirst(u.searchParams, ["metric", "operation", "method", "what"]),
      txHash: rawFirst(u.searchParams, TX_HASH_KEYS),
    };
    try { text = serialize(await answer(u.searchParams, ctx)); status = 200; }
    catch (e) { const r = errorBody(e); status = r.status; errCode = r.body.error; text = serialize(r.body); }
  }
  if (!opts.quiet) logLine(ctx, reqId, u.pathname, status, text, errCode);
  return { status, text, reqId };
}
