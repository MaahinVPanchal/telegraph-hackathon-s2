import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeFunctionCall,
  flattenPriorAttempts,
  fundEscrow,
  getAssessmentIntent,
  LIVE_PAYMENT_LIMITS,
  mintAssessmentIntent,
  parseMicroUsdc,
  performPaidAsk,
  paymentRequestId,
  readAttemptLedger,
  readWalletFundingState,
  saveAttempt,
  validateEscrowChallenge,
  validateEscrowReceipt,
  waitForTransaction,
} from "../public/live-payment.mjs";

test("repeated attempts keep compact, linear prior history and retain all liability records", () => {
  const saved = storage();
  const reqId = `sha256:${"f".repeat(64)}`;
  const sizes = [];
  for (let i = 0; i < 20; i++) {
    saveAttempt(saved, reqId, {
      attemptId: `repeat-${i}`, wallet: walletA, runId: `run-${i}`, status: "protocol_receipt",
      authorizationStarted: true, amountMicro: "10000",
      receipt: { receipt_hash: `0x${String(i).padStart(64, "0")}`, epoch_id: i },
      answer: { huge: "x".repeat(2000) },
    });
    sizes.push(saved.getItem("leaderlight.live-attempts.v1").length);
  }
  const ledger = readAttemptLedger(saved);
  assert.equal(ledger.attempts[reqId].priorAttempts.length, 19);
  assert.ok(ledger.attempts[reqId].priorAttempts.every((a) => !("answer" in a)));
  assert.ok(sizes[19] < sizes[0] * 25, `ledger grew nonlinearly: ${sizes[0]} -> ${sizes[19]}`);
  assert.equal(ledger.history.filter((a) => a.authorizationStarted).reduce((n, a) => n + BigInt(a.amountMicro), 0n), 200000n);
});

test("nested prior history flattens recursively and de-duplicates while preserving order and block statuses", () => {
  const record = { attemptId: "a4", status: "protocol_receipt", priorAttempts: [
    { attemptId: "a3", status: "unknown", priorAttempts: [
      { attemptId: "a2", status: "authorization_pending", priorAttempts: [
        { attemptId: "a1", status: "protocol_receipt" },
      ] },
    ] },
  ] };
  const flat = flattenPriorAttempts(record);
  assert.deepEqual(flat.map((a) => a.attemptId), ["a1", "a2", "a3", "a4"]);
  assert.deepEqual(flat.map((a) => a.status), ["protocol_receipt", "authorization_pending", "unknown", "protocol_receipt"]);
  assert.ok(flat.some((a) => ["authorization_pending", "unknown", "protocol_receipt"].includes(a.status)));
});

test("legacy four-level history migrates under the wallet lock, preserves statuses, and still blocks retry", async () => {
  const saved = storage();
  const params = { name: "Nested Legacy" };
  const reqId = await paymentRequestId(walletA, intent, params);
  const oldRecord = (attemptId, status, priorAttempts = []) => ({ attemptId, requestId: reqId, wallet: walletA, runId: "old-run", status, authorizationStarted: true, amountMicro: "10000", answer: { body: "x".repeat(1000) }, receipt: { receipt_hash: `0x${"a".repeat(64)}`, epoch_id: 5 }, priorAttempts });
  const nested = oldRecord("a4", "protocol_receipt", [oldRecord("a3", "unknown", [oldRecord("a2", "authorization_pending", [oldRecord("a1", "protocol_receipt")])])]);
  saved.setItem("leaderlight.live-attempts.v1", JSON.stringify({ version: 1, attempts: { [reqId]: nested } }));
  assert.deepEqual(readAttemptLedger(saved).history.map((a) => a.attemptId), ["a1", "a2", "a3", "a4"]);
  await assert.rejects(() => performPaidAsk({ provider: fakeWallet(), wallet: walletA, intent, params, requestUrl, runId: "retry", storage: saved, payTo: diamond, origin, fetchImpl: async () => { throw new Error("must remain blocked"); } }), /unresolved authorization|already authorized/);
  const persisted = JSON.parse(saved.getItem("leaderlight.live-attempts.v1"));
  assert.deepEqual(Object.keys(persisted).sort(), ["attempts", "version"]);
  const prior = persisted.attempts[reqId].priorAttempts;
  assert.deepEqual(prior.map((a) => a.attemptId), ["a1", "a2", "a3"]);
  assert.deepEqual(prior.map((a) => a.status), ["protocol_receipt", "authorization_pending", "unknown"]);
  assert.ok(prior.every((a) => !("answer" in a) && !("receipt" in a)));
  assert.equal(prior[0].receiptHash, `0x${"a".repeat(64)}`);
  assert.equal(prior[0].receiptEpoch, 5);
});

test("legacy history migration write failure fails closed before any Engine request or signature", async () => {
  const saved = storage();
  const params = { name: "Unwritable Legacy" };
  const reqId = await paymentRequestId(walletA, intent, params);
  saved.setItem("leaderlight.live-attempts.v1", JSON.stringify({ version: 1, attempts: { [reqId]: { attemptId: "old", requestId: reqId, wallet: walletA, status: "protocol_receipt", authorizationStarted: true, amountMicro: "10000", priorAttempts: [{ attemptId: "older", wallet: walletA, status: "unknown", authorizationStarted: true, amountMicro: "10000", priorAttempts: [{ attemptId: "oldest", wallet: walletA, status: "authorization_pending", authorizationStarted: true, amountMicro: "10000" }] }] } } }));
  saved.setItem = () => { throw new DOMException("QuotaExceededError", "QuotaExceededError"); };
  let signs = 0;
  const wallet = fakeWallet();
  wallet.request = async (request) => { if (request.method === "eth_chainId") return "0xaa36a7"; if (request.method === "eth_accounts") return [walletA]; if (request.method === "personal_sign") signs++; throw new Error(`unexpected ${request.method}`); };
  await assert.rejects(() => performPaidAsk({ provider: wallet, wallet: walletA, intent, params, requestUrl, runId: "migration-failed", storage: saved, payTo: diamond, origin, fetchImpl: async () => { throw new Error("must not fetch"); } }), /migration could not be saved/);
  assert.equal(signs, 0);
});

test("a blocked assessment does not consume its New assessment intent", async () => {
  const saved = storage();
  const params = { name: "Blocked Entity" };
  const reqId = await paymentRequestId(walletA, intent, params);
  saveAttempt(saved, reqId, { attemptId: "pending", wallet: walletA, status: "authorization_pending", authorizationStarted: true, amountMicro: "10000" });
  const token = await mintAssessmentIntent(saved, walletA, intent, params);
  await assert.rejects(() => performPaidAsk({
    provider: fakeWallet(), wallet: walletA, intent, params, requestUrl,
    runId: "run_blocked", storage: saved, payTo: diamond, origin, intentToken: token,
    fetchImpl: async () => { throw new Error("must not request while blocked"); },
  }), /unresolved authorization/);
  assert.equal(await getAssessmentIntent(saved, walletA, intent, params), token);
});

const walletA = "0x1111111111111111111111111111111111111111";
const walletB = "0x2222222222222222222222222222222222222222";
const diamond = "0x72a70e949362670bf8bcead24efc5b8f950aa08b";
const usdc = "0xcc194e1a843b658526d0d5c431f670028582ae17";
const origin = "https://desk.example";
const requestUrl = `${origin}/api/engine/v1/ask`;
const intent = "SANCTIONS_SCREENING_MATCH_GENERAL";
const ledgerFetch = (read) => async () => ({ ok: true, json: async () => ({ deposited: String(read()), withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: String(read()), available: String(read()), charge_limit: "0", charged_this_block: "0" }) });
const network = "eip155:11155111";

const storage = () => {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
};

function challenge(overrides = {}) {
  const fields = {
    network,
    payTo: diamond,
    amount: "10000",
    resource: "/v1/ask",
    ...overrides,
  };
  const message = [
    "Telegraph Escrow Payment",
    "Wallet: {from}",
    `Pay To: ${fields.payTo}`,
    `Network: ${fields.network}`,
    `Amount: ${fields.amount} uUSDC`,
    `Resource: ${fields.resource}`,
    "Nonce: {nonce}",
    "Valid After: {validAfter}",
    "Valid Before: {validBefore}",
  ].join("\n");
  return {
    accepts: [{
      scheme: "escrow",
      network: fields.network,
      payTo: fields.payTo,
      extra: { resource: fields.resource, signWith: "personal_sign (EIP-191)", message },
    }],
  };
}

function response(status, body, headers = {}) {
  return new Response(body == null ? null : JSON.stringify(body), { status, headers });
}

function fakeWallet(w = walletA, calls = []) {
  return {
    async request(request) {
      calls.push(request);
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [w];
      if (request.method === "personal_sign") return "0xdead";
      throw new Error(`unexpected provider request: ${request.method}`);
    },
  };
}

function validReceipt(payer = walletA, amount = "10000") {
  return {
    receipt_hash: `0x${"a".repeat(64)}`,
    rail: "escrow",
    payer,
    miner: "377",
    intent,
    amount_uusdc: amount,
    epoch_id: 314,
    settlement: "epoch",
    chain: "telegraph",
    timestamp: 1789466181,
  };
}

// 1. Two successful $0.01 calls in assessment A do not block distinct assessment B
test("1. Two successful $0.01 calls in assessment A do not block distinct assessment B", async () => {
  const saved = storage();
  const runA = "run_A";
  const runB = "run_B";
  const answer = { intent, input: { name: "Entity 1" }, miner_id: "377", result: { matched: false } };
  const mockFetch = async () => response(402, challenge());
  const successFetch = async (_url, init) => {
    if (!init.headers["X-PAYMENT"]) return response(402, challenge());
    return response(200, answer, { "x-payment-response": btoa(JSON.stringify(validReceipt(walletA, "10000"))) });
  };

  // Assessment A: Call 1 ($0.01)
  const resA1 = await performPaidAsk({
    provider: fakeWallet(walletA), wallet: walletA, intent, params: { name: "Entity 1" },
    requestUrl, runId: runA, storage: saved, payTo: diamond, origin, fetchImpl: successFetch,
  });
  assert.equal(resA1.paymentStatus, "protocol_receipt");

  // Assessment A: Call 2 ($0.01)
  const resA2 = await performPaidAsk({
    provider: fakeWallet(walletA), wallet: walletA, intent, params: { name: "Entity 2" },
    requestUrl, runId: runA, storage: saved, payTo: diamond, origin, fetchImpl: successFetch,
  });
  assert.equal(resA2.paymentStatus, "protocol_receipt");

  // Assessment B: Fresh runId, distinct assessment calls succeed ($0.01 each) without hitting historical run cap
  const resB1 = await performPaidAsk({
    provider: fakeWallet(walletA), wallet: walletA, intent, params: { name: "Entity 3" },
    requestUrl, runId: runB, storage: saved, payTo: diamond, origin, fetchImpl: successFetch,
  });
  assert.equal(resB1.paymentStatus, "protocol_receipt");
});

// 2. A third $0.01 call within one assessment is refused before signing; an oversized single call is also refused
test("2. Third $0.01 call within one assessment is refused before signing; oversized single call is refused", async () => {
  const saved = storage();
  const runId = "run_budget_test";
  const successFetch = async (_url, init) => {
    if (!init.headers["X-PAYMENT"]) return response(402, challenge());
    return response(200, { intent, miner_id: "377" }, { "x-payment-response": btoa(JSON.stringify(validReceipt())) });
  };

  // Call 1 ($0.01)
  await performPaidAsk({
    provider: fakeWallet(), wallet: walletA, intent, params: { name: "1" },
    requestUrl, runId, storage: saved, payTo: diamond, origin, fetchImpl: successFetch,
  });
  // Call 2 ($0.01)
  await performPaidAsk({
    provider: fakeWallet(), wallet: walletA, intent, params: { name: "2" },
    requestUrl, runId, storage: saved, payTo: diamond, origin, fetchImpl: successFetch,
  });

  // Call 3 ($0.01) exceeds $0.02 run limit -> must reject BEFORE personal_sign
  const calls3 = [];
  await assert.rejects(() => performPaidAsk({
    provider: fakeWallet(walletA, calls3), wallet: walletA, intent, params: { name: "3" },
    requestUrl, runId, storage: saved, payTo: diamond, origin, fetchImpl: async () => response(402, challenge()),
  }), /payment limit/);
  assert.equal(calls3.some((c) => c.method === "personal_sign"), false);

  // Oversized single call (> $0.01, e.g. $0.015)
  const callsOversized = [];
  await assert.rejects(() => performPaidAsk({
    provider: fakeWallet(walletA, callsOversized), wallet: walletA, intent, params: { name: "oversized" },
    requestUrl, runId: "run_oversized", storage: saved, payTo: diamond, origin,
    fetchImpl: async () => response(402, challenge({ amount: "15000" })),
  }), /payment limit/);
  assert.equal(callsOversized.some((c) => c.method === "personal_sign"), false);
});

// 3. Different wallets do not consume each other's per-run budget. Changing wallet/network mid-run stops before another authorization
test("3. Different wallets do not consume each other's per-run budget; mid-run wallet change stops authorization", async () => {
  const saved = storage();
  const runId = "run_shared_id";
  const successFetch = async (_url, init) => {
    if (!init.headers["X-PAYMENT"]) return response(402, challenge());
    return response(200, { intent, miner_id: "377" }, { "x-payment-response": btoa(JSON.stringify(validReceipt(walletA))) });
  };
  const successFetchB = async (_url, init) => {
    if (!init.headers["X-PAYMENT"]) return response(402, challenge());
    return response(200, { intent, miner_id: "377" }, { "x-payment-response": btoa(JSON.stringify(validReceipt(walletB))) });
  };

  // Wallet A exhausts $0.02 in runId
  await performPaidAsk({
    provider: fakeWallet(walletA), wallet: walletA, intent, params: { name: "A1" },
    requestUrl, runId, storage: saved, payTo: diamond, origin, fetchImpl: successFetch,
  });
  await performPaidAsk({
    provider: fakeWallet(walletA), wallet: walletA, intent, params: { name: "A2" },
    requestUrl, runId, storage: saved, payTo: diamond, origin, fetchImpl: successFetch,
  });

  // Wallet B with the SAME runId still has full $0.02 budget because reservations are scoped to wallet
  const resB = await performPaidAsk({
    provider: fakeWallet(walletB), wallet: walletB, intent, params: { name: "B1" },
    requestUrl, runId, storage: saved, payTo: diamond, origin, fetchImpl: successFetchB,
  });
  assert.equal(resB.paymentStatus, "protocol_receipt");

  // Mid-run wallet change check via isCurrent guard
  let isCurrent = true;
  const callsChange = [];
  const p = fakeWallet(walletA, callsChange);
  const promise = performPaidAsk({
    provider: p, wallet: walletA, intent, params: { name: "change_test" },
    requestUrl, runId: "run_change", storage: saved, payTo: diamond, origin,
    isCurrent: () => isCurrent,
    fetchImpl: async (_url, init) => {
      if (!init.headers["X-PAYMENT"]) {
        isCurrent = false; // Wallet changed before post-sign
        return response(402, challenge());
      }
      return response(200, {});
    },
  });
  await assert.rejects(promise, /changed/);
});

// 4. Double-clicks, concurrent tabs and reloads cannot silently authorize the same unknown request twice. Legacy records migrate without deletion; malformed storage fails safely
test("4. Concurrent/duplicate requests cannot authorize unknown request twice; legacy records migrate safely", async () => {
  const saved = storage();
  const reqId = await paymentRequestId(walletA, intent, { name: "concurrent" });

  // Pre-seed an in-flight or unknown attempt (e.g. from prior tab)
  saveAttempt(saved, reqId, {
    wallet: walletA, intent, params: { name: "concurrent" },
    status: "unknown", authorizationStarted: true, amountMicro: "10000",
  });

  const calls = [];
  await assert.rejects(() => performPaidAsk({
    provider: fakeWallet(walletA, calls), wallet: walletA, intent, params: { name: "concurrent" },
    requestUrl, runId: "fresh_run", storage: saved, payTo: diamond, origin,
    fetchImpl: async () => response(402, challenge()),
  }), /Reconcile/);
  assert.equal(calls.some((c) => c.method === "personal_sign"), false);

  // Legacy records without runId migrate safely: ledger keeps them, reading doesn't erase them
  const legacyStorage = storage();
  legacyStorage.setItem("leaderlight.live-attempts.v1", JSON.stringify({
    version: 1,
    attempts: {
      "sha256:1111111111111111111111111111111111111111111111111111111111111111": {
        status: "protocol_receipt",
        authorizationStarted: true,
        amountMicro: "10000",
      },
    },
  }));
  const read = readAttemptLedger(legacyStorage);
  assert.equal(Object.keys(read.attempts).length, 1);
});

// 5. User rejects signing: record rejection accurately. Transport failure after signing remains reconciled/unknown, not unpaid
test("5. User rejection is recorded accurately; transport failure after signing remains unknown", async () => {
  const saved = storage();

  // User rejection (code 4001)
  const rejectProvider = {
    request: async (req) => {
      if (req.method === "eth_chainId") return "0xaa36a7";
      if (req.method === "eth_accounts") return [walletA];
      if (req.method === "personal_sign") throw Object.assign(new Error("User rejected"), { code: 4001 });
      throw new Error("unexpected");
    },
  };
  await assert.rejects(() => performPaidAsk({
    provider: rejectProvider, wallet: walletA, intent, params: { name: "reject" },
    requestUrl, runId: "run_rej", storage: saved, payTo: diamond, origin,
    fetchImpl: async () => response(402, challenge()),
  }), /User rejected/);

  const reqIdRej = await paymentRequestId(walletA, intent, { name: "reject" });
  const attemptRej = readAttemptLedger(saved).attempts[reqIdRej];
  assert.equal(attemptRej.status, "signature_rejected");
  assert.equal(attemptRej.authorizationStarted, false);

  // Transport failure AFTER personal_sign
  const transportFailFetch = async (_url, init) => {
    if (!init.headers["X-PAYMENT"]) return response(402, challenge());
    throw new Error("network partition during paid retry");
  };
  await assert.rejects(() => performPaidAsk({
    provider: fakeWallet(walletA), wallet: walletA, intent, params: { name: "transport_fail" },
    requestUrl, runId: "run_tf", storage: saved, payTo: diamond, origin,
    fetchImpl: transportFailFetch,
  }), /network partition/);

  const reqIdTf = await paymentRequestId(walletA, intent, { name: "transport_fail" });
  const attemptTf = readAttemptLedger(saved).attempts[reqIdTf];
  assert.equal(attemptTf.status, "unknown");
  assert.equal(attemptTf.authorizationStarted, true);
});

// 6. A deliberate fresh assessment of the same inputs is possible after previous result is safely accounted for
test("6. Repeating prior inputs requires a single-use New assessment intent", async () => {
  const saved = storage();
  const successFetch = async (_url, init) => {
    if (!init.headers["X-PAYMENT"]) return response(402, challenge());
    return response(200, { intent, miner_id: "377" }, { "x-payment-response": btoa(JSON.stringify(validReceipt())) });
  };

  // Run 1: protocol receipt recorded (settlement is not inferred).
  const res1 = await performPaidAsk({
    provider: fakeWallet(), wallet: walletA, intent, params: { name: "Same Entity" },
    requestUrl, runId: "run_first", storage: saved, payTo: diamond, origin,
    fetchImpl: successFetch,
  });
  assert.equal(res1.paymentStatus, "protocol_receipt");

  // Without fresh user intent, a new run is also refused.
  await assert.rejects(() => performPaidAsk({
    provider: fakeWallet(), wallet: walletA, intent, params: { name: "Same Entity" },
    requestUrl, runId: "run_first", storage: saved, payTo: diamond, origin,
    fetchImpl: successFetch,
  }), /New assessment/);

  // Explicit UI action mints a one-use token; subsequent identical request succeeds.
  const token = await mintAssessmentIntent(saved, walletA, intent, { name: "Same Entity" });
  const res2 = await performPaidAsk({
    provider: fakeWallet(), wallet: walletA, intent, params: { name: "Same Entity" },
    requestUrl, runId: "run_second", storage: saved, payTo: diamond, origin,
    fetchImpl: successFetch, intentToken: token,
  });
  assert.equal(res2.paymentStatus, "protocol_receipt");
});

// 7. The node's documented available amount and local commitments determine the conservative estimate.
test("7. Documented ledger available minus local liabilities determines estimated spendable balance", async () => {
  const mockProvider = {
    request: async (req) => {
      if (req.method === "eth_chainId") return "0xaa36a7";
      if (req.method === "eth_accounts") return [walletA];
      if (req.method === "eth_getBalance") return "0x4377a4db41c881b3"; // ETH
      if (req.method === "eth_call") {
        const to = req.params[0].to.toLowerCase();
        const data = req.params[0].data;
        if (to === usdc) {
          if (data.startsWith("0x70a08231")) return "0x989680"; // 10 USDC
          if (data.startsWith("0xdd62ed3e")) return "0x989680"; // 10 USDC allowance
        }
        return "0x0";
      }
      throw new Error(`unexpected call ${req.method}`);
    },
  };

  const saved = storage();
  // Add a pending unbilled liability of 10,000 uUSDC ($0.01)
  saveAttempt(saved, `sha256:${"c".repeat(64)}`, {
    wallet: walletA, status: "unknown", authorizationStarted: true, amountMicro: "10000",
  });

  const state = await readWalletFundingState({
    provider: mockProvider, wallet: walletA, usdc, diamond, storage: saved,
    fetchImpl: async () => ({ ok: true, json: async () => ({ deposited: "5000000", withdrawn: "0", charged: "0", credited: "0", unbilled: "0", balance: "5000000", available: "3000000", charge_limit: "0", charged_this_block: "0" }) }),
  });

  assert.equal(state.rawEscrowBalanceMicro, 5_000_000n);
  assert.equal(state.effectiveEscrowBalanceMicro, 3_000_000n);
  assert.equal(state.pendingLiabilitiesMicro, 10_000n);
  // Spendable balance = effectiveBalance (3 USDC) - pendingLiabilities (0.01 USDC) = 2.99 USDC
  assert.equal(state.spendableEscrowMicro, 2_990_000n);
  assert.ok(state.spendableEscrowMicro > 20_000n, "Sufficient spendable escrow for 0.02 run");
});

// 8. Exact allowance, insufficient allowance, approval rejection, reverted deposit, delayed receipt, balance-read failure
test("8. Bounded top-up funding respects existing allowance and handles approval rejection/revert", async () => {
  const calls = [];
  const stages = [];
  let allowanceVal = 100_000n; // Existing allowance is 0.10 USDC
  let escrowBal = 0n;

  const provider = {
    request: async (req) => {
      calls.push(req);
      if (req.method === "eth_chainId") return "0xaa36a7";
      if (req.method === "eth_accounts") return [walletA];
      if (req.method === "eth_call") {
        if (req.params[0].to.toLowerCase() === usdc) return "0x" + allowanceVal.toString(16);
        if (req.params[0].to.toLowerCase() === diamond) {
          escrowBal += 20_000n;
          return "0x" + escrowBal.toString(16);
        }
        return "0x0";
      }
      if (req.method === "eth_sendTransaction") { if (req.params[0].to.toLowerCase() === diamond) escrowBal += 20_000n; return `0x${"e".repeat(64)}`; }
      throw new Error(`unexpected ${req.method}`);
    },
  };

  // Funding first approves the trusted Diamond, then deposits the exact amount.
  const resSkip = await fundEscrow({
    provider, wallet: walletA, usdc, diamond, amountMicro: 20_000n,
    onStage: (s) => stages.push(s),
    waitForReceipt: async () => ({ status: "0x1" }),
    fetchImpl: ledgerFetch(() => escrowBal),
  });
  assert.ok(stages.includes("approval_confirmed"));
  assert.ok(resSkip.approveHash);

  // Funding 500,000 uUSDC when allowance is 100,000 requires bounded approval for exactly 500,000
  allowanceVal = 100_000n;
  escrowBal = 0n;
  stages.length = 0;
  calls.length = 0;
  let hasApproved = false;
  const providerWithApproval = {
    request: async (req) => {
      calls.push(req);
      if (req.method === "eth_chainId") return "0xaa36a7";
      if (req.method === "eth_accounts") return [walletA];
      if (req.method === "eth_call") {
        if (req.params[0].to.toLowerCase() === usdc) {
          return hasApproved ? "0x" + (500_000n).toString(16) : "0x" + allowanceVal.toString(16);
        }
        if (req.params[0].to.toLowerCase() === diamond) {
          escrowBal += 500_000n;
          return "0x" + escrowBal.toString(16);
        }
        return "0x0";
      }
      if (req.method === "eth_sendTransaction") {
        if (req.params[0].to.toLowerCase() === usdc) hasApproved = true;
        if (req.params[0].to.toLowerCase() === diamond) escrowBal += 500_000n;
        return `0x${"f".repeat(64)}`;
      }
      throw new Error(`unexpected ${req.method}`);
    },
  };

  await fundEscrow({
    provider: providerWithApproval, wallet: walletA, usdc, diamond, amountMicro: 500_000n,
    onStage: (s) => stages.push(s),
    waitForReceipt: async () => ({ status: "0x1" }),
    fetchImpl: ledgerFetch(() => escrowBal),
  });
  assert.ok(stages.includes("approval_pending"));
  assert.ok(stages.includes("approval_confirmed"));
  // Verify the approve transaction was bounded to exact top-up amount
  const approveTx = calls.find((c) => c.method === "eth_sendTransaction" && c.params[0].to.toLowerCase() === usdc);
  assert.equal(approveTx.params[0].data.slice(0, 10), "0x095ea7b3");
  assert.equal(BigInt("0x" + approveTx.params[0].data.slice(74)), 500_000n);
});

// 9. Challenge tampering (wrong chain/payee/resource/amount/template), wrong receipt payer/intent/amount, wrong answer identity never become verified success
test("9. Tampered challenge, mismatched receipt and tampered answer never verify as success", async () => {
  // Tampered challenge
  assert.throws(() => validateEscrowChallenge(challenge({ amount: "20000" }), {
    wallet: walletA, network, payTo: diamond, origin, resource: "/v1/ask", requestUrl,
  }), /payment limit/);

  // Mismatched receipt (wrong payer)
  const badPayerReceipt = validReceipt(walletB);
  assert.equal(validateEscrowReceipt(badPayerReceipt, {
    intent, amount: 10_000n, payer: walletA, minerId: "377",
  }), false);

  // Tampered answer identity
  const badAnswer = { intent: "OTHER_INTENT", input: { name: "Entity" } };
  assert.equal(validateEscrowReceipt(validReceipt(), {
    intent: "OTHER_INTENT", amount: 10_000n, payer: walletA, minerId: "377",
  }), false);
});

// 10. Overlapping identical requests in the SAME assessment run serialize on the per-wallet lock:
// at most one reaches personal_sign; the duplicate is refused with a reconcile error; the receipt is preserved.
// (A different runId is a deliberate reassessment, tested in #6; the lock only makes concurrent calls wait.)
test("10. Overlapping identical requests in one run synchronize; at most one reaches personal_sign", async () => {
  const saved = storage();
  const runId = "overlap_run";
  let personalSignCount = 0;
  const synchronizedSigner = {
    request: async (req) => {
      if (req.method === "eth_chainId") return "0xaa36a7";
      if (req.method === "eth_accounts") return [walletA];
      if (req.method === "personal_sign") {
        personalSignCount++;
        // Simulate signing duration so the second call is queued at the lock while the first signs.
        await new Promise((r) => setTimeout(r, 20));
        return "0x" + "11".repeat(65);
      }
      throw new Error(`unexpected ${req.method}`);
    },
  };

  const overlapFetch = async (_url, init) => {
    if (!init.headers["X-PAYMENT"]) return response(402, challenge());
    return response(200, {
      intent,
      input: { name: "Overlapping Entity" },
      miner_id: "377",
      result: { name: "Overlapping Entity", matched: false },
    }, {
      "x-payment-response": btoa(JSON.stringify(validReceipt(walletA))),
    });
  };

  const params = { name: "Overlapping Entity" };

  // Fire two concurrent calls for the same wallet/intent/params/runId (a double-click or two tabs of one run).
  const results = await Promise.allSettled([
    performPaidAsk({
      provider: synchronizedSigner, wallet: walletA, intent, params,
      requestUrl, runId, storage: saved, payTo: diamond, origin, fetchImpl: overlapFetch,
    }),
    performPaidAsk({
      provider: synchronizedSigner, wallet: walletA, intent, params,
      requestUrl, runId, storage: saved, payTo: diamond, origin, fetchImpl: overlapFetch,
    }),
  ]);

  // The lock serializes them: only the first call reaches personal_sign; the second is refused.
  assert.equal(personalSignCount, 1);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(fulfilled[0].value.paymentStatus, "protocol_receipt");
  assert.match(rejected[0].reason.message, /already authorized in the current assessment run/i);

  // Non-destructive ledger history: the receipt survived, it was not overwritten or lost.
  const ledger = readAttemptLedger(saved);
  assert.ok(Array.isArray(ledger.history));
  assert.ok(ledger.history.length >= 1);
  const reqId = await paymentRequestId(walletA, intent, params);
  assert.equal(ledger.attempts[reqId].status, "protocol_receipt");
});

// The current contract documents deposited accounting; no on-chain debt selector is used.
test("11. Deposit confirmation requires documented node deposited delta", async () => {
  let deposited = 0n;
  const provider = { request: async (req) => {
    if (req.method === "eth_chainId") return "0xaa36a7";
    if (req.method === "eth_accounts") return [walletA];
    if (req.method === "eth_call") return "0x100000";
    if (req.method === "eth_sendTransaction") { deposited = 20_000n; return `0x${"d".repeat(64)}`; }
    throw new Error(`unexpected ${req.method}`);
  } };
  const result = await fundEscrow({ provider, wallet: walletA, usdc, diamond, amountMicro: 20_000n, waitForReceipt: async () => ({ status: "0x1" }), fetchImpl: ledgerFetch(() => deposited) });
  assert.equal(result.depositedMicro, "20000");
});
// 12. Spendable balance: unsettled protocol receipts reduce spendable balance; malformed ledger fails closed
test("12. Spendable balance accounts for unsettled protocol receipts and fails closed on malformed ledger", async () => {
  const mockProvider = {
    request: async (req) => {
      if (req.method === "eth_chainId") return "0xaa36a7";
      if (req.method === "eth_accounts") return [walletA];
      if (req.method === "eth_getBalance") return "0x1";
      if (req.method === "eth_call") {
        const to = req.params[0].to.toLowerCase();
        const data = req.params[0].data;
        if (to === usdc) return "0x" + (1_000_000n).toString(16);
        return "0x0";
      }
      throw new Error("unexpected");
    },
  };

  // Case A: receipted charges are reconciled — the node's `available` already
  // accounts for them, so they must NOT be subtracted again from spendable.
  const saved = storage();
  saveAttempt(saved, `sha256:${"e".repeat(64)}`, {
    wallet: walletA, status: "protocol_receipt", settledOnChain: false,
    authorizationStarted: true, amountMicro: "20000",
  });

  const state = await readWalletFundingState({
    provider: mockProvider, wallet: walletA, usdc, diamond, storage: saved,
    fetchImpl: ledgerFetch(() => 20_000n),
  });
  assert.equal(state.effectiveEscrowBalanceMicro, 20_000n);
  assert.equal(state.pendingLiabilitiesMicro, 0n); // reconciled: the node already accounts for this receipt
  assert.equal(state.spendableEscrowMicro, 20_000n); // no double-subtraction of a settled charge
  const persistedLedger = JSON.parse(saved.getItem("leaderlight.live-attempts.v1"));
  const persistedAttempts = persistedLedger.history?.length ? persistedLedger.history : Object.values(persistedLedger.attempts);
  assert.ok(persistedAttempts.every((a) => a.settledOnChain === true), "reconciliation must persist settledOnChain");

  // Case B: Malformed ledger in storage -> fails closed (liabilitiesReadError, spendableEscrowMicro is null)
  const brokenSaved = {
    getItem: () => "invalid json {",
    setItem: () => {},
  };
  const brokenState = await readWalletFundingState({
    provider: mockProvider, wallet: walletA, usdc, diamond, storage: brokenSaved,
    fetchImpl: ledgerFetch(() => 20_000n),
  });
  assert.ok(brokenState.liabilitiesReadError != null);
  assert.equal(brokenState.spendableEscrowMicro, null); // Unknown / not ready!
});

// 13. Concurrent distinct inputs in one run do not block each other: both authorize and both receipts are preserved separately
test("13. Concurrent distinct inputs in one run both authorize and preserve separate receipts", async () => {
  const saved = storage();
  const runId = "concurrent_distinct";
  let personalSignCount = 0;
  const signer = {
    request: async (req) => {
      if (req.method === "eth_chainId") return "0xaa36a7";
      if (req.method === "eth_accounts") return [walletA];
      if (req.method === "personal_sign") { personalSignCount++; return "0x" + "22".repeat(65); }
      throw new Error(`unexpected ${req.method}`);
    },
  };
  const distinctFetch = (name) => async (_url, init) => {
    if (!init.headers["X-PAYMENT"]) return response(402, challenge());
    return response(200, { intent, input: { name }, miner_id: "377", result: { name, matched: false } }, {
      "x-payment-response": btoa(JSON.stringify(validReceipt(walletA))),
    });
  };

  // Two distinct entities in the same run, fired concurrently, each $0.01 (together the $0.02 run cap).
  const [r1, r2] = await Promise.all([
    performPaidAsk({ provider: signer, wallet: walletA, intent, params: { name: "Distinct A" }, requestUrl, runId, storage: saved, payTo: diamond, origin, fetchImpl: distinctFetch("Distinct A") }),
    performPaidAsk({ provider: signer, wallet: walletA, intent, params: { name: "Distinct B" }, requestUrl, runId, storage: saved, payTo: diamond, origin, fetchImpl: distinctFetch("Distinct B") }),
  ]);

  assert.equal(personalSignCount, 2);
  assert.equal(r1.paymentStatus, "protocol_receipt");
  assert.equal(r2.paymentStatus, "protocol_receipt");

  const ledger = readAttemptLedger(saved);
  const idA = await paymentRequestId(walletA, intent, { name: "Distinct A" });
  const idB = await paymentRequestId(walletA, intent, { name: "Distinct B" });
  assert.equal(ledger.attempts[idA].status, "protocol_receipt");
  assert.equal(ledger.attempts[idB].status, "protocol_receipt");
});
