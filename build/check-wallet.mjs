#!/usr/bin/env node
// Check a wallet across the networks this project uses — no dependencies.
//   node check-wallet.mjs 0xYourPublicAddress
//
// Shows: ETH on Base Sepolia (gas), testnet USDC on Base Sepolia (intelligence budget),
// and whether the address has mainnet activity (sanity check that it's a fresh testnet wallet).
// Shares nothing sensitive: a public address is safe to check — NEVER enter your seed
// phrase or private key anywhere except MetaMask itself.

const [address] = process.argv.slice(2);

if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("usage: node check-wallet.mjs <0x-public-address>   (40 hex chars after 0x)");
  process.exit(2);
}

const RPCS = {
  baseSepolia: "https://sepolia.base.org",
  ethMainnet: "https://ethereum-rpc.publicnode.com",
};
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

const eth = (weiHex) => Number(BigInt(weiHex)) / 1e18;
const fmt = (n, d = 6) => n.toFixed(d).replace(/\.?0+$/, "") || "0";

let fail = 0;

// 1. ETH on Base Sepolia (gas money)
try {
  const b = await rpc(RPCS.baseSepolia, "eth_getBalance", [address, "latest"]);
  const v = eth(b);
  console.log(`Base Sepolia ETH : ${fmt(v)} ${v > 0 ? "✅ (gas money present)" : "⚠️  empty — visit faucet.quicknode.com/base/sepolia"}`);
  if (v <= 0) fail = 1;
} catch (e) {
  console.log(`Base Sepolia ETH : ✗ ${e.message}`);
  fail = 1;
}

// 2. USDC on Base Sepolia (intelligence budget) — balanceOf(address), selector 0x70a08231
try {
  const data = "0x70a08231" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const b = await rpc(RPCS.baseSepolia, "eth_call", [{ to: USDC_BASE_SEPOLIA, data }, "latest"]);
  const v = Number(BigInt(b)) / 1e6; // USDC = 6 decimals
  console.log(`Base Sepolia USDC: ${fmt(v, 2)} ${v > 0 ? "✅ (intelligence budget present)" : "⚠️  empty — visit faucet.circle.com (Base Sepolia)"}`);
} catch (e) {
  console.log(`Base Sepolia USDC: ✗ ${e.message}`);
}

// 3. Mainnet ETH (sanity: a fresh testnet wallet should be 0; nonzero = you pasted an old/main wallet)
try {
  const b = await rpc(RPCS.ethMainnet, "eth_getBalance", [address, "latest"]);
  const v = eth(b);
  console.log(
    v > 0
      ? `Ethereum mainnet : ${fmt(v)} ETH ⚠️  this address holds REAL money — for hackathon testing use a FRESH wallet instead`
      : `Ethereum mainnet : 0 ✅ (fresh/testnet-only address — good)`
  );
} catch {
  console.log("Ethereum mainnet : (could not check — non-blocking)");
}

// 4. Transaction count on Base Sepolia (have you sent/received anything yet?)
try {
  const n = await rpc(RPCS.baseSepolia, "eth_getTransactionCount", [address, "latest"]);
  const c = Number(BigInt(n));
  console.log(`Base Sepolia txs : ${c} ${c === 0 ? "(new wallet — nothing has moved yet)" : "(wallet has on-chain activity)"}`);
} catch {
  /* non-blocking */
}

console.log(fail ? "\nNext: faucet ETH, then re-run this check." : "\nWallet looks ready. Next: miner-kit step 3 (check-intents) in the runbook.");
process.exit(fail);
