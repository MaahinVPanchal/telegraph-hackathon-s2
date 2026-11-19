import assert from "node:assert/strict";
import { test } from "node:test";
import { readWalletFundingState, validateEscrowChallenge, validateEscrowReceipt } from "../public/live-payment.mjs";

const wallet = "0x1111111111111111111111111111111111111111";
const diamond = "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b";
const usdc = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
const fields = { deposited: "0", withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: "0", available: "0", charge_limit: "0", charged_this_block: "0" };
const storage = { getItem: () => null, setItem() {} };
const provider = { request: async ({ method, params }) => {
  if (method === "eth_chainId") return "0xaa36a7";
  if (method === "eth_accounts") return [wallet];
  if (method === "eth_getBalance") return "0x1";
  if (method === "eth_call") return params[0].data.startsWith("0x70a08231") ? "0x0" : "0x0";
  throw new Error(`unexpected ${method}`);
} };
const fetchLedger = (body) => async (url, init) => {
  assert.match(url, new RegExp(wallet));
  assert.equal(init.method, "GET");
  return { ok: true, json: async () => body };
};

test("mocked: zero node ledger yields zero spendable escrow without calling old debt selectors", async () => {
  const state = await readWalletFundingState({ provider, wallet, usdc, diamond, storage, fetchImpl: fetchLedger(fields) });
  assert.equal(state.ledgerAccount.available, 0n);
  assert.equal(state.rawEscrowBalanceMicro, 0n);
  assert.equal(state.spendableEscrowMicro, 0n);
  assert.equal(state.agentDebtMicro, undefined);
});

test("mocked: documented available minus local unresolved liabilities drives the conservative estimate", async () => {
  const state = await readWalletFundingState({ provider, wallet, usdc, diamond, storage, fetchImpl: fetchLedger({ ...fields, balance: "50000", available: "40000" }) });
  assert.equal(state.spendableEscrowMicro, 40000n);
});

test("mocked: unreadable or undocumented ledger fields fail closed", async () => {
  const response = await readWalletFundingState({ provider, wallet, usdc, diamond, storage, fetchImpl: async () => ({ ok: true, json: async () => ({ available: "0" }) }) });
  assert.match(response.ledgerReadError, /documented decimal-string field/);
  assert.equal(response.spendableEscrowMicro, null);
});

test("mocked: documented receipt fields pass; rail, chain, settlement, and amount mismatches fail", () => {
  const receipt = { rail: "escrow", chain: "telegraph", settlement: "epoch", epoch_id: 1, receipt_hash: `0x${"a".repeat(64)}`, payer: wallet, miner: "377", intent: "i", amount_uusdc: "10000", timestamp: 1 };
  const expected = { intent: "i", amount: 10000n, payer: wallet };
  assert.equal(validateEscrowReceipt(receipt, expected), true);
  for (const [key, value] of [["rail", "other"], ["chain", "other"], ["settlement", "block"], ["amount_uusdc", "10001"]]) assert.equal(validateEscrowReceipt({ ...receipt, [key]: value }, expected), false);
});

test("mocked: trusted challenge rejects wrong payTo and wrong network before authorization", () => {
  const payee = diamond;
  const message = ["Telegraph Escrow Payment", `Wallet: {from}`, `Pay To: ${payee}`, "Network: eip155:11155111", "Amount: 10000 uUSDC", "Resource: /v1/ask", "Nonce: {nonce}", "Valid After: {validAfter}", "Valid Before: {validBefore}"].join("\n");
  const challenge = { accepts: [{ scheme: "escrow", network: "eip155:11155111", payTo: payee, extra: { resource: "/v1/ask", signWith: "personal_sign (EIP-191)", message } }] };
  const common = { wallet, network: "eip155:11155111", payTo: diamond, origin: "https://desk.example", resource: "/v1/ask", requestUrl: "https://desk.example/api/engine/v1/ask" };
  assert.equal(validateEscrowChallenge(challenge, common).payTo, payee.toLowerCase());
  assert.throws(() => validateEscrowChallenge(challenge, { ...common, payTo: "0x2222222222222222222222222222222222222222" }), /trusted configuration/);
  assert.throws(() => validateEscrowChallenge({ accepts: [{ ...challenge.accepts[0], network: "eip155:1" }] }, common), /trusted configuration/);
});
