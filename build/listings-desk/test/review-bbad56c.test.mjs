import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fundEscrow, mintTestUsdc, performPaidAsk, readAttemptLedger, readWalletFundingState,
  reconcileAccountedReceipts, saveAttempt,
} from "../public/live-payment.mjs";

const wallet = "0x1111111111111111111111111111111111111111";
const diamond = "0x72a70e949362670bf8bcead24efc5b8f950aa08b";
const otherDiamond = "0x8222222222222222222222222222222222222222";
const usdc = "0xcc194e1a843b658526d0d5c431f670028582ae17";
const network = "eip155:11155111";
const intent = "SANCTIONS_SCREENING_MATCH_GENERAL";
const params = { name: "Failure reproduction" };
const requestUrl = "https://desk.example/api/engine/v1/ask";
const storage = (initial = {}) => {
  const entries = new Map(Object.entries(initial));
  return { getItem: (k) => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, v), removeItem: (k) => entries.delete(k) };
};
const nodeLedger = (deposited = 0n, charged = 10_000n) => ({
  deposited: String(deposited), withdrawn: "0", charged: String(charged), credited: "0", unbilled: "0",
  balance: String(deposited), available: String(deposited), charge_limit: "100000000", charged_this_block: "0",
});
const ledgerFetch = (account = nodeLedger()) => async () => ({ ok: true, json: async () => account });
function walletProvider({ estimate = "0x20000", onEstimate = () => {}, onSend = () => {}, calls = [] } = {}) {
  return { request: async (req) => {
    calls.push(req);
    if (req.method === "eth_chainId") return "0xaa36a7";
    if (req.method === "eth_accounts") return [wallet];
    if (req.method === "eth_estimateGas") { onEstimate(); if (estimate instanceof Error) throw estimate; return estimate; }
    if (req.method === "eth_call") return req.params[0].data.startsWith("0xdd62ed3e") ? "0x4c4b40" : "0x0";
    if (req.method === "eth_sendTransaction") { onSend(); return `0x${"e".repeat(64)}`; }
    if (req.method === "eth_getBalance") return "0x0";
    throw new Error(`unexpected ${req.method}`);
  } };
}
function attempt(requestId, { attemptId, receiptMiner = "731002", trustedMiner = receiptMiner, receiptHash = `0x${"a".repeat(64)}`, accountedByNode, status = "protocol_receipt" } = {}) {
  const receipt = { receipt_hash: receiptHash, rail: "escrow", payer: wallet, miner: receiptMiner, intent, amount_uusdc: "10000", epoch_id: 4, settlement: "epoch", chain: "telegraph", timestamp: 1795000000 };
  return {
    attemptId, requestId, wallet, intent, params, network, payTo: diamond, miner: receiptMiner,
    status, authorizationStarted: true, amountMicro: "10000", accountedByNode,
    receipt, nodeResponseEvidence: { version: 1, wallet, network, diamond, intent, miner: trustedMiner, amountMicro: "10000", receiptHash },
  };
}

test("corrupt, unreadable, and provenance-free pending records prevent every funding send", async () => {
  const corrupt = storage({ "leaderlight.pending-deposits.v1": "{" });
  const readError = { ...storage(), getItem(key) { if (key === "leaderlight.pending-deposits.v1") throw Error("disk read failed"); return null; } };
  const legacy = storage({ "leaderlight.pending-deposits.v1": JSON.stringify({
    [`0x${"b".repeat(64)}`]: { wallet, depositHash: `0x${"b".repeat(64)}`, amountMicro: "20000", depositedBefore: "0", status: "unknown", network: null, diamond: null },
  }) });
  for (const store of [corrupt, readError, legacy]) {
    let sends = 0;
    const provider = walletProvider({ onSend: () => sends++ });
    await assert.rejects(fundEscrow({ provider, wallet, usdc, diamond, storage: store, fetchImpl: ledgerFetch() }));
    assert.equal(sends, 0);
  }
});

test("ledger balance for this Diamond cannot resolve another network or Diamond deposit", async () => {
  const key = "leaderlight.pending-deposits.v1";
  const hash = `0x${"c".repeat(64)}`;
  const store = storage({ [key]: JSON.stringify({ [hash]: {
    wallet, depositHash: hash, amountMicro: "20000", depositedBefore: "0", status: "confirmed",
    network: "eip155:1", diamond: otherDiamond,
  } }) });
  const state = await readWalletFundingState({ provider: walletProvider(), wallet, usdc, diamond, storage: store, fetchImpl: ledgerFetch(nodeLedger(20_000n)) });
  assert.equal(state.pendingResolution.resolved, 0);
  assert.equal(state.pendingDeposits.length, 1);
  assert.equal(JSON.parse(store.getItem(key))[hash].status, "confirmed");
});

test("a verified reverted deposit becomes recoverable and the next funding attempt can proceed", async () => {
  const store = storage();
  const provider = walletProvider();
  let wait = 0;
  await assert.rejects(fundEscrow({ provider, wallet, usdc, diamond, storage: store, fetchImpl: ledgerFetch(),
    waitForReceipt: async () => (++wait === 1 ? { status: "0x1" } : { status: "0x0" }) }), /reverted/);
  const saved = JSON.parse(store.getItem("leaderlight.pending-deposits.v1"));
  assert.equal(Object.values(saved)[0].status, "reverted");
  // A retry is allowed after the revert; confirm both approve and deposit on retry.
  const retry = await fundEscrow({ provider: walletProvider(), wallet, usdc, diamond, storage: store, fetchImpl: ledgerFetch(), waitForReceipt: async () => ({ status: "0x1" }), pollAttempts: 0 });
  assert.equal(retry.indexingPending, true);
});

test("older receipt accounting flags persist in canonical history after repeat saves and reloads", () => {
  const store = storage();
  const requestId = `sha256:${"d".repeat(64)}`;
  saveAttempt(store, requestId, attempt(requestId, { attemptId: "old" }));
  saveAttempt(store, requestId, attempt(requestId, { attemptId: "new", receiptHash: `0x${"f".repeat(64)}` }));
  for (let i = 0; i < 3; i++) {
    reconcileAccountedReceipts(store, wallet, { diamond, network, ledgerAccount: { charged: BigInt(20_000 + i * 10_000), unbilled: 0n } });
    // another distinct receipted assessment/save/reload cycle models repeated compaction
    saveAttempt(store, requestId, attempt(requestId, { attemptId: `repeat-${i}`, receiptHash: `0x${String(i + 1).repeat(64)}` }));
    const reloaded = readAttemptLedger(store);
    const entries = reloaded.history.filter((item) => item.requestId === requestId && item.status === "protocol_receipt");
    assert.ok(entries.some((item) => item.attemptId === "old" && item.accountedByNode === true));
  }
});

test("wrong miner receipt is not released, and paid path requires a fresh ledger before another request", async () => {
  const store = storage();
  const requestId = `sha256:${"e".repeat(64)}`;
  saveAttempt(store, requestId, attempt(requestId, { attemptId: "wrong-miner", receiptMiner: "wrong", trustedMiner: "trusted" }));
  const result = reconcileAccountedReceipts(store, wallet, { diamond, network, ledgerAccount: { charged: 10_000n, unbilled: 0n } });
  assert.equal(result.accounted, 0);
  assert.equal(readAttemptLedger(store).history[0].accountedByNode, undefined);
  let engineCalls = 0;
  await assert.rejects(performPaidAsk({ provider: walletProvider(), wallet, intent, params, requestUrl, storage: store, payTo: diamond,
    network, origin: "https://desk.example", fetchImpl: async () => { engineCalls++; throw Error("ledger unavailable"); } }), /ledger unavailable/);
  assert.equal(engineCalls, 1); // only attempted the required ledger read; no Engine challenge/payment call
});

test("gas estimation failure and wallet change during estimation never send a transaction", async () => {
  let sends = 0;
  await assert.rejects(mintTestUsdc({ provider: walletProvider({ estimate: Error("RPC estimate unavailable"), onSend: () => sends++ }), wallet, usdc }), /gas estimation failed/);
  assert.equal(sends, 0);
  let current = true;
  await assert.rejects(mintTestUsdc({ provider: walletProvider({ onEstimate: () => { current = false; }, onSend: () => sends++ }), wallet, usdc, isCurrent: () => current }), /changed/);
  assert.equal(sends, 0);
  await assert.rejects(fundEscrow({ provider: walletProvider({ estimate: Error("estimate reverted"), onSend: () => sends++ }), wallet, usdc, diamond, storage: storage(), fetchImpl: ledgerFetch() }), /gas estimation failed/);
  assert.equal(sends, 0);

  // If approval is already mined but deposit estimation fails, report the approval hash and make clear the deposit was never sent.
  let estimates = 0;
  let depositPhaseSends = 0;
  const afterApprovalProvider = { request: async (req) => {
    if (req.method === "eth_chainId") return "0xaa36a7";
    if (req.method === "eth_accounts") return [wallet];
    if (req.method === "eth_estimateGas") { if (++estimates === 2) throw Error("deposit estimate reverted"); return "0x20000"; }
    if (req.method === "eth_call") return "0x4c4b40";
    if (req.method === "eth_sendTransaction") { depositPhaseSends++; return `0x${"f".repeat(64)}`; }
    throw Error(req.method);
  } };
  await assert.rejects(fundEscrow({ provider: afterApprovalProvider, wallet, usdc, diamond, storage: storage(), fetchImpl: ledgerFetch(), waitForReceipt: async () => ({ status: "0x1" }) }), (error) => {
    assert.equal(error.pendingState, "approval_confirmed");
    assert.match(error.message, /approval confirmed.*deposit was not sent/i);
    assert.match(error.message, new RegExp("0x" + "f".repeat(64)));
    return true;
  });
  assert.equal(depositPhaseSends, 1, "only the approval transaction was sent");
});
