import { handle } from "../src/core.mjs";

const V = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const GARBAGE = "1234567890abcdef".repeat(6);
const mode = process.argv[2] || "strict";
const env = mode === "soft" ? { SOFT_ERRORS: "1" } : {};
const errStatus = mode === "soft" ? 200 : 400;
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(c ? "PASS" : "FAIL", n, d ?? ""); };
const q = async (qs) => {
  const url = new URL("https://x/query?" + qs);
  if (!url.searchParams.has("chain")) url.searchParams.set("chain", "ethereum");
  const r = await handle(url, env, { quiet: true });
  return { status: r.status, body: JSON.parse(r.text), bytes: new TextEncoder().encode(r.text).length };
};
const ulp = (v) => 2 ** (Math.floor(Math.log2(Math.abs(v))) - 52);
const ORACLES = [
  "https://eth-mainnet.public.blastapi.io",
  "https://eth-pokt.nodies.app",
  "https://ethereum-mainnet.gateway.tatum.io",
  "https://rpc.mevblocker.io",
  "https://eth.drpc.org",
  "https://gateway.tenderly.co/public/mainnet",
];
const rpcBalance = async (addr, blk, excluded = []) => {
  const errors = [];
  for (const url of ORACLES) {
    if (excluded.includes(url)) continue;
    try {
      const j = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr.toLowerCase(), "0x" + BigInt(blk).toString(16)] }) }).then((r) => r.json());
      if (j.error || j.result == null) throw new Error("oracle RPC failed: " + JSON.stringify(j).slice(0, 120));
      return { wei: BigInt(j.result), url };
    } catch (e) { errors.push(`${new URL(url).host}: ${e.message}`); }
  }
  throw new Error(`all independent oracle RPCs failed: ${errors.join("; ")}`);
};

const blkHexN = 21000000;
const firstOracle = await rpcBalance(V, blkHexN);
let oracleNote = new URL(firstOracle.url).host;
let truthWei = firstOracle.wei;
try {
  const secondOracle = await rpcBalance(V, blkHexN, [firstOracle.url]);
  check("oracle agreement: two independent RPCs return identical wei", truthWei === secondOracle.wei, `${truthWei} vs ${secondOracle.wei}`);
  oracleNote += `+${new URL(secondOracle.url).host}`;
} catch (e) { console.log("WARN second oracle unavailable:", e.message); }
console.log("oracle:", truthWei.toString(), "wei @ block", blkHexN, `(${oracleNote})`);

let r = await q(`address=${V}&block=21000000`);
check("evaluator shape (address+block): 200 ok, pinned block", r.status === 200 && r.body.ok === true && r.body.block === 21000000 && r.body.block_tag === "number");
check("balance_wei === independent oracle (exact string)", r.body.balance_wei === truthWei.toString(), `${r.body.balance_wei} vs ${truthWei}`);
{
  const ref = Number(truthWei) / 1e9;
  check("balance_gwei is a number within 2 ULP of the true value", typeof r.body.balance_gwei === "number" && Math.abs(r.body.balance_gwei - ref) <= 2 * ulp(ref), `got ${r.body.balance_gwei}`);
  const quantError = Math.abs(r.body.balance_gwei * 1e6 - Math.round(r.body.balance_gwei * 1e6));
  check("6dp quantization is below double spacing at this magnitude", quantError <= 2 * ulp(ref) * 1e6 + 1e-6, `residual=${quantError}`);
}
check("chain echo ethereum", r.body.chain === "ethereum");
check("response under 4096 B", r.bytes <= 4096, `${r.bytes}B`);

r = await q(`address=${V.slice(2)}&block=21000000`);
check("bare 40-hex normalized to identical answer", r.status === 200 && r.body.ok === true && r.body.balance_wei === truthWei.toString(), `err=${r.body.error || ""}`);
r = await q(`address=0X${V.slice(2)}&block=21000000`);
check("0X prefix normalized", r.status === 200 && r.body.ok === true);
r = await q(`address=%22${V}%22&block=21000000`);
check("stray quotes normalized", r.status === 200 && r.body.ok === true);
r = await q(`address=${V}&block_number=21000000`);
check("block_number alias: pinned, same wei", r.body.ok === true && r.body.block === 21000000 && r.body.balance_wei === truthWei.toString());

r = await q(`address=${GARBAGE}&block=21000000`);
check(`garbage 96-hex rejected (HTTP ${errStatus})`, r.status === errStatus && r.body.ok === false && r.body.error === "INVALID_ADDRESS" && !("balance_wei" in r.body) && !("balance_gwei" in r.body) && !("value" in r.body), `status=${r.status}`);
r = await q(`address=vitalik.eth&block=21000000`);
check(`ENS rejected (HTTP ${errStatus})`, r.status === errStatus && r.body.error === "INVALID_ADDRESS");
r = await q(`block=21000000`);
check(`missing address (HTTP ${errStatus}) MISSING_ADDRESS`, r.status === errStatus && r.body.error === "MISSING_ADDRESS");
r = await q(`address=${V}&block=99999999999`);
check(`future block (HTTP ${errStatus}) FUTURE_BLOCK`, r.status === errStatus && r.body.error === "FUTURE_BLOCK" && !("balance_wei" in r.body));
r = await q(`address=${V}&block=21000000&metric=unsupported`);
check(`bad metric (HTTP ${errStatus}) UNSUPPORTED_METRIC`, r.status === errStatus && r.body.error === "UNSUPPORTED_METRIC");

const SAMPLE_ADDR = "0x1234567890123456789012345678901234567890";
const { wei: zw } = await rpcBalance(SAMPLE_ADDR, blkHexN);
r = await q(`address=${SAMPLE_ADDR}&block=21000000`);
check("sample address: wei matches oracle exactly", r.body.ok === true && r.body.balance_wei === zw.toString() && (zw !== 0n || r.body.balance_gwei === 0), `oracle=${zw}`);

const BURN = "0x0000000000000000000000000000000000000000";
const { wei: bw } = await rpcBalance(BURN, blkHexN);
r = await q(`address=${BURN}&block=21000000`);
{
  const ref = Number(bw) / 1e9;
  check("large balance: balance_wei exact vs oracle", r.body.ok === true && r.body.balance_wei === bw.toString(), `oracle=${bw}`);
  check("large balance: balance_gwei within 2 ULP", Math.abs(r.body.balance_gwei - ref) <= 2 * ulp(ref), `got ${r.body.balance_gwei}`);
}

r = await q(`address=${V}&block=21000000&metric=tx_count`);
check("tx_count answers", r.body.ok === true && typeof r.body.value === "string");
r = await q(`address=${V}&block=21000000&metric=code`);
check("code answers", r.body.ok === true && typeof r.body.value === "boolean");
r = await q(`address=${V}&block=21000000&metric=erc20_balance&token=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`);
check("erc20 USDC answers", r.body.ok === true, `value=${r.body.value || r.body.error}`);

console.log(`\nmode=${mode}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
