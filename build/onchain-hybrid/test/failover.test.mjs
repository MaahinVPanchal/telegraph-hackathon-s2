// Offline failover tests with a mock fetch: no network. Run: node test/failover.test.mjs
// Uses the production deadline (8 s total, 2.5 s per attempt, 2-way hedge).
import { handle, clearCache, DEFAULT_ARCHIVE_RPCS, REQUEST_DEADLINE_MS } from "../src/core.mjs";

const ADDR = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const HEAD = 23_600_000;
const SECRET = "https://eth-mainnet.g.alchemy.com/v2/SUPERSECRETKEY123";
const host = (u) => new URL(u).host;
const ok = (id, result) => new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { status: 200 });
const hang = (init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
// Abortable delay: resolves after ms, or rejects with AbortError the moment the
// worker's attempt signal fires — mirroring what a real fetch does.
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(Object.assign(new Error("aborted"), { name: "AbortError" })); return; }
  const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
  const onAbort = () => { cleanup(); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); };
  const cleanup = () => { clearTimeout(timer); signal?.removeEventListener?.("abort", onAbort); };
  signal?.addEventListener?.("abort", onAbort);
});

// Healthy JSON-RPC behaviour, used by providers a test marks as good.
function good(init) {
  const { method } = JSON.parse(init.body);
  if (method === "eth_chainId") return ok(1, "0x1");
  if (method === "eth_blockNumber") return ok(1, "0x" + HEAD.toString(16));
  if (method === "eth_getBalance") return ok(1, "0xd54076909a93bad129");
  if (method === "eth_getTransactionCount") return ok(1, "0x463");
  return ok(1, "0x");
}
function mock(behaviour) { // behaviour(hostLabel, init) -> Response | Promise
  const calls = [];
  const f = async (url, init = {}) => { calls.push(host(url)); return behaviour(host(url), init, url); };
  return { f, calls };
}

const logs = [];
const realLog = console.log;
const results = [];
async function run(name, { env = {}, behaviour, query = `address=${ADDR}&block_number=18000000`, expect }) {
  clearCache(); logs.length = 0;
  if (!new URLSearchParams(query).has("chain")) query += "&chain=ethereum";
  const m = mock(behaviour);
  console.log = (s) => logs.push(s);
  const t0 = Date.now();
  let r; try { r = await handle(`http://x/query?${query}`, env, { fetch: m.f, requestId: "test-" + results.length }); } finally { console.log = realLog; }
  const ms = Date.now() - t0;
  const j = JSON.parse(r.text); const log = JSON.parse(logs[0]);
  let pass, why = "";
  try { pass = expect({ status: r.status, j, ms, calls: m.calls, log, raw: r.text + logs.join("\n") }); } catch (e) { pass = false; why = e.message; }
  results.push({ name, pass, ms });
  realLog(`${pass ? "PASS" : "FAIL"} ${name} — HTTP ${r.status}, ${ms} ms, ${m.calls.length} upstream calls ${why}\n     resp ${r.text}\n     log  ${logs[0]}`);
}

const P = DEFAULT_ARCHIVE_RPCS.map(host);

await run("all RPCs fail fast (503) -> 504 NO_ARCHIVE_SOURCE, quick", {
  behaviour: () => new Response("down", { status: 503 }),
  expect: ({ status, j, ms, log }) => status === 504 && j.error === "NO_ARCHIVE_SOURCE" && ms < 1000 && log.attempts === P.length && log.status === 504,
});

await run(`all ${P.length} RPCs hang -> 504 at the 8 s total deadline`, {
  behaviour: (_h, init) => hang(init),
  expect: ({ status, j, ms }) => status === 504 && j.error === "DEADLINE_EXCEEDED" && ms >= REQUEST_DEADLINE_MS - 100 && ms < REQUEST_DEADLINE_MS + 500,
});

await run("all RPCs hang + ARCHIVE_RPC_URL set (7 providers > deadline) -> DEADLINE_EXCEEDED at 8 s", {
  env: { ARCHIVE_RPC_URL: SECRET },
  behaviour: (_h, init) => hang(init),
  expect: ({ status, j, ms }) => status === 504 && j.error === "DEADLINE_EXCEEDED" && ms >= REQUEST_DEADLINE_MS - 100 && ms < REQUEST_DEADLINE_MS + 500,
});

await run("all RPCs hang + ARCHIVE_RPC_URL set, latest eth_balance, Ethplorer hangs too -> 504 within deadline", {
  env: { ARCHIVE_RPC_URL: SECRET },
  query: `address=${ADDR}`,
  behaviour: (_h, init) => hang(init),
  expect: ({ status, ms }) => status === 504 && ms < REQUEST_DEADLINE_MS + 500,
});

await run("first RPC hangs -> second (hedged in parallel) answers, no wait for the 2.5 s timeout", {
  behaviour: (h, init) => (h === P[0] ? hang(init) : good(init)),
  expect: ({ status, j, ms, log }) => status === 200 && j.balance_wei === "3933801546759391596841" && j.block === 18000000 && j.block_tag === "number" && ms < 500 && log.source === P[1],
});

await run("first two RPCs hang -> third answers after bounded head and state checks", {
  behaviour: (h, init) => (h === P[0] || h === P[1] ? hang(init) : good(init)),
  expect: ({ status, ms, log }) => status === 200 && ms >= 4800 && ms < 6000 && log.source === P[2],
});

await run("429 on first RPC -> next RPC answers", {
  behaviour: (h, init) => (h === P[0] ? new Response("Too Many Requests", { status: 429 }) : h === P[1] ? hang(init) : good(init)),
  expect: ({ status, j, log, calls }) => status === 200 && j.block === 18000000 && log.source === P[2] && calls.includes(P[2]) && log.rpc_failures.some((f) => f.reason === "rate_limited" && f.rpc === P[0]),
});

await run("JSON-RPC error (pruned node) -> next RPC", {
  behaviour: (h, init) => (h === P[0] ? new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "missing trie node" } })) : h === P[1] ? hang(init) : good(init)),
  expect: ({ status, log }) => status === 200 && log.rpc_failures.some((f) => f.reason === "no_archive"),
});

// Regression (2026-11-12): Arbitrum archive total_supply against the free public
// RPCs — these are the exact 4xx bodies reproduced in production. Realistic
// per-method behaviour: providers pass eth_chainId and eth_blockNumber and fail
// ONLY the historical eth_call; they never answer it with latest state. The
// official arb1 endpoint (recent archive window, no SLA) must answer after
// failover, and both 4xx bodies must classify as no_archive (dRPC's "first
// available state" previously fell into "network").
await run("arbitrum archive total_supply: providers pass chain-ID/head, reject only the historical eth_call -> arb1 answers, classified no_archive", {
  query: `chain=arbitrum-one&metric=total_supply&token=0x912CE59144191C1204E64559FE8253a0e49E6548&block_number=${HEAD - 1000}`,
  behaviour: (h, init) => {
    const { method, params } = JSON.parse(init.body);
    if (method === "eth_chainId") return ok(1, "0xa4b1");
    if (method === "eth_blockNumber") return ok(1, "0x" + HEAD.toString(16));
    if (h === "arbitrum.publicnode.com") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Archive requests require a personal token. Get one at: https://www.allnodes.com/publicnode" } }), { status: 403 });
    if (h === "arbitrum.drpc.org") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "Unknown state. First available state is 1", code: 27 } }), { status: 400 });
    if (method === "eth_call") return ok(1, params?.[0]?.data === "0x313ce567" ? "0x06" : "0x00000000000000000000000000000000000000000000000056bc75e2d63100000");
    return ok(1, "0x");
  },
  expect: ({ status, j, log, raw }) => status === 200 && log.source === "arb1.arbitrum.io" &&
    j.block === HEAD - 1000 && j.block_tag === "number" &&
    log.rpc_failures.filter((f) => f.rpc !== "arb1.arbitrum.io").every((f) => f.reason === "no_archive") &&
    log.rpc_failures.length >= 2 &&
    !raw.includes("allnodes.com") && !raw.includes("Archive requests") && !raw.includes("First available state"),
});

await run("arbitrum archive: publicnode rejects fast + drpc hangs + delayed arb1 answers -> 200 within the 8 s budget", {
  query: `chain=arbitrum-one&metric=total_supply&token=0x912CE59144191C1204E64559FE8253a0e49E6548&block_number=${HEAD - 1000}`,
  behaviour: async (h, init) => {
    const { method, params } = JSON.parse(init.body);
    if (method === "eth_chainId") return ok(1, "0xa4b1");
    if (method === "eth_blockNumber") return ok(1, "0x" + HEAD.toString(16));
    if (h === "arbitrum.publicnode.com") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Archive requests require a personal token." } }), { status: 403 });
    if (h === "arbitrum.drpc.org") return hang(init);
    if (method === "eth_call") { await sleep(2000, init.signal); return ok(1, params?.[0]?.data === "0x313ce567" ? "0x06" : "0x00000000000000000000000000000000000000000000000056bc75e2d63100000"); }
    return ok(1, "0x");
  },
  expect: ({ status, ms, log, j }) => status === 200 && ms >= 1900 && ms < REQUEST_DEADLINE_MS &&
    log.source === "arb1.arbitrum.io" && j.block === HEAD - 1000 && j.block_tag === "number",
});

await run("arbitrum archive: cumulative sub-limit delays (slow head 2.3 s, arb1 chainId+call 2.3 s each) cross the shared 8 s budget -> 200 with the decimals sub-call honestly labeled unavailable", {
  query: `chain=arbitrum-one&metric=total_supply&token=0x912CE59144191C1204E64559FE8253a0e49E6548&block_number=${HEAD - 1000}`,
  behaviour: async (h, init) => {
    const { method, params } = JSON.parse(init.body);
    if (method === "eth_chainId") { if (h === "arb1.arbitrum.io") await sleep(2300, init.signal); return ok(1, "0xa4b1"); }
    if (method === "eth_blockNumber") { await sleep(2300, init.signal); return ok(1, "0x" + HEAD.toString(16)); }
    if (h === "arbitrum.publicnode.com" || h === "arbitrum.drpc.org") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Archive requests require a personal token." } }), { status: 403 });
    if (method === "eth_call") { await sleep(2300, init.signal); return ok(1, params?.[0]?.data === "0x313ce567" ? "0x06" : "0x00000000000000000000000000000000000000000000000056bc75e2d63100000"); }
    return ok(1, "0x");
  },
  // Boundary timing decides which label the cut decimals sub-call carries: the
  // shared-deadline timer yields DEADLINE_EXCEEDED; the failover path exhausting
  // the provider list a moment earlier yields NO_ARCHIVE_SOURCE. Both mean the
  // same thing — no decimals evidence, request fails closed, the already-obtained
  // raw supply answer is preserved and explicitly marked.
  expect: ({ status, j, ms }) => status === 200 && j.block === HEAD - 1000 && j.block_tag === "number" &&
    j.raw_total_supply === "100000000000000000000" && j.decimals === null &&
    (j.decimals_error === "DEADLINE_EXCEEDED" || j.decimals_error === "NO_ARCHIVE_SOURCE") &&
    ms >= REQUEST_DEADLINE_MS - 100 && ms < REQUEST_DEADLINE_MS + 700,
});

await run("arbitrum archive: every attempt completes under the 2.5 s limit but no provider can answer -> 504 NO_ARCHIVE_SOURCE, failed closed", {
  query: `chain=arbitrum-one&metric=total_supply&token=0x912CE59144191C1204E64559FE8253a0e49E6548&block_number=${HEAD - 1000}`,
  behaviour: async (h, init) => {
    const { method, params } = JSON.parse(init.body);
    if (method === "eth_chainId") { if (h === "arb1.arbitrum.io") await sleep(2400, init.signal); return ok(1, "0xa4b1"); }
    if (method === "eth_blockNumber") return ok(1, "0x" + HEAD.toString(16));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: h === "arbitrum.drpc.org" ? "Unknown state. First available state is 1" : "Archive requests require a personal token." } }), { status: h === "arbitrum.drpc.org" ? 400 : 403 });
  },
  expect: ({ status, j, ms, log }) => status === 504 && j.error === "NO_ARCHIVE_SOURCE" && ms < 6000 &&
    log.rpc_failures.length >= 3 && log.rpc_failures.every((f) => f.reason === "no_archive"),
});

await run("arbitrum archive: the delayed mock respects attempt cancellation -> aborted at the 2.5 s attempt limit, 504 NO_ARCHIVE_SOURCE ~2.5 s", {
  query: `chain=arbitrum-one&metric=total_supply&token=0x912CE59144191C1204E64559FE8253a0e49E6548&block_number=${HEAD - 1000}`,
  behaviour: async (h, init) => {
    const { method, params } = JSON.parse(init.body);
    if (method === "eth_chainId") return ok(1, "0xa4b1");
    if (method === "eth_blockNumber") return ok(1, "0x" + HEAD.toString(16));
    if (h === "arbitrum.publicnode.com" || h === "arbitrum.drpc.org") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Archive requests require a personal token." } }), { status: 403 });
    if (method === "eth_call") { await sleep(9500, init.signal); return ok(1, params?.[0]?.data === "0x313ce567" ? "0x06" : "0x00000000000000000000000000000000000000000000000056bc75e2d63100000"); }
    return ok(1, "0x");
  },
  expect: ({ status, j, ms, log }) => status === 504 && j.error === "NO_ARCHIVE_SOURCE" &&
    ms >= 2400 && ms < 4500 && log.attempts >= 3,
});

await run("arbitrum archive: all three providers reject the historical eth_call -> 504 NO_ARCHIVE_SOURCE fast, all no_archive", {
  query: `chain=arbitrum-one&metric=total_supply&token=0x912CE59144191C1204E64559FE8253a0e49E6548&block_number=${HEAD - 1000}`,
  behaviour: (h, init) => {
    const { method } = JSON.parse(init.body);
    if (method === "eth_chainId") return ok(1, "0xa4b1");
    if (method === "eth_blockNumber") return ok(1, "0x" + HEAD.toString(16));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: h === "arbitrum.drpc.org" ? "Unknown state. First available state is 1" : "Archive requests require a personal token." } }), { status: h === "arbitrum.drpc.org" ? 400 : 403 });
  },
  expect: ({ status, j, ms, log }) => status === 504 && j.error === "NO_ARCHIVE_SOURCE" && ms < 2000 &&
    log.rpc_failures.every((f) => f.reason === "no_archive"),
});

await run("ARCHIVE_RPC_URL tried first; key never in response or log", {
  env: { ARCHIVE_RPC_URL: SECRET },
  behaviour: (h, init) => (h === host(SECRET) ? new Response("bad key", { status: 401 }) : h === P[0] ? hang(init) : good(init)),
  expect: ({ status, raw, log }) => status === 200 && !raw.includes("SUPERSECRETKEY123") && !raw.includes("alchemy") && log.rpc_failures[0].rpc === "ARCHIVE_RPC_URL#1",
});

// Chain-specific archive override (P5): reaches only the named chain, never the
// others — unlike the global ARCHIVE_RPC_URL, which would be raced (and fail the
// chain-ID check) for Ethereum and Polygon too.
await run("ARCHIVE_RPC_URL_ARBITRUM_ONE is prepended for arbitrum only; secret never leaks", {
  env: { ARCHIVE_RPC_URL_ARBITRUM_ONE: SECRET },
  query: `chain=arbitrum-one&metric=total_supply&token=0x912CE59144191C1204E64559FE8253a0e49E6548&block_number=${HEAD - 1000}`,
  behaviour: (h, init) => {
    if (h === host(SECRET)) return new Response("bad key", { status: 401 });
    const { method, params } = JSON.parse(init.body);
    if (method === "eth_chainId") return ok(1, "0xa4b1");
    if (method === "eth_blockNumber") return ok(1, "0x" + HEAD.toString(16));
    if (method === "eth_call") return ok(1, params?.[0]?.data === "0x313ce567" ? "0x06" : "0x00000000000000000000000000000000000000000000000056bc75e2d63100000");
    return ok(1, "0x");
  },
  expect: ({ status, raw, log }) => status === 200 && !raw.includes("SUPERSECRETKEY123") &&
    !raw.includes("arb-keyed-endpoint") && log.rpc_failures[0].rpc === "ARCHIVE_RPC_URL_ARBITRUM_ONE#1",
});

await run("chain-specific archive override is not raced for ethereum", {
  env: { ARCHIVE_RPC_URL_ARBITRUM_ONE: "https://arb-keyed-endpoint.example/v3/secret" },
  query: `address=${ADDR}&block_number=18000000`,
  behaviour: (h, init) => {
    if (h === "arb-keyed-endpoint.example") return new Response("must not be called", { status: 500 });
    return good(init);
  },
  expect: ({ status, log, calls }) => status === 200 && !calls.includes("arb-keyed-endpoint.example") &&
    !(log.rpc_failures ?? []).some((f) => f.rpc.includes("arb-keyed-endpoint")),
});

await run("ARCHIVE_RPC_URL-only failure message is label-only (all fail)", {
  env: { ARCHIVE_RPC_URL: SECRET },
  behaviour: () => new Response("x", { status: 500 }),
  expect: ({ status, raw }) => status === 504 && !raw.includes("SUPERSECRETKEY123") && !raw.includes("alchemy"),
});

await run("future block -> 400 FUTURE_BLOCK (selected-chain head preflight)", {
  query: `address=${ADDR}&block_number=999999999`,
  behaviour: (_h, init) => {
    const { method } = JSON.parse(init.body);
    if (method === "eth_chainId") return good(init);
    return method === "eth_blockNumber" ? good(init) : new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "header not found" } }));
  },
  expect: ({ status, j }) => status === 400 && j.error === "FUTURE_BLOCK",
});

await run("latest resolves to an integer block via eth_blockNumber", {
  query: `address=${ADDR}&block_number=latest`,
  behaviour: (_h, init) => good(init),
  expect: ({ j, log }) => j.block === HEAD && j.block_tag === "latest" && log.block === HEAD && log.block_tag === "latest",
});

await run("latest eth_balance with all RPCs down -> Ethplorer, block from getLastBlock", {
  query: `address=${ADDR}`,
  behaviour: (h, _init, url) => {
    if (h !== "api.ethplorer.io") return new Response("x", { status: 503 });
    if (url.includes("getLastBlock")) return new Response(JSON.stringify({ lastBlock: HEAD - 1 }));
    return new Response(JSON.stringify({ address: ADDR, ETH: { balance: 1.5, rawBalance: "1500000000000000000" } }));
  },
  expect: ({ status, j }) => status === 200 && j.block === HEAD - 1 && j.block_tag === "latest" && j.source === "api.ethplorer.io" && j.balance_eth === "1.5",
});

await run("log line has the required fields", {
  behaviour: (_h, init) => good(init),
  expect: ({ log }) => ["ts", "req_id", "address", "block", "metric", "source", "attempts", "latency_ms", "status", "bytes"].every((k) => k in log),
});

// Local CPU proxy (NOT a Cloudflare measurement): JS CPU per request with instant mock upstreams.
{
  const N = 500; const m = mock((_h, init) => good(init));
  clearCache(); const c0 = process.cpuUsage();
  for (let i = 0; i < N; i++) await handle(`http://x/query?address=${ADDR}&block_number=${18000000 + i}`, {}, { fetch: m.f, quiet: true });
  const c = process.cpuUsage(c0);
  realLog(`\nlocal CPU proxy: ${((c.user + c.system) / 1000 / N).toFixed(3)} ms CPU per uncached request (Node ${process.version}, mock upstreams; Workers free limit is 10 ms - verify with a real deploy)`);
}
const worst = Math.max(...results.map((r) => r.ms));
const failed = results.filter((r) => !r.pass).length;
realLog(`\nworst-case request time across failover tests: ${worst} ms (deadline ${REQUEST_DEADLINE_MS} ms)`);
realLog(failed ? `${failed} failed` : `all ${results.length} failover tests passed`);
process.exit(failed ? 1 : 0);
