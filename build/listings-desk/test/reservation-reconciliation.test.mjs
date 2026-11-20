import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fundEscrow,
  performPaidAsk,
  readAttemptLedger,
  readWalletFundingState,
  saveAttempt,
} from "../public/live-payment.mjs";

const wallet = "0x1111111111111111111111111111111111111111";
const diamond = "0x72a70e949362670bf8bcead24efc5b8f950aa08b";
const usdc = "0xcc194e1a843b658526d0d5c431f670028582ae17";
const origin = "https://desk.example";
const requestUrl = `${origin}/api/engine/v1/ask`;
const intent = "SANCTIONS_SCREENING_MATCH_GENERAL";
const params = { name: "Example Entity" };
const network = "eip155:11155111";
const receiptHash = `0x${"b".repeat(64)}`;
const PENDING_KEY = "leaderlight.pending-deposits.v1";

const storage = () => {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
};

function challenge(amount = "10000") {
  const message = [
    "Telegraph Escrow Payment",
    "Wallet: {from}",
    `Pay To: ${diamond}`,
    `Network: ${network}`,
    `Amount: ${amount} uUSDC`,
    "Resource: /v1/ask",
    "Nonce: {nonce}",
    "Valid After: {validAfter}",
    "Valid Before: {validBefore}",
  ].join("\n");
  return {
    accepts: [{
      scheme: "escrow",
      network,
      payTo: diamond,
      extra: { resource: "/v1/ask", signWith: "personal_sign (EIP-191)", message },
    }],
  };
}

function validReceipt({ amount = "10000", timestamp = 1795000000 } = {}) {
  return {
    receipt_hash: receiptHash, rail: "escrow", payer: wallet, miner: "731002",
    intent, amount_uusdc: amount, epoch_id: 20, settlement: "epoch", chain: "telegraph", timestamp,
  };
}

function receiptedAttempt(requestId, overrides = {}) {
  const { amount = "10000", timestamp = 1795000000, runId = null, ...rest } = overrides;
  const attempt = {
    requestId, wallet, intent, params, runId, payTo: diamond, network, miner: "731002",
    status: "protocol_receipt", authorizationStarted: true, amountMicro: amount,
    receipt: validReceipt({ amount, timestamp }),
    nodeResponseEvidence: {
      version: 1, wallet, network, diamond, intent, miner: "731002",
      amountMicro: amount, receiptHash: receiptHash,
    },
    ...rest,
  };
  attempt.miner = attempt.receipt?.miner;
  attempt.nodeResponseEvidence = attempt.receipt ? {
    version: 1, wallet, network, diamond, intent, miner: attempt.receipt.miner,
    amountMicro: amount, receiptHash: attempt.receipt.receipt_hash,
  } : null;
  return attempt;
}

function unknownAttempt(requestId, { amount = "10000" } = {}) {
  return {
    requestId, wallet, intent, params, status: "unknown", authorizationStarted: true, amountMicro: amount,
  };
}

function provider() {
  return {
    request: async (request) => {
      if (request.method === "eth_estimateGas") return "0x186a0";
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [wallet];
      if (request.method === "personal_sign") return `0x${"9".repeat(142)}`;
      if (request.method === "eth_getBalance") return "0x0";
      if (request.method === "eth_getTransactionReceipt") return { transactionHash: request.params[0], status: "0x1" };
      if (request.method === "eth_call") return request.params[0]?.data?.startsWith("0xdd62ed3e") ? "0x4c4b40" : "0x0";
      throw new Error(`unexpected provider request: ${request.method}`);
    },
  };
}

function ledgerFetch(availableMicro, depositedMicro, chargedMicro = depositedMicro) {
  return async () => ({
    ok: true,
    json: async () => ({
      deposited: String(depositedMicro), withdrawn: "0", charged: String(chargedMicro), credited: "0", unbilled: "0",
      balance: String(depositedMicro), available: String(availableMicro), charge_limit: "1000000000", charged_this_block: "0",
    }),
  });
}

test("reconciliation marks valid receipted attempts accountedByNode and drops them from local liabilities", async () => {
  const store = storage();
  saveAttempt(store, `sha256:${"a".repeat(64)}`, receiptedAttempt(`sha256:${"a".repeat(64)}`));
  const state = await readWalletFundingState({
    provider: provider(), wallet, usdc, diamond, storage: store, isCurrent: () => true,
    fetchImpl: ledgerFetch(3_000_000n, 3_000_000n, 20_000n),
  });
  assert.equal(state.pendingLiabilitiesMicro, 0n);
  assert.equal(state.spendableEscrowMicro, 3_000_000n);
  assert.equal(state.reconciliation.accounted, 1);
  const ledger = readAttemptLedger(store);
  const attempts = ledger.history?.length ? ledger.history : Object.values(ledger.attempts);
  assert.ok(attempts.every((a) => a.accountedByNode === true), "accounting evidence must be persisted");
  assert.ok(attempts.every((a) => a.settledOnChain !== true), "on-chain settlement must not be claimed without delivery proof");
});

test("receipt with missing/malformed/mismatched proof keeps the reservation", async () => {
  const store = storage();
  saveAttempt(store, `sha256:${"a".repeat(64)}`, receiptedAttempt(`sha256:${"a".repeat(64)}`, { receipt: null }));
  saveAttempt(store, `sha256:${"b".repeat(64)}`, receiptedAttempt(`sha256:${"b".repeat(64)}`));
  // Corrupt b's receipt amount so it mismatches the authorized amount.
  const ledger = readAttemptLedger(store);
  for (const entry of Object.values(ledger.attempts)) {
    if (entry.requestId === `sha256:${"b".repeat(64)}`) entry.receipt.amount_uusdc = "999";
  }
  store.setItem("leaderlight.live-attempts.v1", JSON.stringify({ version: 1, attempts: ledger.attempts }));
  const state = await readWalletFundingState({
    provider: provider(), wallet, usdc, diamond, storage: store, isCurrent: () => true,
    fetchImpl: ledgerFetch(3_000_000n, 3_000_000n, 20_000n),
  });
  assert.equal(state.pendingLiabilitiesMicro, 20000n); // both stay reserved
  assert.equal(state.spendableEscrowMicro, 2_980_000n);
});

test("legacy receipt-shaped local records without trusted node response evidence remain reserved", async () => {
  const store = storage();
  const attempt = receiptedAttempt(`sha256:${"d".repeat(64)}`);
  delete attempt.nodeResponseEvidence;
  saveAttempt(store, attempt.requestId, attempt);
  const state = await readWalletFundingState({
    provider: provider(), wallet, usdc, diamond, storage: store, isCurrent: () => true,
    fetchImpl: ledgerFetch(3_000_000n, 3_000_000n, 20_000n),
  });
  assert.equal(state.pendingLiabilitiesMicro, 10_000n);
  assert.equal(state.reconciliation.accounted, 0);
});

test("unknown attempts keep reserving spendable and keep duplicate-payment protection", async () => {
  const store = storage();
  saveAttempt(store, `sha256:${"c".repeat(64)}`, unknownAttempt(`sha256:${"c".repeat(64)}`));
  const state = await readWalletFundingState({
    provider: provider(), wallet, usdc, diamond, storage: store, isCurrent: () => true,
    fetchImpl: ledgerFetch(3_000_000n, 3_000_000n, 20_000n),
  });
  assert.equal(state.pendingLiabilitiesMicro, 10000n);
  assert.equal(state.spendableEscrowMicro, 2_990_000n);
  await assert.rejects(() => performPaidAsk({
    provider: provider(), wallet, intent, params, requestUrl,
    storage: store, network, payTo: diamond, origin, resource: "/v1/ask", isCurrent: () => true,
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  }), /unresolved authorization/);
});

test("accounted receipts stop consuming the legacy run budget (previously blocked forever)", async () => {
  const store = storage();
  saveAttempt(store, `sha256:${"a".repeat(64)}`, receiptedAttempt(`sha256:${"a".repeat(64)}`));
  saveAttempt(store, `sha256:${"b".repeat(64)}`, receiptedAttempt(`sha256:${"b".repeat(64)}`));
  let signatureRequested = false;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes("/api/ledger/account/")) return ledgerFetch(3_000_000n, 3_000_000n, 20_000n)();
    if (!init.headers?.["X-PAYMENT"]) {
      return { ok: false, status: 402, json: async () => challenge() };
    }
    signatureRequested = true;
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ intent, input: params, miner_id: "9002" }),
    };
  };
  const result = await performPaidAsk({
    provider: provider(), wallet, intent, params, requestUrl,
    storage: store, network, payTo: diamond, origin, resource: "/v1/ask", isCurrent: () => true,
    fetchImpl,
  });
  assert.equal(signatureRequested, true);
  assert.equal(result.answer.intent, intent);
  assert.equal(result.paymentStatus, "unknown");
});

test("fundEscrow polls through ledger indexing delay and reports success", async () => {
  let balance = 0n;
  let reads = 0;
  const providerMock = {
    request: async (request) => {
      if (request.method === "eth_estimateGas") return "0x186a0";
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [wallet];
      if (request.method === "eth_call") return request.params[0]?.data?.startsWith("0xdd62ed3e") ? "0x4c4b40" : "0x0";
      if (request.method === "eth_sendTransaction") { balance = 3_000_000n; return `0x${"e".repeat(64)}`; }
      throw new Error(`unexpected ${request.method}`);
    },
  };
  const fetchImpl = async () => {
    reads++;
    const deposited = reads >= 3 ? balance : 0n; // before-read + first post-deposit read lag
    return { ok: true, json: async () => ({ deposited: String(deposited), withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: String(deposited), available: String(deposited), charge_limit: "1000000000", charged_this_block: "0" }) };
  };
  const stages = [];
  const result = await fundEscrow({
    storage: storage(),
    provider: providerMock, wallet, usdc, diamond, amountMicro: 3_000_000n, isCurrent: () => true,
    fetchImpl, waitForReceipt: async () => ({ status: "0x1" }),
    pollAttempts: 3, pollMs: 1,
    onStage: (stage) => stages.push(stage),
  });
  assert.equal(result.indexingPending, false);
  assert.equal(result.depositedMicro, "3000000");
  assert.ok(stages.includes("deposit_index_pending"));
  assert.ok(stages.includes("deposit_confirmed"));
});

test("fundEscrow with permanent indexing lag reports pending honestly, records the pending deposit, and never prompts a second deposit", async () => {
  const store = storage();
  const providerMock = {
    request: async (request) => {
      if (request.method === "eth_estimateGas") return "0x186a0";
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [wallet];
      if (request.method === "eth_call") return request.params[0]?.data?.startsWith("0xdd62ed3e") ? "0x4c4b40" : "0x0";
      if (request.method === "eth_sendTransaction") return `0x${"e".repeat(64)}`;
      throw new Error(`unexpected ${request.method}`);
    },
  };
  const stages = [];
  const result = await fundEscrow({
    storage: store,
    provider: providerMock, wallet, usdc, diamond, amountMicro: 3_000_000n, isCurrent: () => true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ deposited: "0", withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: "0", available: "0", charge_limit: "1000000000", charged_this_block: "0" }) }),
    waitForReceipt: async () => ({ status: "0x1" }),
    pollAttempts: 2, pollMs: 1,
    onStage: (stage, detail) => stages.push([stage, detail]),
  });
  assert.equal(result.indexingPending, true);
  assert.equal(result.depositHash, `0x${"e".repeat(64)}`);
  assert.ok(stages.some(([stage]) => stage === "deposit_indexing_pending"));
  // The pending deposit must be persisted across reloads/tabs.
  const pending = JSON.parse(store.getItem(PENDING_KEY));
  assert.equal(Object.values(pending).length, 1);
  assert.equal(Object.values(pending)[0].amountMicro, "3000000");
  // A second funding attempt is refused while the deposit is unresolved.
  await assert.rejects(() => fundEscrow({
    storage: store,
    provider: providerMock, wallet, usdc, diamond, amountMicro: 3_000_000n, isCurrent: () => true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ deposited: "0", withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: "0", available: "0", charge_limit: "1000000000", charged_this_block: "0" }) }),
    waitForReceipt: async () => ({ status: "0x1" }),
    pollAttempts: 1, pollMs: 1,
  }), /confirmed on-chain but not yet reflected/);
});

test("fundEscrow with an unavailable ledger after confirmation reports verification pending instead of failure", async () => {
  const store = storage();
  let depositDone = false;
  const providerMock = {
    request: async (request) => {
      if (request.method === "eth_estimateGas") return "0x186a0";
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [wallet];
      if (request.method === "eth_call") return request.params[0]?.data?.startsWith("0xdd62ed3e") ? "0x4c4b40" : "0x0";
      if (request.method === "eth_sendTransaction") return `0x${"f".repeat(64)}`;
      throw new Error(`unexpected ${request.method}`);
    },
  };
  const fetchImpl = async () => {
    if (!depositDone) return { ok: true, json: async () => ({ deposited: "0", withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: "0", available: "0", charge_limit: "1000000000", charged_this_block: "0" }) };
    throw new Error("502 bad gateway");
  };
  const result = await fundEscrow({
    storage: store,
    provider: providerMock, wallet, usdc, diamond, amountMicro: 3_000_000n, isCurrent: () => true,
    fetchImpl,
    waitForReceipt: async () => { depositDone = true; return { status: "0x1" }; },
    pollAttempts: 1, pollMs: 1,
  });
  assert.equal(result.indexingPending, true);
  assert.match(result.verificationError, /502/);
  const pending = JSON.parse(store.getItem(PENDING_KEY));
  assert.equal(Object.values(pending).length, 1);
});

test("fundEscrow: a ledger that indexes a shorter deposit stays pending for refresh, not a failure", async () => {
  let reads = 0;
  const providerMock = {
    request: async (request) => {
      if (request.method === "eth_estimateGas") return "0x186a0";
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [wallet];
      if (request.method === "eth_call") return request.params[0]?.data?.startsWith("0xdd62ed3e") ? "0x4c4b40" : "0x0";
      if (request.method === "eth_sendTransaction") return `0x${"e".repeat(64)}`;
      throw new Error(`unexpected ${request.method}`);
    },
  };
  const result = await fundEscrow({
    storage: storage(),
    provider: providerMock, wallet, usdc, diamond, amountMicro: 20_000n, isCurrent: () => true,
    fetchImpl: async () => { reads++; return { ok: true, json: async () => ({ deposited: reads === 1 ? "0" : "10000", withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: reads === 1 ? "0" : "10000", available: reads === 1 ? "0" : "10000", charge_limit: "1000000000", charged_this_block: "0" }) }; },
    waitForReceipt: async () => ({ status: "0x1" }),
    pollAttempts: 2, pollMs: 1,
  });
  assert.equal(result.indexingPending, true);
  assert.equal(result.partial, true);
  assert.equal(result.pendingState, "confirmed");
});

test("a recorded pending deposit resolves once the ledger reflects it", async () => {
  const store = storage();
  saveAttempt(store, `sha256:${"a".repeat(64)}`, receiptedAttempt(`sha256:${"a".repeat(64)}`));
  // Seed a pending deposit as if a prior session funded without indexing.
  store.setItem(PENDING_KEY, JSON.stringify({
    [`0x${"e".repeat(64)}`]: {
      wallet, approveHash: `0x${"d".repeat(64)}`, depositHash: `0x${"e".repeat(64)}`,
      amountMicro: "3000000", depositedBefore: "0", status: "confirmed", network, diamond,
      recordedAt: "2026-11-20T00:00:00.000Z",
    },
  }));
  const state = await readWalletFundingState({
    provider: provider(), wallet, usdc, diamond, storage: store, isCurrent: () => true,
    fetchImpl: ledgerFetch(3_000_000n, 3_000_000n, 20_000n), // ledger now reflects the deposit
  });
  assert.equal(state.pendingResolution.resolved, 1);
  assert.equal(state.pendingResolution.remaining, 0);
  assert.deepEqual(state.pendingDeposits, []);
});

