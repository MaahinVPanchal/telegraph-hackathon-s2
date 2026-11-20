import assert from "node:assert/strict";
import { test } from "node:test";
import { fundEscrow } from "../public/live-payment.mjs";

const storage = () => {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
};

const wallet = "0x1111111111111111111111111111111111111111";
const usdc = "0xcc194e1a843b658526d0d5c431f670028582ae17";
const diamond = "0x72a70e949362670bf8bcead24efc5b8f950aa08b";

test("mocked: reject deposit when documented deposited delta is short of the requested amount", async () => {
  let balance = 0n;
  const calls = [];
  const provider = { request: async (req) => {
    calls.push(req);
    if (req.method === "eth_estimateGas") return "0x186a0";
      if (req.method === "eth_chainId") return "0xaa36a7";
    if (req.method === "eth_accounts") return [wallet];
    if (req.method === "eth_call") {
      const { to, data } = req.params[0];
      if (to.toLowerCase() === usdc && data.startsWith("0xdd62ed3e")) return "0x100000";
      return "0x0";
    }
    if (req.method === "eth_sendTransaction") { balance = 10_000n; return `0x${"e".repeat(64)}`; }
    throw new Error(`unexpected ${req.method}`);
  } };
  const shortIndexed = await fundEscrow({ provider, wallet, usdc, diamond, amountMicro: 20_000n, waitForReceipt: async () => ({ status: "0x1" }), fetchImpl: async () => ({ ok: true, json: async () => ({ deposited: String(balance), withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: String(balance), available: String(balance), charge_limit: "0", charged_this_block: "0" }) }), storage: storage() });
  assert.equal(shortIndexed.indexingPending, true);
  assert.equal(shortIndexed.pendingState, "confirmed");
  assert.equal(calls.some((call) => call.method === "eth_call" && ["0x55af6353", "0x16a398f7", "0xdb9104c6"].some((selector) => call.params[0].data.startsWith(selector))), false);
});
