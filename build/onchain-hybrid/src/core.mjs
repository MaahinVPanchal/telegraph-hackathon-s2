// Core logic for the hybrid ONCHAIN_METRIC_VERIFY service. Runtime-agnostic: uses only
// fetch, AbortSignal and BigInt, so it runs unchanged on Node >= 18 and Cloudflare Workers.
//
// Routing:
//   latest + eth_balance  -> Ethplorer (token=0x0..0, showETHTotals=false), RPC fallback
//   everything else       -> JSON-RPC at an explicit block (archive-capable public RPCs)
// Every answer is compact JSON, hard-capped at MAX_BYTES (the scoring runtime rejects
// miner answers over 131072 bytes).

export const MAX_BYTES = 4096;
const TIMEOUT_MS = 8000;
const ZERO = "0x0000000000000000000000000000000000000000";

// Free, keyless endpoints that served eth_getBalance / eth_getTransactionCount at block
// 1,000,000 and 18,000,000 on 27 Oct 2026. Public endpoints change; ARCHIVE_RPC_URL
// (e.g. an Alchemy/Infura key URL) is tried first when set.
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
  cache.delete(k); cache.set(k, e); // refresh LRU position
  return e.v;
}
function cacheSet(k, v, ttlMs) {
  cache.set(k, { v, exp: ttlMs ? Date.now() + ttlMs : 0 });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// ---------- parsing ----------
function first(params, keys) {
  for (const k of keys) { const v = params.get(k); if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim(); }
  return undefined;
}
export function parseAddress(v, label = "address") {
  if (!v) throw new ServiceError(400, "MISSING_ADDRESS", `${label} is required (0x + 40 hex characters)`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new ServiceError(400, "INVALID_ADDRESS", `${label} must be 0x followed by exactly 40 hex characters; ENS names are not supported`);
  return v.toLowerCase();
}
// Returns "latest" or a non-negative BigInt block number.
export function parseBlock(v) {
  if (v === undefined) return "latest";
  const s = v.toLowerCase().replace(/[_,\s]/g, "");
  if (s === "latest" || s === "") return "latest";
  if (/^0x[0-9a-f]+$/.test(s)) return BigInt(s);
  if (/^[0-9]+$/.test(s)) return BigInt(s);
  throw new ServiceError(400, "INVALID_BLOCK", "block_number must be 'latest', a decimal number (18000000) or hex (0x112a880)");
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
function scale(raw, decimals) {
  const d = BigInt(decimals); const base = 10n ** d;
  const whole = raw / base; const frac = d ? (raw % base).toString().padStart(Number(d), "0").replace(/0+$/, "") : "";
  return whole.toString() + (frac ? "." + frac : "");
}
const hex = (n) => "0x" + n.toString(16);

// ---------- upstream calls ----------
async function fetchJson(url, init, attempt = 0) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    if (text.length > 2_000_000) throw new Error("upstream body too large");
    let json; try { json = JSON.parse(text); } catch { throw new Error(`non-JSON HTTP ${res.status}: ${text.slice(0, 80)}`); }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 120)}`);
    return json;
  } catch (e) {
    if (attempt === 0) return fetchJson(url, init, 1); // one retry
    throw e;
  }
}

function rpcList(env) {
  const extra = env && env.ARCHIVE_RPC_URL ? String(env.ARCHIVE_RPC_URL).split(",").map((s) => s.trim()).filter(Boolean) : [];
  return [...extra, ...DEFAULT_ARCHIVE_RPCS];
}
function hostOf(u) { try { return new URL(u).host; } catch { return "rpc"; } }

// Archive refusals look like JSON-RPC errors ("pruned", "historical state", "archive",
// "missing trie node"); treat any JSON-RPC error as "this provider cannot answer" and move on.
async function rpc(env, method, params) {
  const errors = [];
  for (const url of rpcList(env)) {
    try {
      const j = await fetchJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      if (j.error) throw new Error(`rpc error ${j.error.code}: ${String(j.error.message).slice(0, 100)}`);
      if (j.result === undefined || j.result === null) throw new Error("empty result");
      return { result: j.result, source: hostOf(url) };
    } catch (e) { errors.push(`${hostOf(url)}: ${e.message}`); }
  }
  throw new ServiceError(502, "NO_ARCHIVE_SOURCE", `no RPC could answer ${method}: ${errors.slice(0, 3).join(" | ")}`);
}

async function headBlock(env) {
  const c = cacheGet("head"); if (c) return c;
  const { result } = await rpc(env, "eth_blockNumber", []);
  const n = BigInt(result); cacheSet("head", n, 6000); return n;
}

async function ethplorerLatest(address) {
  const u = `https://api.ethplorer.io/getAddressInfo/${address}?apiKey=freekey&token=${ZERO}&showETHTotals=false`;
  const j = await fetchJson(u, {});
  if (j.error || !j.ETH || j.ETH.rawBalance === undefined) throw new Error(`ethplorer: ${JSON.stringify(j.error || j).slice(0, 100)}`);
  return BigInt(j.ETH.rawBalance);
}

// ---------- main ----------
export async function answer(params, env = {}) {
  const req = parseRequest(params);
  const head = await headBlock(env);
  let blockNum;
  if (req.block === "latest") blockNum = head;
  else {
    if (req.block > head) throw new ServiceError(400, "FUTURE_BLOCK", `block ${req.block} is after the current head ${head}`);
    blockNum = req.block;
  }
  const isLatest = req.block === "latest";
  const key = `${req.metric}|${req.address}|${req.token || ""}|${isLatest ? "latest" : blockNum}`;
  const hit = cacheGet(key); if (hit) return { ...hit, cached: true };

  const out = { ok: true, metric: req.metric, address: req.address, block: isLatest ? "latest" : Number(blockNum), block_number: Number(blockNum) };
  const tag = hex(blockNum);

  if (req.metric === "eth_balance") {
    let wei, source;
    if (isLatest) {
      try { wei = await ethplorerLatest(req.address); source = "api.ethplorer.io"; out.block_number = null; out.block_note = `latest state; chain head was ${head}`; }
      catch (e) { const r = await rpc(env, "eth_getBalance", [req.address, tag]); wei = BigInt(r.result); source = r.source; }
    } else {
      const r = await rpc(env, "eth_getBalance", [req.address, tag]); wei = BigInt(r.result); source = r.source;
    }
    Object.assign(out, { value: weiToEth(wei), unit: "ETH", balance_wei: wei.toString(), balance_eth: weiToEth(wei), source });
  } else if (req.metric === "tx_count") {
    const r = await rpc(env, "eth_getTransactionCount", [req.address, tag]);
    Object.assign(out, { value: BigInt(r.result).toString(), unit: "transactions (nonce)", source: r.source });
  } else if (req.metric === "code") {
    const r = await rpc(env, "eth_getCode", [req.address, tag]);
    const size = (String(r.result).length - 2) / 2; // never return the bytecode itself (size cap)
    Object.assign(out, { value: size > 0, unit: "has_code", code_size_bytes: size, source: r.source });
  } else if (req.metric === "erc20_balance") {
    const data = "0x70a08231" + req.address.slice(2).padStart(64, "0"); // balanceOf(address)
    const r = await rpc(env, "eth_call", [{ to: req.token, data }, tag]);
    const raw = BigInt(r.result === "0x" ? "0x0" : r.result);
    let decimals = null;
    try { const d = await rpc(env, "eth_call", [{ to: req.token, data: "0x313ce567" }, tag]); decimals = Number(BigInt(d.result)); } catch {}
    Object.assign(out, { token: req.token, value: decimals === null ? raw.toString() : scale(raw, decimals), unit: decimals === null ? "raw token units" : "tokens", raw_balance: raw.toString(), decimals, source: r.source });
  }
  out.as_of = new Date().toISOString();
  cacheSet(key, out, isLatest ? 15000 : 0); // historical answers never change
  return out;
}

export function errorBody(e) {
  const status = e instanceof ServiceError ? e.status : 502;
  return { status, body: { ok: false, error: e instanceof ServiceError ? e.code : "UPSTREAM_ERROR", message: String(e.message || e).slice(0, 500) } };
}

// Serialize with a hard size cap; anything bigger becomes an explicit error, never a truncated answer.
export function serialize(obj) {
  let s = JSON.stringify(obj);
  if (new TextEncoder().encode(s).length > MAX_BYTES) s = JSON.stringify({ ok: false, error: "ANSWER_TOO_LARGE", message: `answer exceeded ${MAX_BYTES} bytes` });
  return s;
}

export async function handle(url, env = {}) {
  const u = new URL(url);
  if (u.pathname === "/health") return { status: 200, text: serialize({ ok: true }) };
  if (u.pathname !== "/query") return { status: 404, text: serialize({ ok: false, error: "NOT_FOUND", message: "use GET /query?address=0x..&block_number=..&metric=eth_balance" }) };
  try { return { status: 200, text: serialize(await answer(u.searchParams, env)) }; }
  catch (e) { const { status, body } = errorBody(e); return { status, text: serialize(body) }; }
}
