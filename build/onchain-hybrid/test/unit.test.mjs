import { handle, clearCache } from "../src/core.mjs";

const V = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045".toLowerCase();
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(c ? "PASS" : "FAIL", n, d ?? ""); };
const ulp = (v) => { if (!Number.isFinite(v) || v === 0) return 0; return 2 ** (Math.floor(Math.log2(Math.abs(v))) - 52); };

function mockRpc(o = {}) {
  const { balanceWei = 0n, head = 21000000n, code = "0x", nonce = "0x520",
    callResult = "0x0", decimals = "missing", failAll = false, badJson = false,
    rpcError = null, nullResult = false, failMethods = [] } = o;
  return async (url, init) => {
    if (failAll) return new Response("down", { status: 503 });
    if (String(url).includes("ethplorer")) return new Response("no", { status: 503 });
    if (badJson) return new Response("<html>not json</html>", { status: 200 });
    const b = JSON.parse(init.body);
    if (failMethods.includes(b.method)) return new Response("method down", { status: 503 });
    if (rpcError) return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: rpcError } }), { status: 200 });
    if (nullResult) return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }), { status: 200 });
    let result;
    if (b.method === "eth_blockNumber") result = "0x" + head.toString(16);
    else if (b.method === "eth_getBalance") result = "0x" + balanceWei.toString(16);
    else if (b.method === "eth_getTransactionCount") result = nonce;
    else if (b.method === "eth_getCode") result = code;
    else if (b.method === "eth_call") {
      if (b.params[0].data === "0x313ce567") {
        if (decimals === "missing") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "execution reverted" } }), { status: 200 });
        result = "0x" + BigInt(decimals).toString(16).padStart(64, "0");
      } else result = callResult;
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
  };
}
async function q(qs, opts = {}) {
  clearCache();
  const r = await handle("https://x/query?" + qs, opts.env || {}, { fetch: mockRpc(opts), quiet: true });
  return { status: r.status, body: JSON.parse(r.text), bytes: new TextEncoder().encode(r.text).length };
}
const noBalance = (b) => b.ok === false && !("balance_wei" in b) && !("balance_gwei" in b) && !("value" in b);

let r = await q(`address=${V}&block=21000000`, { balanceWei: 0n });
check("zero wei: exact", r.body.balance_wei === "0" && r.body.value === "0" && r.body.balance_gwei === 0 && r.body.balance_eth === "0");
r = await q(`address=${V}&block=21000000`, { balanceWei: 1n });
check("1 wei dust: wei exact, gwei truncates to 0", r.body.balance_wei === "1" && r.body.balance_gwei === 0 && r.body.balance_eth === "0.000000000000000001");
r = await q(`address=${V}&block=21000000`, { balanceWei: 999999999n });
check("1 Gwei minus 1 wei: gwei 0.999999", r.body.balance_wei === "999999999" && r.body.balance_gwei === 0.999999);
r = await q(`address=${V}&block=21000000`, { balanceWei: 10n ** 9n });
check("1 Gwei exact", r.body.balance_gwei === 1);
r = await q(`address=${V}&block=21000000`, { balanceWei: 10n ** 18n });
check("1 ETH = 1e9 Gwei exact", r.body.balance_gwei === 1e9 && r.body.value === "1");
r = await q(`address=${V}&block=21000000`, { balanceWei: 1146641417679066653164n });
{
  const ref = Number(1146641417679066653164n) / 1e9;
  check("vitalik-scale: gwei within 2 ULP of independent float ref", Math.abs(r.body.balance_gwei - ref) <= 2 * ulp(ref));
  check("vitalik-scale: wei string canonical exact", r.body.balance_wei === "1146641417679066653164");
}
r = await q(`address=${V}&block=21000000`, { balanceWei: 10n ** 26n });
{
  const ref = Number(10n ** 26n) / 1e9;
  check("100M ETH: finite, in range, within 2 ULP", Number.isFinite(r.body.balance_gwei) && r.body.balance_gwei <= 1e20 && Math.abs(r.body.balance_gwei - ref) <= 2 * ulp(ref));
}
r = await q(`address=${V}&block=21000000`, { balanceWei: 10n ** 29n });
check("1e20 Gwei boundary: finite number", Number.isFinite(r.body.balance_gwei) && r.body.balance_gwei === 1e20);

r = await q(`address=${V}&block=0`);
check("block 0 (genesis) accepted", r.status === 200 && r.body.ok && r.body.block === 0 && r.body.block_tag === "number");
r = await q(`address=${V}&block=0x1406f40`);
check("hex block accepted", r.body.ok && r.body.block === 21000000);
r = await q(`address=${V}&block=-5`);
check("negative block rejected INVALID_BLOCK, no balance", r.status === 400 && noBalance(r.body));
r = await q(`address=${V}&block=21000000.5`);
check("fractional block rejected", r.status === 400 && r.body.error === "INVALID_BLOCK");
r = await q(`address=${V}&block=`);
check("empty block treated as latest (behavior lock)", r.body.ok && r.body.block_tag === "latest" && r.body.block === 21000000);
r = await q(`address=${V}&block=latest`);
check("explicit latest resolves to head", r.body.ok && r.body.block_tag === "latest" && r.body.block === 21000000);
r = await q(`address=${V}&block=999999999999`, { failMethods: ["eth_getBalance"] });
check("far-future block FUTURE_BLOCK, no balance", r.status === 400 && r.body.error === "FUTURE_BLOCK" && noBalance(r.body));
r = await q(`address=${V}&block=100&block_number=21000000`);
check("conflicting aliases: block_number wins (precedence lock)", r.body.ok && r.body.block === 21000000);

r = await q(`address=${V}&address=vitalik.eth&block=21000000`);
check("duplicate address param: first wins", r.body.ok === true);
r = await q(`wallet=vitalik.eth&address=${V}&block=21000000`);
check("conflicting address/wallet: address key wins", r.body.ok === true);
r = await q(`address=&block=21000000`);
check("empty address MISSING_ADDRESS", r.status === 400 && r.body.error === "MISSING_ADDRESS" && noBalance(r.body));
r = await q(`address=0x1234&block=21000000`);
check("short address rejected", r.status === 400 && r.body.error === "INVALID_ADDRESS" && noBalance(r.body));
r = await q(`address=0x${"a".repeat(41)}&block=21000000`);
check("41-hex address rejected, never truncated", r.status === 400 && r.body.error === "INVALID_ADDRESS" && noBalance(r.body));
r = await q(`address=0x${"z".repeat(40)}&block=21000000`);
check("non-hex address rejected", r.status === 400 && r.body.error === "INVALID_ADDRESS");
r = await q(`address=%20%20${V}%20&block=21000000`);
check("whitespace-padded address normalized", r.body.ok === true);
r = await q(`address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&block=21000000`);
check("mixed-case address accepted", r.body.ok === true);

r = await q(`address=${V}&block=18000000`, { failAll: true });
check("all RPCs down at historical block: 504, no latest substitution", r.status === 504 && noBalance(r.body));
r = await q(`address=${V}&block=18000000`, { badJson: true });
check("non-JSON upstream: 504, no balance", r.status === 504 && noBalance(r.body));
r = await q(`address=${V}&block=18000000`, { rpcError: "invalid params" });
check("JSON-RPC error from all: 504, no balance", r.status === 504 && noBalance(r.body));
r = await q(`address=${V}&block=18000000`, { nullResult: true });
check("null result from all: 504, no balance", r.status === 504 && noBalance(r.body));

{
  clearCache();
  const logs = [];
  const orig = console.log; console.log = (s) => logs.push(String(s));
  try {
    const r2 = await handle("https://x/query?address=" + V + "&block=18000000", { ARCHIVE_RPC_URL: "https://SECRETKEY123.example-rpc.com" }, { fetch: mockRpc({ failAll: true }), quiet: false });
    const blob = r2.text + logs.join("\n");
    check("keyed RPC URL never in response or logs", !blob.includes("SECRETKEY123") && !blob.includes("example-rpc.com"));
  } finally { console.log = orig; }
}

r = await q(`address=${V}&block=21000000&metric=erc20_balance&token=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`, { callResult: "0x" + (690075n).toString(16).padStart(64, "0"), decimals: "6" });
check("erc20 with 6 decimals scales value", r.body.ok && r.body.value === "0.690075" && r.body.raw_balance === "690075" && r.body.decimals === 6);
r = await q(`address=${V}&block=21000000&metric=erc20_balance&token=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`, { callResult: "0x" + (690075n).toString(16).padStart(64, "0"), decimals: "missing" });
check("erc20 decimals revert falls back to raw units", r.body.ok && r.body.unit === "raw token units" && r.body.value === "690075" && r.body.decimals === null);
r = await q(`address=${V}&block=21000000&metric=code`, { code: "0x60006000" });
check("code: contract -> true, size 4", r.body.ok && r.body.value === true && r.body.code_size_bytes === 4);
r = await q(`address=${V}&block=21000000&metric=code`, { code: "0x" });
check("code: EOA -> false, size 0", r.body.ok && r.body.value === false && r.body.code_size_bytes === 0);
r = await q(`address=${V}&block=21000000&metric=tx_count`, { nonce: "0x57d" });
check("tx_count: 1405", r.body.ok && r.body.value === "1405");

r = await q(`address=${V}&block=21000000`, { balanceWei: 42n });
check("as_of ISO-8601 present", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(r.body.as_of));
check("success body under 4096 B", r.bytes <= 4096);
check("chain echo on success", r.body.chain === "ethereum");

{
  clearCache();
  const logs = [];
  const orig = console.log; console.log = (s) => logs.push(String(s));
  try {
    const bad = "x".repeat(10000);
    const res = await handle(`https://x/query?address=${bad}&block=21000000`, {}, { fetch: mockRpc(), quiet: false });
    const event = JSON.parse(logs[0]);
    check("10,000-char address rejected with INVALID_ADDRESS", res.status === 400 && JSON.parse(res.text).error === "INVALID_ADDRESS");
    check("10,000-char address diagnostic is bounded with length marker",
      event.raw_address === `${bad.slice(0, 128)}...[truncated, len=${bad.length}]`);
  } finally { console.log = orig; }
}

console.log(`\nunit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
