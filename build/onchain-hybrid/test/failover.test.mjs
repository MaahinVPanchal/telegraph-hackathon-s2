// Offline failover tests with a mock fetch: no network. Run: node test/failover.test.mjs
// Uses the production deadline (8 s total, 2.5 s per attempt, 2-way hedge).
import { handle, clearCache, DEFAULT_ARCHIVE_RPCS, REQUEST_DEADLINE_MS } from "../src/core.mjs";

const ADDR = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const HEAD = 23_600_000;
const SECRET = "https://eth-mainnet.g.alchemy.com/v2/SUPERSECRETKEY123";
const host = (u) => new URL(u).host;
const ok = (id, result) => new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { status: 200 });
const hang = (init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));

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

await run("ARCHIVE_RPC_URL tried first; key never in response or log", {
  env: { ARCHIVE_RPC_URL: SECRET },
  behaviour: (h, init) => (h === host(SECRET) ? new Response("bad key", { status: 401 }) : h === P[0] ? hang(init) : good(init)),
  expect: ({ status, raw, log }) => status === 200 && !raw.includes("SUPERSECRETKEY123") && !raw.includes("alchemy") && log.rpc_failures[0].rpc === "ARCHIVE_RPC_URL#1",
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
