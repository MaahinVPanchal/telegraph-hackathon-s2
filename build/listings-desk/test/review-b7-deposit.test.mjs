import assert from "node:assert/strict";
import { test } from "node:test";
import { fundEscrow } from "../public/live-payment.mjs";

const wallet = "0x1111111111111111111111111111111111111111";
const usdc = "0xcc194e1a843b658526d0d5c431f670028582ae17";
const diamond = "0x72a70e949362670bf8bcead24efc5b8f950aa08b";

test("mocked: reject deposit when balance delta plus debt reduction does not account for full top-up", async () => {
  let balance = 0n;
  const debt = 10_000n;
  const provider = { request: async (req) => {
    if (req.method === "eth_chainId") return "0xaa36a7";
    if (req.method === "eth_accounts") return [wallet];
    if (req.method === "eth_call") {
      const { to, data } = req.params[0];
      if (to.toLowerCase() === usdc && data.startsWith("0xdd62ed3e")) return "0x100000";
      if (to.toLowerCase() === diamond && data.startsWith("0x55af6353")) return `0x${balance.toString(16)}`;
      if (to.toLowerCase() === diamond && data.startsWith("0xdb9104c6")) return `0x${debt.toString(16)}`;
      return "0x0";
    }
    if (req.method === "eth_sendTransaction") { balance = 10_000n; return `0x${"e".repeat(64)}`; }
    throw new Error(`unexpected ${req.method}`);
  } };
  await assert.rejects(fundEscrow({ provider, wallet, usdc, diamond, amountMicro: 20_000n, waitForReceipt: async () => ({ status: "0x1" }) }), /do not account for the top-up/);
});
