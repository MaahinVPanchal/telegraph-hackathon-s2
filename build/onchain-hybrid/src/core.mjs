// Core logic for the hybrid ONCHAIN_METRIC_VERIFY service. Runtime-agnostic: uses only
// fetch, AbortController, crypto.randomUUID and BigInt, so it runs unchanged on Node >= 19
// and Cloudflare Workers.
//
// Routing:
//   every metric, every block -> JSON-RPC at an explicit block number ("latest" is resolved
//                                to the chain head first, so the answer names a real block)
//   eth_balance at latest      -> Ethplorer fallback if every RPC fails (block from getLastBlock)
// Every answer is compact JSON, hard-capped at MAX_BYTES (the scoring runtime rejects
// miner answers over 131072 bytes).

export const MAX_BYTES = 4096;
export const REQUEST_DEADLINE_MS = 8000; // total budget for one request, all upstream calls included
export const ATTEMPT_TIMEOUT_MS = 2500;  // per upstream attempt
export const HEDGE = 2;                  // RPCs raced in parallel at the start
const ZERO = "0x0000000000000000000000000000000000000000";

// Free, keyless endpoints that served eth_getBalance / eth_getTransactionCount at block
// 1,000,000 and 18,000,000 on 27 Oct 2026. Public endpoints change; ARCHIVE_RPC_URL
// (comma-separated, e.g. an Alchemy/Infura key URL) is tried first when set.
export const DEFAULT_ARCHIVE_RPCS = [
  "https://eth-mainnet.public.blastapi.io",
  "https://eth-pokt.nodies.app",
  "https://ethereum-mainnet.gateway.tatum.io",
  "https://rpc.mevblocker.io",
  "https://eth.drpc.org",
  "https://gateway.tenderly.co/public/mainnet",
];

const METRICS = new Set(["eth_balance", "tx_count", "code", "erc20_balance"]);
const ADDRESS_KEYS = ["address", "wallet", "account", "addr"];
const BLOCK_KEYS = ["block_number", "block", "blockNumber", "blockNo", "block_height", "blockTag", "height"];

export class ServiceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
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
  if (/^0x[0-9a-f]+$/.test(s)) return BigInt(s);
  if (/^[0-9]+$/.test(s)) return BigInt(s);
  throw new ServiceError(400, "INVALID_BLOCK", "block_number must be the string latest, a decimal integer (18000000) or hex (0x112a880)");
}
export function parseRequest(params) {
  const metric = (first(params, ["metric", "method", "what"]) || "eth_balance").toLowerCase();
  if (!METRICS.has(metric)) throw new ServiceError(400, "UNSUPPORTED_METRIC", `metric must be one of ${[...METRICS].join(", ")}`);
  const address = parseAddress(first(params, ADDRESS_KEYS));
  const block = parseBlock(first(params, BLOCK_KEYS));
  let token;
  if (metric === "erc20_balance") token = parseAddress(first(params, ["token", "token_address", "contract"]), "token");
  return { metric, address, block, token }; // unknown params are ignored on purpose
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

// Labels are what logs and error messages show. Keyed URLs (ARCHIVE_RPC_URL) are never shown:
// some providers put the key in the path or subdomain.
function rpcList(env) {
  const extra = env && env.ARCHIVE_RPC_URL ? String(env.ARCHIVE_RPC_URL).split(",").map((s) => s.trim()).filter(Boolean) : [];
  return [
    ...extra.map((url, i) => ({ url, label: `ARCHIVE_RPC_URL#${i + 1}` })),
    ...DEFAULT_ARCHIVE_RPCS.map((url) => ({ url, label: new URL(url).host })),
  ];
}

function classify(e) {
  const m = String(e && e.message || e);
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
  if (outer) outer.addEventListener("abort", onOuter);
  ctx.attempts++;
  try {
    const res = await ctx.fetch(url, { ...init, signal: ac.signal });
    const text = await res.text();
    if (text.length > 2_000_000) throw new Error("upstream body too large");
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
async function rpc(ctx, method, params) {
  const list = rpcList(ctx.env);
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
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
          const code = remaining(ctx) <= 0 ? "DEADLINE_EXCEEDED" : "NO_ARCHIVE_SOURCE";
          finish(new ServiceError(504, code, `every RPC failed ${method}: ${ctx.failures.filter((f) => f.method === method).slice(-6).map((f) => `${f.rpc}=${f.reason}`).join(", ")}`));
        }
        return;
      }
      if (remaining(ctx) <= 0) return;
      const p = list[next++]; inFlight++;
      attempt(ctx, p.url, { method: "POST", headers: { "content-type": "application/json" }, body }, winner.signal)
        .then((j) => {
          if (j.error) throw new Error(`rpc error ${j.error.code}: ${String(j.error.message).slice(0, 80)}`);
          if (j.result === undefined || j.result === null) throw new Error("empty result");
          ctx.sources.push(p.label);
          finish(null, { result: j.result, source: p.label });
        })
        .catch((e) => { if (!done) ctx.failures.push({ rpc: p.label, method, reason: classify(e) }); })
        .finally(() => { inFlight--; if (!done) launch(); });
    }
    for (let i = 0; i < Math.min(HEDGE, list.length); i++) launch();
  });
}

async function headBlock(ctx) {
  const c = cacheGet("head"); if (c) return c;
  const { result } = await rpc(ctx, "eth_blockNumber", []);
  const n = BigInt(result); cacheSet("head", n, 6000); return n;
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

// ---------- main ----------
export async function answer(params, ctx) {
  const req = parseRequest(params);
  ctx.req = req;
  const isLatest = req.block === "latest";
  const tagName = isLatest ? "latest" : "number";

  // Resolve the block.
  //  latest     -> eth_blockNumber first so the answer names a real integer block. If every
  //                RPC fails here, an eth_balance question is answered from Ethplorer instead.
  //  historical -> query at that block right away; eth_blockNumber runs in parallel and is
  //                only awaited if the query fails (to turn a future block into a 400).
  let blockNum, headP;
  if (isLatest) {
    try { blockNum = await headBlock(ctx); }
    catch (e) {
      if (req.metric !== "eth_balance") throw e;
      const { wei, block } = await ethplorerLatest(ctx, req.address);
      ctx.blockNum = block;
      return finalize({ metric: req.metric, address: req.address, block: Number(block), block_tag: tagName, chain: "ethereum",
        value: weiToEth(wei), unit: "ETH", balance_wei: wei.toString(), balance_eth: weiToEth(wei), balance_gwei: weiToGwei(wei), source: "api.ethplorer.io",
        block_note: "RPCs unavailable; Ethplorer latest state, block from Ethplorer getLastBlock" }, null);
    }
  } else {
    blockNum = req.block;
    const known = cacheGet("head");
    if (known !== undefined && blockNum > known + 64n) throw new ServiceError(400, "FUTURE_BLOCK", `block ${blockNum} is after the current head ${known}`);
    headP = known !== undefined ? Promise.resolve(known) : headBlock(ctx).catch(() => undefined);
  }
  ctx.blockNum = blockNum;
  const key = `${req.metric}|${req.address}|${req.token || ""}|${blockNum}`;
  const hit = cacheGet(key); if (hit) { ctx.cached = true; return { ...hit, block_tag: tagName, cached: true }; }
  try { return await query(ctx, req, blockNum, isLatest, tagName, key); }
  catch (e) {
    if (headP) {
      const head = await headP;
      if (head !== undefined && blockNum > head) throw new ServiceError(400, "FUTURE_BLOCK", `block ${blockNum} is after the current head ${head}`);
    }
    throw e;
  }
}

async function query(ctx, req, blockNum, isLatest, tagName, key) {
  const out = { metric: req.metric, address: req.address, block: Number(blockNum), block_tag: tagName };
  const tag = hex(blockNum);

  if (req.metric === "eth_balance") {
    let wei, source;
    try { const r = await rpc(ctx, "eth_getBalance", [req.address, tag]); wei = BigInt(r.result); source = r.source; }
    catch (e) {
      if (!isLatest) throw e; // never substitute current state for a historical block
      const p = await ethplorerLatest(ctx, req.address); wei = p.wei; source = "api.ethplorer.io";
      out.block = Number(p.block); out.block_note = "RPC failed at head; Ethplorer latest state, block from Ethplorer getLastBlock";
    }
    Object.assign(out, { chain: "ethereum", value: weiToEth(wei), unit: "ETH", balance_wei: wei.toString(), balance_eth: weiToEth(wei), balance_gwei: weiToGwei(wei), source });
  } else if (req.metric === "tx_count") {
    const r = await rpc(ctx, "eth_getTransactionCount", [req.address, tag]);
    Object.assign(out, { value: BigInt(r.result).toString(), unit: "transactions (nonce)", source: r.source });
  } else if (req.metric === "code") {
    const r = await rpc(ctx, "eth_getCode", [req.address, tag]);
    const size = (String(r.result).length - 2) / 2; // never return the bytecode itself (size cap)
    Object.assign(out, { value: size > 0, unit: "has_code", code_size_bytes: size, source: r.source });
  } else if (req.metric === "erc20_balance") {
    const data = "0x70a08231" + req.address.slice(2).padStart(64, "0"); // balanceOf(address)
    const r = await rpc(ctx, "eth_call", [{ to: req.token, data }, tag]);
    const raw = BigInt(r.result === "0x" ? "0x0" : r.result);
    let decimals = null;
    try { const d = await rpc(ctx, "eth_call", [{ to: req.token, data: "0x313ce567" }, tag]); decimals = Number(BigInt(d.result)); } catch {}
    Object.assign(out, { token: req.token, value: decimals === null ? raw.toString() : scale(raw, decimals), unit: decimals === null ? "raw token units" : "tokens", raw_balance: raw.toString(), decimals, source: r.source });
  }
  return finalize(out, key, isLatest);
}

function finalize(out, key, isLatest) {
  const full = { ok: true, ...out, as_of: new Date().toISOString() };
  if (key) cacheSet(key, full, isLatest ? 15000 : 0); // a numbered block never changes
  return full;
}

export function errorBody(e) {
  const status = e instanceof ServiceError ? e.status : 502;
  return { status, body: { ok: false, error: e instanceof ServiceError ? e.code : "UPSTREAM_ERROR", message: String(e.message || e).slice(0, 300) } };
}

// Serialize with a hard size cap; anything bigger becomes an explicit error, never a truncated answer.
export function serialize(obj) {
  let s = JSON.stringify(obj);
  if (new TextEncoder().encode(s).length > MAX_BYTES) s = JSON.stringify({ ok: false, error: "ANSWER_TOO_LARGE", message: `answer exceeded ${MAX_BYTES} bytes` });
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
  if (u.pathname === "/health") { status = 200; text = serialize({ ok: true }); }
  else if (u.pathname !== "/query") { status = 404; errCode = "NOT_FOUND"; text = serialize({ ok: false, error: "NOT_FOUND", message: "use GET /query?address=0x..&block_number=..&metric=eth_balance" }); }
  else {
    ctx.raw = {
      address: rawFirst(u.searchParams, ADDRESS_KEYS),
      token: rawFirst(u.searchParams, ["token", "token_address", "contract"]),
      block: rawFirst(u.searchParams, BLOCK_KEYS),
      metric: rawFirst(u.searchParams, ["metric", "method", "what"]),
    };
    try { status = 200; text = serialize(await answer(u.searchParams, ctx)); }
    catch (e) { const r = errorBody(e); status = r.status; errCode = r.body.error; text = serialize(r.body); }
  }
  if (!opts.quiet) logLine(ctx, reqId, u.pathname, status, text, errCode);
  return { status, text, reqId };
}
