// Live test against real upstreams: starts the Node server on a free port and replays
// latest + historical questions. Run: npm test
import http from "node:http";
import { handle, MAX_BYTES } from "../src/core.mjs";

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const server = http.createServer(async (req, res) => {
  const { status, text } = await handle(`http://localhost${req.url}`, process.env);
  res.writeHead(status, { "content-type": "application/json" }); res.end(text);
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const cases = [
  ["latest ETH balance (Ethplorer)", `/query?address=${VITALIK}`, 200, (j) => j.source === "api.ethplorer.io" && /^\d+$/.test(j.balance_wei)],
  ["ETH balance at block 18000000 (decimal)", `/query?address=${VITALIK}&block_number=18000000`, 200, (j) => j.balance_wei === BigInt("0xd54076909a93bad129").toString() && j.block === 18000000],
  ["same, hex block + unknown params tolerated", `/query?address=${VITALIK}&block_number=0x112a880&foo=bar&apiKey=freekey`, 200, (j) => j.balance_wei === BigInt("0xd54076909a93bad129").toString()],
  ["blockNo alias (Blockscout-style)", `/query?address=${VITALIK}&blockNo=18000000`, 200, (j) => j.block === 18000000],
  ["ETH balance at block 1000000 (deep archive)", `/query?address=0x00000000219ab540356cBB839Cbe05303d7705Fa&block_number=1000000`, 200, (j) => j.balance_wei === "0"],
  ["tx count at 18000000", `/query?address=${VITALIK}&block_number=18000000&metric=tx_count`, 200, (j) => j.value === "1123"],
  ["code presence: USDT contract", `/query?address=${USDT}&block_number=18000000&metric=code`, 200, (j) => j.value === true && j.code_size_bytes > 1000],
  ["code presence: EOA", `/query?address=${VITALIK}&block_number=18000000&metric=code`, 200, (j) => j.value === false],
  ["ERC-20 USDC balance at 18000000", `/query?address=${VITALIK}&block_number=18000000&metric=erc20_balance&token=${USDC}`, 200, (j) => j.decimals === 6 && /^\d+$/.test(j.raw_balance)],
  ["cache hit on repeat", `/query?address=${VITALIK}&block_number=18000000`, 200, (j) => j.cached === true],
  ["invalid address -> 400", `/query?address=vitalik.eth`, 400, (j) => j.error === "INVALID_ADDRESS"],
  ["future block -> 400", `/query?address=${VITALIK}&block_number=999999999`, 400, (j) => j.error === "FUTURE_BLOCK"],
  ["unsupported metric -> 400", `/query?address=${VITALIK}&metric=logs`, 400, (j) => j.error === "UNSUPPORTED_METRIC"],
];

let failed = 0;
for (const [name, path, wantStatus, check] of cases) {
  const t0 = Date.now();
  const res = await fetch(base + path); const text = await res.text(); const ms = Date.now() - t0;
  const bytes = Buffer.byteLength(text); let j = {}; try { j = JSON.parse(text); } catch {}
  const ok = res.status === wantStatus && bytes <= MAX_BYTES && check(j);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — HTTP ${res.status}, ${bytes} B, ${ms} ms\n     ${text}`);
}
server.close();
console.log(failed ? `\n${failed} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
