import { handle, clearCache } from "../src/core.mjs";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const WEI = 1234567890n;
let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) passed++;
  else failed++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const mockRpc = async (_url, init) => {
  const { method } = JSON.parse(init.body);
  const result = method === "eth_chainId" ? "0x1" : method === "eth_blockNumber" ? "0x1406f40" : `0x${WEI.toString(16)}`;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
};

async function query(params, log = false, fetchImpl = mockRpc) {
  clearCache();
  if (!("chain" in params)) params = { ...params, chain: "ethereum" };
  const url = new URL("https://test/query");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const logs = [];
  const originalLog = console.log;
  if (log) console.log = (line) => logs.push(String(line));
  try {
    const response = await handle(url, {}, { fetch: fetchImpl, quiet: !log });
    return { ...response, body: JSON.parse(response.text), logs };
  } finally {
    if (log) console.log = originalLog;
  }
}

let result = await query({ address: ADDRESS, block: "21000000" });
check("Telegraph request shape returns scored balance field", result.status === 200
  && result.body.balance_gwei === 1.234567
  && result.body.chain === "ethereum"
  && result.body.block === 21000000, JSON.stringify(result.body));
check("exact wei remains available", result.body.balance_wei === WEI.toString());

const fallbackRpc = async (url) => {
  if (String(url).includes("/getAddressInfo/")) {
    return new Response(JSON.stringify({ ETH: { rawBalance: WEI.toString() } }), { status: 200 });
  }
  if (String(url).includes("/getLastBlock")) {
    return new Response(JSON.stringify({ lastBlock: 21000000 }), { status: 200 });
  }
  return new Response("upstream unavailable", { status: 503 });
};
result = await query({ address: ADDRESS }, false, fallbackRpc);
check("Ethplorer fallback includes scored fields",
  result.status === 200 && result.body.balance_gwei === 1.234567 && result.body.chain === "ethereum");

for (const [name, address] of [
  ["bare 40-hex address normalized", ADDRESS.slice(2)],
  ["uppercase 0X prefix normalized", `0X${ADDRESS.slice(2)}`],
  ["quoted address normalized", `"${ADDRESS}"`],
]) {
  result = await query({ address, block: "21000000" });
  check(name, result.status === 200 && result.body.ok === true);
}

for (const [name, address] of [
  ["ENS remains rejected", "vitalik.eth"],
  ["96-hex garbage is not truncated", "1234567890abcdef".repeat(6)],
  ["wrong length remains rejected", `0x${"a".repeat(41)}`],
]) {
  result = await query({ address, block: "21000000" });
  check(name, result.status === 400 && result.body.error === "INVALID_ADDRESS"
    && !("balance_wei" in result.body) && !("balance_gwei" in result.body) && !("value" in result.body));
}

result = await query({ address: "0Xbad-address", block: "21000000" }, true);
const log = JSON.parse(result.logs[0]);
check("invalid address is recorded in bounded diagnostic logs",
  log.error === "INVALID_ADDRESS" && log.raw_address === "0Xbad-address");
const longGarbage = "x".repeat(10000);
result = await query({ address: longGarbage, block: "21000000" }, true);
const longLog = JSON.parse(result.logs[0]);
check("10,000-char address is rejected before upstream access",
  result.status === 400 && result.body.error === "INVALID_ADDRESS");
check("long raw address log has bounded prefix and total-length marker",
  longLog.raw_address === `${longGarbage.slice(0, 128)}...[truncated, len=${longGarbage.length}]`);

console.log(`\naddress-contract: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
