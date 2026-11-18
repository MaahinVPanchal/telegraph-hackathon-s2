import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { paymentRequestId, performPaidAsk, readAttemptLedger, saveAttempt, validateEscrowReceipt, isMatchingAnswer } from "../public/live-payment.mjs";

const wallet = "0x1111111111111111111111111111111111111111";
const payTo = "0x3624eb012b5e998bb57b6be6c9cfc9c4bc5eb99b";
const origin = "https://desk.example";
const requestUrl = `${origin}/api/engine/v1/ask`;
const intent = "SANCTIONS_SCREENING_MATCH_GENERAL";
const params = { name: "Example Entity" };
const stable = (value) => value && typeof value === "object" ? (Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))) : value;
function store() { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; }
function challenge(message = ["Telegraph Escrow Payment", "Wallet: {from}", `Pay To: ${payTo}`, "Network: eip155:11155111", "Amount: 10000 uUSDC", "Resource: /v1/ask", "Nonce: {nonce}", "Valid After: {validAfter}", "Valid Before: {validBefore}"].join("\n")) {
  return { accepts: [{ scheme: "escrow", network: "eip155:11155111", payTo, extra: { resource: "/v1/ask", signWith: "personal_sign (EIP-191)", message } }] };
}
const provider = (calls) => ({ request: async ({ method }) => { calls.push(method); if (method === "eth_chainId") return "0xaa36a7"; if (method === "eth_accounts") return [wallet]; if (method === "personal_sign") return "0xdead"; throw Error(method); } });

const malformedChallengeCases = [
  ["fixed nonce", (s) => s.replace("{nonce}", "fixed-nonce")],
  ["fixed validBefore", (s) => s.replace("{validBefore}", "9999999999")],
  ["fixed validAfter", (s) => s.replace("{validAfter}", "0")],
  ["fixed wallet", (s) => s.replace("Wallet: {from}", `Wallet: ${wallet}`)],
  ["repeated placeholder", (s) => s.replace("{nonce}", "{nonce} {nonce}")],
  ["missing placeholder", (s) => s.replace("Nonce: {nonce}\n", "")],
];
for (const [label, mutate] of malformedChallengeCases) test(`mocked: ${label} challenge rejects before personal_sign`, async () => {
  const calls = [];
  const message = mutate(challenge().accepts[0].extra.message);
  await assert.rejects(performPaidAsk({ provider: provider(calls), wallet, intent, params, requestUrl, payTo, origin, storage: store(), fetchImpl: async () => new Response(JSON.stringify(challenge(message)), { status: 402 }) }));
  assert.equal(calls.includes("personal_sign"), false);
});

const goodReceipt = { receipt_hash: `0x${"a".repeat(64)}`, rail: "escrow", payer: wallet, miner: "377", intent, amount_uusdc: "10000", epoch_id: 1, settlement: "epoch", chain: "telegraph", timestamp: 1789466181 };
for (const [label, invalid] of [["missing miner", { ...goodReceipt, miner: undefined }], ["unsafe epoch", { ...goodReceipt, epoch_id: Number.MAX_SAFE_INTEGER + 1 }], ["fractional timestamp", { ...goodReceipt, timestamp: 1.5 }], ["wrong amount", { ...goodReceipt, amount_uusdc: "10001" }], ["array", []]]) {
  test(`mocked: receipt ${label} is rejected`, () => assert.equal(validateEscrowReceipt(invalid, { intent, amount: 10000n, payer: wallet }), false));
}
test("mocked: array answers and array inputs are rejected", () => {
  assert.equal(isMatchingAnswer([], { intent, params }), false);
  assert.equal(isMatchingAnswer({ intent, input: [] }, { intent, params }), false);
});

test("mocked: old stable-object request IDs continue blocking pending and unknown ledger entries", async () => {
  for (const status of ["authorization_pending", "unknown"]) {
    const storage = store();
    const legacyPayload = JSON.stringify(stable({ wallet: wallet.toLowerCase(), intent, params }));
    const id = `sha256:${createHash("sha256").update(legacyPayload).digest("hex")}`;
    assert.equal(await paymentRequestId(wallet, intent, params), id);
    saveAttempt(storage, id, { wallet, intent, params, status, authorizationStarted: true, amountMicro: "10000" });
    const calls = [];
    await assert.rejects(performPaidAsk({ provider: provider(calls), wallet, intent, params, requestUrl, payTo, origin, storage, fetchImpl: async () => { throw Error("must not fetch"); } }), /unresolved authorization/i);
    assert.equal(calls.includes("personal_sign"), false);
  }
});

test("mocked: missing trusted payTo/origin is refused before signing", async () => {
  for (const extra of [{ payTo: undefined, origin }, { payTo, origin: undefined }]) {
    const calls = [];
    await assert.rejects(performPaidAsk({ provider: provider(calls), wallet, intent, params, requestUrl, ...extra, storage: store(), fetchImpl: async () => new Response(JSON.stringify(challenge()), { status: 402 }) }));
    assert.equal(calls.includes("personal_sign"), false);
  }
});

test("mocked: ledger persists one canonical attempts map and derives indexes", async () => {
  const storage = store();
  const id = await paymentRequestId(wallet, intent, params);
  saveAttempt(storage, id, { wallet, intent, params, runId: "r1", status: "authorization_pending", authorizationStarted: true });
  const persisted = JSON.parse(storage.getItem("leaderlight.live-attempts.v1"));
  assert.deepEqual(Object.keys(persisted).sort(), ["attempts", "version"]);
  const view = readAttemptLedger(storage);
  assert.equal(view.byWallet[wallet].length, 1);
  assert.equal(view.byRun.r1.length, 1);
});

test("mocked: localStorage write failure stops before personal_sign", async () => {
  const calls = [];
  let fetchCount = 0;
  const fullStorage = { getItem: () => null, setItem: () => { throw new Error("quota exceeded"); } };
  await assert.rejects(performPaidAsk({ provider: provider(calls), wallet, intent, params, requestUrl, payTo, origin, storage: fullStorage, fetchImpl: async () => { fetchCount++; return new Response(JSON.stringify(challenge()), { status: 402 }); } }), /could not be saved/i);
  assert.equal(fetchCount, 1);
  assert.equal(calls.includes("personal_sign"), false);
});
