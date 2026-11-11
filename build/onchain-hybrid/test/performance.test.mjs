import { handle, clearCache, CHAINS } from "../src/core.mjs";

const ADDRESS = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const TX_HASH = `0x${"a".repeat(64)}`;
const BLOCK_HASH = `0x${"b".repeat(64)}`;
const endpointChain = new Map(Object.entries(CHAINS).flatMap(([name, config]) =>
  config.rpcs.map((url) => [new URL(url).host, name])));
const iterations = 20;
const outcomes = { passed: 0, failed: 0 };

function response(result) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
}

function fetchFixture(url, init) {
  const chain = endpointChain.get(new URL(url).host);
  const { method, params } = JSON.parse(init.body);
  if (method === "eth_chainId") {
    const id = { ethereum: "0x1", polygon: "0x89", "arbitrum-one": "0xa4b1" }[chain];
    return Promise.resolve(response(id));
  }
  if (method === "eth_blockNumber") return Promise.resolve(response("0x100"));
  if (method === "eth_getBalance") return Promise.resolve(response("0x1234"));
  if (method === "eth_getTransactionCount") return Promise.resolve(response("0x2"));
  if (method === "eth_getCode") return Promise.resolve(response("0x6000"));
  if (method === "eth_call") {
    if (params[0].data === "0x313ce567") return Promise.resolve(response("0x6"));
    if (params[0].data === "0x18160ddd") return Promise.resolve(response("0x123456"));
    return Promise.resolve(response("0xabcdef"));
  }
  if (method === "eth_getTransactionByHash") {
    return Promise.resolve(response({ hash: TX_HASH, from: ADDRESS, to: TOKEN, value: "0x0", nonce: "0x1", blockNumber: "0x64", blockHash: BLOCK_HASH }));
  }
  if (method === "eth_getTransactionReceipt") {
    return Promise.resolve(response({
      transactionHash: TX_HASH, blockNumber: "0x64", blockHash: BLOCK_HASH,
      status: "0x1", gasUsed: "0x5208", effectiveGasPrice: "0x5",
    }));
  }
  if (method === "eth_getLogs") {
    return Promise.resolve(response([{
      address: TOKEN, topics: [BLOCK_HASH], data: "0x", blockNumber: "0x64",
      blockHash: BLOCK_HASH, transactionHash: TX_HASH, transactionIndex: "0x0", logIndex: "0x0",
    }]));
  }
  throw new Error(`unexpected mock RPC method ${method}`);
}

function percentile(samples, p) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}

const specs = [
  ["eth_balance", (chain) => `metric=eth_balance&address=${ADDRESS}&chain=${chain}` , true],
  ["tx_count", (chain) => `metric=tx_count&address=${ADDRESS}&chain=${chain}`, true],
  ["code", (chain) => `metric=code&address=${ADDRESS}&chain=${chain}`, true],
  ["erc20_balance", (chain) => `metric=erc20_balance&address=${ADDRESS}&token=${TOKEN}&chain=${chain}`, true],
  ["total_supply", (chain) => `metric=total_supply&token=${TOKEN}&block=100&chain=${chain}`, false],
  ["tx_receipt", (chain) => `metric=tx_receipt&tx_hash=${TX_HASH}&chain=${chain}`, false],
  ["logs", (chain) => `metric=logs&from_block=90&to_block=100&address=${TOKEN}&topic0=${BLOCK_HASH}&chain=${chain}`, false],
];

console.log(`Local synthetic-fetch service benchmark only; ${iterations} samples per cold/warm phase. Not RPC latency or mission SLA evidence.`);
for (const chain of Object.keys(CHAINS)) {
  for (const [metric, query, cacheable] of specs) {
    const cold = [];
    const warm = [];
    let warmCacheStatus;
    for (let i = 0; i < iterations; i++) {
      clearCache();
      const url = `https://synthetic.invalid/query?${query(chain)}`;
      const startCold = performance.now();
      const coldResponse = await handle(url, {}, { fetch: fetchFixture, quiet: true });
      cold.push(performance.now() - startCold);
      let valid = coldResponse.status === 200 && JSON.parse(coldResponse.text).ok === true;
      const startWarm = performance.now();
      const warmResponse = await handle(url, {}, { fetch: fetchFixture, quiet: true });
      warm.push(performance.now() - startWarm);
      const warmBody = JSON.parse(warmResponse.text);
      valid = valid && warmResponse.status === 200 && warmBody.ok === true;
      warmCacheStatus = warmBody.cached === true;
      valid = valid && warmCacheStatus === cacheable;
      if (valid) outcomes.passed++;
      else outcomes.failed++;
    }
    console.log(`MEASURE ${chain}/${metric} ` +
      `cold p50=${percentile(cold, 0.50).toFixed(3)}ms p95=${percentile(cold, 0.95).toFixed(3)}ms; ` +
      `warm p50=${percentile(warm, 0.50).toFixed(3)}ms p95=${percentile(warm, 0.95).toFixed(3)}ms; ` +
      `warm_mode=${cacheable ? "bounded-result-cache" : "fresh-upstream-read"}`);
  }
}
console.log(`performance benchmark assertions: ${outcomes.passed} passed, ${outcomes.failed} failed`);
process.exit(outcomes.failed ? 1 : 0);
