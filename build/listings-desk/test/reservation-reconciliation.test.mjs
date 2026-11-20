import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fundEscrow,
  performPaidAsk,
  readAttemptLedger,
  readWalletFundingState,
  reconcileSettledReceipts,
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

function receiptedAttempt(requestId, { amount = "10000", timestamp = 1795000000, runId = null, settled } = {}) {
  return {
    requestId,
    wallet,
    intent,
    params,
    runId,
    status: "protocol_receipt",
    authorizationStarted: true,
    amountMicro: amount,
    receipt: { receipt_hash: receiptHash, rail: "escrow", payer: wallet, miner: "731002", intent, amount_uusdc: amount, epoch_id: 20, settlement: "epoch", chain: "telegraph", timestamp },
    ...(settled === undefined ? {} : { settledOnChain: settled }),
  };
}

function unknownAttempt(requestId, { amount = "10000" } = {}) {
  return {
    requestId,
    wallet,
    intent,
    params,
    status: "unknown",
    authorizationStarted: true,
    amountMicro: amount,
  };
}

function provider() {
  return {
    request: async (request) => {
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [wallet];
      if (request.method === "personal_sign") return `0x${"9".repeat(142)}`;
      if (request.method === "eth_getBalance") return "0x0";
      if (request.method === "eth_call") return request.params[0]?.data?.startsWith("0xdd62ed3e") ? "0x4c4b40" : "0x0";
      throw new Error(`unexpected provider request: ${request.method}`);
    },
  };
}

function ledgerFetch(availableMicro, depositedMicro) {
  return async () => ({
    ok: true,
    json: async () => ({
      deposited: String(depositedMicro), withdrawn: "0", charged: "0", credited: "0", unbilled: "0",
      balance: String(depositedMicro), available: String(availableMicro), charge_limit: "1000000000", charged_this_block: "0",
    }),
  });
}

test("reconciliation marks receipted attempts settled and drops them from local liabilities", async () => {
  const store = storage();
  saveAttempt(store, `sha256:${"a".repeat(64)}`, receiptedAttempt(`sha256:${"a".repeat(64)}`));
  const state = await readWalletFundingState({
    provider: provider(), wallet, usdc, diamond, storage: store, isCurrent: () => true,
    fetchImpl: ledgerFetch(3_000_000n, 3_000_000n),
  });
  assert.equal(state.pendingLiabilitiesMicro, 0n);
  assert.equal(state.spendableEscrowMicro, 3_000_000n);
  const ledger = readAttemptLedger(store);
  const attempts = ledger.history?.length ? ledger.history : Object.values(ledger.attempts);
  assert.ok(attempts.every((a) => a.settledOnChain === true), "persisted receipts must be marked settled");
});

test("unknown attempts keep reserving spendable and keep duplicate-payment protection", async () => {
  const store = storage();
  saveAttempt(store, `sha256:${"c".repeat(64)}`, unknownAttempt(`sha256:${"c".repeat(64)}`));
  const state = await readWalletFundingState({
    provider: provider(), wallet, usdc, diamond, storage: store, isCurrent: () => true,
    fetchImpl: ledgerFetch(3_000_000n, 3_000_000n),
  });
  assert.equal(state.pendingLiabilitiesMicro, 10000n);
  assert.equal(state.spendableEscrowMicro, 2_990_000n);
  await assert.rejects(() => performPaidAsk({
    provider: provider(), wallet, intent, params, requestUrl,
    storage: store, network, payTo: diamond, origin, resource: "/v1/ask", isCurrent: () => true,
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  }), /unresolved authorization/);
});

test("settled receipts stop consuming the legacy run budget (previously blocked forever)", async () => {
  const store = storage();
  saveAttempt(store, `sha256:${"a".repeat(64)}`, receiptedAttempt(`sha256:${"a".repeat(64)}`));
  saveAttempt(store, `sha256:${"b".repeat(64)}`, receiptedAttempt(`sha256:${"b".repeat(64)}`));
  // Two settled receipts of 10000 each: the legacy reservation previously summed
  // to 20000, so a new 10000 ask exceeded RUN_CAP forever. After reconciliation
  // the settled receipts are excluded and the ask proceeds.
  let signatureRequested = false;
  const fetchImpl = async (_url, init = {}) => {
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
  const provider = {
    request: async (request) => {
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [wallet];
      if (request.method === "eth_call") return request.params[0]?.data?.startsWith("0xdd62ed3e") ? "0x4c4b40" : "0x0";
      if (request.method === "eth_sendTransaction") { balance = 3_000_000n; return `0x${"e".repeat(64)}`; }
      throw new Error(`unexpected ${request.method}`);
    },
  };
  const fetchImpl = async () => {
    reads++;
    const deposited = reads >= 3 ? balance : 0n; // first read (before) + first read after deposit lag
    return { ok: true, json: async () => ({ deposited: String(deposited), withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: String(deposited), available: String(deposited), charge_limit: "1000000000", charged_this_block: "0" }) };
  };
  const stages = [];
  const result = await fundEscrow({
    provider, wallet, usdc, diamond, amountMicro: 3_000_000n, isCurrent: () => true,
    fetchImpl, waitForReceipt: async () => ({ status: "0x1" }),
    pollAttempts: 3, pollMs: 1,
    onStage: (stage) => stages.push(stage),
  });
  assert.equal(result.indexingPending, false);
  assert.equal(result.depositedMicro, "3000000");
  assert.ok(stages.includes("deposit_index_pending"));
  assert.ok(stages.includes("deposit_confirmed"));
});

test("fundEscrow with permanent indexing lag reports pending honestly and never prompts a second deposit", async () => {
  const provider = {
    request: async (request) => {
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [wallet];
      if (request.method === "eth_call") return request.params[0]?.data?.startsWith("0xdd62ed3e") ? "0x4c4b40" : "0x0";
      if (request.method === "eth_sendTransaction") return `0x${"e".repeat(64)}`;
      throw new Error(`unexpected ${request.method}`);
    },
  };
  const stages = [];
  const result = await fundEscrow({
    provider, wallet, usdc, diamond, amountMicro: 3_000_000n, isCurrent: () => true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ deposited: "0", withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: "0", available: "0", charge_limit: "1000000000", charged_this_block: "0" }) }),
    waitForReceipt: async () => ({ status: "0x1" }),
    pollAttempts: 2, pollMs: 1,
    onStage: (stage, detail) => stages.push([stage, detail]),
  });
  assert.equal(result.indexingPending, true);
  assert.equal(result.depositHash, `0x${"e".repeat(64)}`);
  assert.ok(stages.some(([stage]) => stage === "deposit_indexing_pending"));
});

test("fundEscrow still rejects when the ledger indexes a shorter deposit than requested", async () => {
  const provider = {
    request: async (request) => {
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [wallet];
      if (request.method === "eth_call") return request.params[0]?.data?.startsWith("0xdd62ed3e") ? "0x4c4b40" : "0x0";
      if (request.method === "eth_sendTransaction") return `0x${"e".repeat(64)}`;
      throw new Error(`unexpected ${request.method}`);
    },
  };
  await assert.rejects(() => fundEscrow({
    provider, wallet, usdc, diamond, amountMicro: 20_000n, isCurrent: () => true,
    fetchImpl: (function () { let reads = 0; return async () => { reads++; const deposited = reads === 1 ? "0" : "10000"; return { ok: true, json: async () => ({ deposited, withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: deposited, available: deposited, charge_limit: "1000000000", charged_this_block: "0" }) }; }; })(),
    waitForReceipt: async () => ({ status: "0x1" }),
    pollAttempts: 1, pollMs: 1,
  }), /did not increase by the requested amount/);
});
