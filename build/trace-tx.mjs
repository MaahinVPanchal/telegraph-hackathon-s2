#!/usr/bin/env node
// Trace any transaction hash across the networks this project touches.
//   node trace-tx.mjs 0x<tx-hash>
//
// Searches: Base Sepolia, Ethereum Sepolia, Base mainnet, Ethereum mainnet, Arbitrum.
// For a found tx it prints: chain, status, from/to, ETH value, and decoded ERC-20
// Transfer logs (topic0 = 0xddf252ad… = Transfer(address,address,uint256)).
//
// How tracing works (no keys needed): a transaction hash is looked up on the chain's
// public JSON-RPC via eth_getTransactionReceipt. `result: null` means "no such tx on
// this chain" — which is itself the answer when a tx shows up in an unexpected place.

const TX = process.argv[2];
if (!TX || !/^0x[0-9a-fA-F]{64}$/.test(TX)) {
  console.error("usage: node trace-tx.mjs 0x<64-hex transaction hash>");
  process.exit(2);
}

const CHAINS = [
  { name: "Base Sepolia (our chain)", rpc: "https://base-sepolia-rpc.publicnode.com" },
  { name: "Ethereum Sepolia", rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
  { name: "Base mainnet", rpc: "https://base-rpc.publicnode.com" },
  { name: "Ethereum mainnet", rpc: "https://ethereum-rpc.publicnode.com" },
  { name: "Arbitrum mainnet", rpc: "https://arbitrum-one-rpc.publicnode.com" },
];

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const NATIVE_ETH_TOKEN = "0xfffffffffffffffffffffffffffffffffffffffe"; // how faucets emit native-ETH transfers
const addr = (t) => "0x" + t.slice(-40);
const pad = (hex) => BigInt("0x" + String(hex || "0").replace(/^0x/, ""));

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  return (await res.json()).result;
}

let found = 0;
for (const c of CHAINS) {
  let r;
  try {
    r = await rpc(c.rpc, "eth_getTransactionReceipt", [TX]);
  } catch (e) {
    console.log(`${c.name}: lookup failed (${e.message})`);
    continue;
  }
  if (!r) {
    console.log(`${c.name}: — no such transaction`);
    continue;
  }
  found++;
  const tx = await rpc(c.rpc, "eth_getTransactionByHash", [TX]);
  console.log(`\n=== FOUND on ${c.name} ===`);
  console.log(`status    : ${r.status === "0x1" ? "SUCCESS" : "FAILED"}`);
  console.log(`block     : ${parseInt(r.blockNumber)}`);
  console.log(`from      : ${r.from}`);
  console.log(`to        : ${r.to}`);
  console.log(`ETH value : ${Number(BigInt(tx.value)) / 1e18}`);
  console.log(`gasUsed   : ${parseInt(r.gasUsed)}`);
  console.log(`explorer  : ${c.name.includes("Base Sepolia") ? "https://sepolia.basescan.org/tx/" : c.name.includes("Ethereum Sepolia") ? "https://sepolia.etherscan.io/tx/" : c.name.includes("Base main") ? "https://basescan.org/tx/" : "https://etherscan.io/tx/"}${TX}`);
  for (const [i, l] of (r.logs || []).entries()) {
    console.log(`log[${i}] contract ${l.address}`);
    if (l.topics[0] === TRANSFER_TOPIC && l.topics.length === 3) {
      const amount = pad(l.data);
      const isNative = l.address.toLowerCase() === NATIVE_ETH_TOKEN;
      const decimals = isNative || l.address.toLowerCase().includes("usdc") ? (isNative ? 1e18 : 1e6) : null;
      console.log(`  ERC-20 Transfer: ${addr(l.topics[1])} → ${addr(l.topics[2])}`);
      console.log(`  amount: ${amount}${decimals ? " = " + Number(amount) / decimals : ""} ${isNative ? "(native ETH)" : ""}`);
    } else {
      console.log(`  topic0: ${l.topics[0].slice(0, 24)}… (event signature — decode via openchain.sig)`);
    }
  }
}
if (!found) console.log("\nNot on any tracked chain — wrong hash, a private testnet, or a non-EVM chain (e.g. Solana).");
