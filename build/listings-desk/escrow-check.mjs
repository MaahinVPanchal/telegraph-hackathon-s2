// Scheduled escrow + miner health check. One paid request (~$0.01) per run,
// routed to our onchain miner. Verifies the payment rail end-to-end.
//   node escrow-check.mjs [minerId]
import { readFileSync } from "node:fs";
import { EscrowSigner, fetchWithEscrow, PaymentPolicy } from "./src/x402.mjs";
import { resolveCaps } from "./src/config.mjs";

const env = Object.fromEntries(
  readFileSync("../miner-kit/.env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()])
);

const RPC = env.RPC_URL;
const DIAMOND = "0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b";
const USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
const MACHINA = "0xd68305cA83C7AF42A4F720144E7416fB53F8AaF4";
const MINER_ID = process.argv[2] ?? "9602";
const ENGINE = "https://devnode.telegraphprotocol.com/engine";
const wallet = env.FEE_ADDRESS;

async function rpc(method, params) {
  return fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((r) => r.json());
}
async function ethCall(to, data) {
  return rpc("eth_call", [{ to, data }, "latest"]).then((j) => j.result);
}
const balanceOfData = (addr) =>
  "0x70a08231" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");

// === 1. Balances ===
const eth = Number(BigInt((await rpc("eth_getBalance", [wallet, "latest"])).result ?? "0x0")) / 1e18;
const usdc = Number(BigInt((await ethCall(USDC, balanceOfData(wallet)).then((r) => r ?? "0x0"))) ) / 1e6;
const machina = Number(BigInt((await ethCall(MACHINA, balanceOfData(wallet)).then((r) => r ?? "0x0")))) / 1e18;
console.log(`wallet: ${eth.toFixed(4)} ETH · ${usdc.toFixed(2)} USDC · ${machina.toFixed(2)} MACHINA`);

// === 2. Our three miners in the catalogue ===
const miners = await fetch("https://devnode.telegraphprotocol.com/api/miners").then((r) => r.json());
const ours = ["onchain-metric-publicnode", "weather-verify-openmeteo", "fx-now-frankfurter"];
for (const slug of ours) {
  const m = miners.find((x) => x.slug === slug);
  console.log(`${slug}: ${m ? m.activation_status + " (reqs " + (m.total_requests_served || 0) + ")" : "ABSENT"}`);
}

// === 3. One paid request to our onchain miner (the end-to-end escrow test) ===
const caps = resolveCaps({ mode: "real" });
const policy = new PaymentPolicy(caps);
const signer = new EscrowSigner(env.MINER_PRIVATE_KEY);
const url = `${ENGINE}/v1/ask/${MINER_ID}`;
const body = JSON.stringify({
  method: "GET",
  endpoint: "/query",
  payload: { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", metric: "eth_balance" },
});
const init = { method: "POST", headers: { "Content-Type": "application/json" }, body };

const { res, receipt } = await fetchWithEscrow(fetch, signer, url, init, {
  policy,
  intent: "ONCHAIN_METRIC_VERIFY_GENERAL",
  expected: {
    network: "eip155:11155111",
    payTo: DIAMOND,
    origin: "https://devnode.telegraphprotocol.com",
    resource: `/v1/ask/${MINER_ID}`,
  },
});
console.log("paid request:", res.status);
if (res.ok) {
  const j = await res.json();
  console.log("answer:", JSON.stringify(j.result ?? {}).slice(0, 150));
  console.log("signal:", j.signal_hash);
  if (receipt) console.log("settlement: paid", receipt.amount_uusdc, "μUSDC | epoch", receipt.epoch_id, "| miner", receipt.miner);
  const usdcAfter = Number(BigInt((await ethCall(USDC, balanceOfData(wallet)).then((r) => r ?? "0x0")) )) / 1e6;
  console.log("USDC after:", usdcAfter.toFixed(2), "(the deduction settles at the next epoch close)");
} else {
  const t = await res.text().catch(() => "");
  console.log("paid request failed:", res.status, t.slice(0, 200));
  if (t.includes('"reason"')) {
    try { console.log("reason:", JSON.parse(t).reason); } catch {}
  }
}
