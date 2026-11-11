import { handle, clearCache, CHAINS, MAX_BYTES } from "../src/core.mjs";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045".toLowerCase();
const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const HASH = `0x${"a".repeat(64)}`;
const chainIds = { ethereum: "0x1", polygon: "0x89", "arbitrum-one": "0xa4b1" };
const endpointChain = new Map(Object.entries(CHAINS).flatMap(([name, config]) =>
  config.rpcs.map((rpc) => [new URL(rpc).host, name])));
let passed = 0;
let failed = 0;

const check = (name, condition, detail = "") => {
  if (condition) passed++;
  else failed++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

function fixture(options = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const chain = endpointChain.get(new URL(url).host);
    const request = JSON.parse(init.body);
    calls.push({ chain, method: request.method, params: request.params });
    if (options.unavailable) return new Response("unavailable", { status: 503 });
    if (request.method === "eth_chainId") {
      const result = options.chainIdMismatch ? "0x1" : chainIds[chain];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    }
    if (request.method === "eth_blockNumber") {
      const head = options.heads?.[chain] ?? 100n;
      return ok("0x" + BigInt(head).toString(16));
    }
    if (request.method === "eth_getBalance") {
      return ok("0x" + BigInt(options.balances?.[chain] ?? 7n).toString(16));
    }
    if (request.method === "eth_getTransactionCount") return ok("0x57d");
    if (request.method === "eth_getCode") return ok("0x60006000");
    if (request.method === "eth_call") {
      const callData = request.params[0].data;
      if (callData === "0x18160ddd") return ok("0x" + BigInt(options.totalSupply ?? 1_234_567n).toString(16));
      if (callData === "0x313ce567") {
        if (options.decimalsUnavailable) {
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "decimals unavailable" } }), { status: 200 });
        }
        return ok("0x" + BigInt(options.decimals ?? 6).toString(16));
      }
      const token = request.params[0].to.toLowerCase();
      return ok("0x" + BigInt(options.tokenBalances?.[token] ?? options.tokenBalance ?? 690_075n).toString(16));
    }
    if (request.method === "eth_getTransactionByHash") return ok(options.transaction ?? null);
    if (request.method === "eth_getTransactionReceipt") return ok(options.receipt ?? null);
    if (request.method === "eth_getLogs") return ok(options.logs ?? []);
    throw new Error(`unexpected synthetic RPC method ${request.method}`);
  };
  return { fetch, calls };
}

function ok(result) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
}

async function request(query, fetch, { clear = true, env = {} } = {}) {
  if (clear) clearCache();
  const result = await handle(`https://synthetic.invalid/query?${query}`, env, { fetch, quiet: true });
  return { status: result.status, body: JSON.parse(result.text), bytes: new TextEncoder().encode(result.text).length };
}

console.log("Synthetic deterministic fixtures only; no live endpoint evidence is represented by this suite.");

let f = fixture();
let r = await request(`address=${ADDRESS}&block=10`, f.fetch);
check("missing chain is rejected before RPC", r.status === 400 && r.body.error === "CHAIN_REQUIRED" && f.calls.length === 0);
r = await request(`address=${ADDRESS}&block=10&chain_id=137`, f.fetch);
check("chain_id alone selects its explicit chain alias",
  r.status === 200 && r.body.chain === "polygon" && r.body.chain_id === 137);
r = await request(`address=${ADDRESS}&block=10&chain=ethereum&chain_id=137`, f.fetch);
check("conflicting chain aliases are rejected", r.status === 400 && r.body.error === "CONFLICTING_CHAIN");
r = await request(`address=${ADDRESS}&block=10&chain=optimism`, f.fetch);
check("unsupported chain is rejected", r.status === 400 && r.body.error === "UNSUPPORTED_CHAIN");
r = await request(`address=${ADDRESS}&block=10&chain=ethereum&question=what%20is%20this`, f.fetch);
check("question text is not silently ignored", r.status === 400 && r.body.error === "QUESTION_UNSUPPORTED");
f = fixture();
r = await request(`address=${ADDRESS}&block=10&chain=ethereum&rpc_url=https%3A%2F%2Fexample.invalid`, f.fetch);
check("caller-supplied RPC URL is rejected", r.status === 400 && r.body.error === "RPC_URL_NOT_ALLOWED" && f.calls.length === 0);

f = fixture({ chainIdMismatch: true });
r = await request(`address=${ADDRESS}&block=10&chain=polygon`, f.fetch);
check("all providers with wrong eth_chainId are rejected", r.status === 502 && r.body.error === "CHAIN_ID_MISMATCH"
  && f.calls.length > 0 && f.calls.every((call) => call.method === "eth_chainId"));

f = fixture({ heads: { ethereum: 100n, polygon: 200n }, balances: { ethereum: 1n, polygon: 2n } });
const eth = await request(`address=${ADDRESS}&block=10&chain=ethereum`, f.fetch);
const ethCalls = f.calls.length;
const polygon = await request(`address=${ADDRESS}&block=10&chain=polygon`, f.fetch, { clear: false });
check("same address and block return their own chain values",
  eth.body.balance_wei === "1" && polygon.body.balance_wei === "2"
    && eth.body.chain === "ethereum" && polygon.body.chain === "polygon"
    && polygon.body.chain_id === 137 && polygon.body.unit === "POL");
check("result and head caches are isolated by chain",
  polygon.body.cached !== true && f.calls.length > ethCalls
    && f.calls.some((call) => call.chain === "polygon" && call.method === "eth_blockNumber"));
const cacheCalls = f.calls.length;
const cached = await request(`address=${ADDRESS}&block=10&chain=polygon`, f.fetch, { clear: false });
check("identical request uses only its own cached result", cached.body.cached === true && f.calls.length === cacheCalls);
check("POL result does not claim an ETH/Gwei balance", !("balance_gwei" in polygon.body) && polygon.body.balance_native === polygon.body.value);

clearCache();
f = fixture({ heads: { ethereum: 100n, polygon: 200n } });
const ethFuture = await request(`address=${ADDRESS}&block=150&chain=ethereum`, f.fetch, { clear: false });
const polygonAtSameHeight = await request(`address=${ADDRESS}&block=150&chain=polygon`, f.fetch, { clear: false });
check("future block is checked against Ethereum head", ethFuture.status === 400 && ethFuture.body.error === "FUTURE_BLOCK");
check("same height is accepted below Polygon head", polygonAtSameHeight.status === 200 && polygonAtSameHeight.body.chain === "polygon");

f = fixture();
r = await request(`address=0x1234&block=10&chain=ethereum`, f.fetch);
check("malformed address rejected without a lookup", r.status === 400 && r.body.error === "INVALID_ADDRESS" && f.calls.length === 0);
r = await request(`metric=tx_receipt&tx_hash=0x123&chain=ethereum`, f.fetch);
check("malformed transaction hash rejected without a lookup", r.status === 400 && r.body.error === "INVALID_TX_HASH" && f.calls.length === 0);

f = fixture({ transaction: {
  from: ADDRESS, to: TOKEN, value: "0x2a", nonce: "0x7", blockNumber: null, gasPrice: "0x3",
}, receipt: null });
r = await request(`metric=tx_receipt&tx_hash=${HASH}&chain=arbitrum-one`, f.fetch);
check("pending transaction is explicitly pending, with chain evidence",
  r.status === 200 && r.body.ok && r.body.state === "pending" && r.body.block === null
    && r.body.chain_id === 42161 && r.body.transaction.value_wei === "42");
f = fixture();
r = await request(`metric=tx_receipt&tx_hash=${HASH}&chain=ethereum`, f.fetch);
check("missing transaction is an HTTP 404 failure", r.status === 404 && r.body.ok === false && r.body.error === "TRANSACTION_NOT_FOUND");
f = fixture({
  transaction: { from: ADDRESS, to: TOKEN, value: "0x0", nonce: "0x1", blockNumber: "0x64", gasPrice: "0x5" },
  receipt: { blockNumber: "0x64", status: "0x1", gasUsed: "0x5208", effectiveGasPrice: "0x5" },
});
r = await request(`metric=tx_receipt&tx_hash=${HASH}&chain=ethereum`, f.fetch);
check("mined receipt exposes distinct gas and exact fee fields",
  r.status === 200 && r.body.state === "mined" && r.body.receipt_status === 1
    && r.body.gas_used === "21000" && r.body.effective_gas_price_wei === "5"
    && r.body.fee_paid_wei === "105000" && r.body.sources.includes(r.body.source),
  JSON.stringify(r.body));

f = fixture();
r = await request(`metric=erc20_balance&address=${ADDRESS}&token=${TOKEN}&block=10&chain=polygon`, f.fetch);
check("ERC-20 balance uses token decimals and Polygon provenance",
  r.status === 200 && r.body.value === "0.690075" && r.body.raw_balance === "690075"
    && r.body.decimals === 6 && r.body.chain === "polygon" && r.body.chain_id === 137);
f = fixture({ decimalsUnavailable: true });
r = await request(`metric=total_supply&token=${TOKEN}&block=10&chain=arbitrum-one`, f.fetch);
check("totalSupply remains exact raw units when decimals are unavailable",
  r.status === 200 && r.body.raw_total_supply === "1234567" && r.body.value === "1234567"
    && r.body.unit === "raw token units" && r.body.decimals === null && r.body.decimals_error
    && r.body.supply_kind.includes("not circulating"));
f = fixture({ totalSupply: 987_654_321n, decimals: 6 });
r = await request(`metric=total_supply&token=${TOKEN}&block=10&chain=ethereum`, f.fetch);
check("totalSupply scales by token decimals without losing raw integer",
  r.status === 200 && r.body.value === "987.654321" && r.body.raw_total_supply === "987654321"
    && r.body.decimals === 6 && r.body.block === 10 && r.body.chain_id === 1);
f = fixture();
r = await request(`metric=total_supply&token=${TOKEN}&chain=ethereum`, f.fetch);
check("totalSupply requires a specific numbered block", r.status === 400 && r.body.error === "BLOCK_REQUIRED" && f.calls.length === 0);
r = await request(`metric=total_supply&token=${TOKEN}&block=latest&chain=ethereum`, f.fetch);
check("totalSupply does not silently replace a numbered block with latest", r.status === 400 && r.body.error === "BLOCK_REQUIRED");

const TOKEN_2 = "0x1111111111111111111111111111111111111111";
f = fixture({ tokenBalances: { [TOKEN]: 10n, [TOKEN_2]: 20n } });
const tokenOne = await request(`metric=erc20_balance&address=${ADDRESS}&token=${TOKEN}&block=10&chain=ethereum`, f.fetch);
const tokenTwo = await request(`metric=erc20_balance&address=${ADDRESS}&token=${TOKEN_2}&block=10&chain=ethereum`, f.fetch, { clear: false });
check("result cache includes token contract arguments",
  tokenOne.body.raw_balance === "10" && tokenTwo.body.raw_balance === "20" && tokenTwo.body.cached !== true);

f = fixture();
r = await request(`metric=logs&from_block=10&to_block=2011&address=${TOKEN}&chain=ethereum`, f.fetch);
check("oversized log range is rejected before RPC", r.status === 400 && r.body.error === "LOG_RANGE_TOO_LARGE" && f.calls.length === 0);
const sampleLog = { address: TOKEN, topics: [HASH], data: "0x", blockNumber: "0x14" };
f = fixture({ logs: [sampleLog] });
r = await request(`metric=logs&from_block=10&to_block=20&address=${TOKEN}&topic0=${HASH}&chain=polygon`, f.fetch);
check("bounded log query returns filters, values and provenance",
  r.status === 200 && r.body.count === 1 && r.body.logs[0].blockNumber === "0x14"
    && r.body.from_block === 10 && r.body.to_block === 20 && r.body.chain_id === 137
    && f.calls.some((call) => call.method === "eth_getLogs" && call.params[0].topics[0] === HASH));
clearCache();
f = fixture({ heads: { ethereum: 100n, polygon: 200n } });
const futureLogs = await request(`metric=logs&from_block=10&to_block=150&address=${TOKEN}&chain=ethereum`, f.fetch, { clear: false });
const polygonLogs = await request(`metric=logs&from_block=10&to_block=150&address=${TOKEN}&chain=polygon`, f.fetch, { clear: false });
check("log future-block validation uses the selected chain head",
  futureLogs.status === 400 && futureLogs.body.error === "FUTURE_BLOCK" && polygonLogs.status === 200 && polygonLogs.body.chain === "polygon");
f = fixture({ logs: Array.from({ length: 101 }, () => sampleLog) });
r = await request(`metric=logs&from_block=10&to_block=20&address=${TOKEN}&topic0=${HASH}&chain=ethereum`, f.fetch);
check("too many returned logs fail instead of truncating", r.status === 413 && r.body.error === "TOO_MANY_LOGS");
f = fixture({ logs: [{ ...sampleLog, data: `0x${"ab".repeat(2500)}` }] });
r = await request(`metric=logs&from_block=10&to_block=20&address=${TOKEN}&chain=ethereum`, f.fetch);
check("oversized serialized log answer returns HTTP 413", r.status === 413 && r.body.error === "ANSWER_TOO_LARGE" && r.bytes <= MAX_BYTES);

f = fixture({ unavailable: true });
r = await request(`address=${ADDRESS}&block=latest&chain=polygon`, f.fetch);
check("archive failure on Polygon never falls back to Ethereum Ethplorer",
  r.status === 504 && r.body.ok === false && !("balance_wei" in r.body)
    && f.calls.every((call) => call.chain === "polygon"));

const hangingFetch = (_url, init) => new Promise((_, reject) => {
  init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
});
r = await request(`address=${ADDRESS}&block=10&chain=ethereum`, hangingFetch, {
  env: { REQUEST_DEADLINE_MS: "80", ATTEMPT_TIMEOUT_MS: "20" },
});
check("bounded timeout returns an explicit HTTP 504 error", r.status === 504 && r.body.ok === false
  && ["DEADLINE_EXCEEDED", "NO_ARCHIVE_SOURCE"].includes(r.body.error));

console.log(`\nchain-ops: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
