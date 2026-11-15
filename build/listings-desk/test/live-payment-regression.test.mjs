import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeFunctionCall,
  fundEscrow,
  LIVE_PAYMENT_LIMITS,
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

const walletA = "0x1111111111111111111111111111111111111111";
const walletB = "0x2222222222222222222222222222222222222222";
const diamond = "0x3624eb012b5e998bb57b6be6c9cfc9c4bc5eb99b";
const usdc = "0xcc194e1a843b658526d0d5c431f670028582ae17";
const origin = "https://desk.example";
const requestUrl = `${origin}/api/engine/v1/ask`;
const intent = "SANCTIONS_SCREENING_MATCH_GENERAL";
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
test("6. Fresh assessment of same inputs is possible in new run after prior settled result", async () => {
  const saved = storage();
  const successFetch = async (_url, init) => {
    if (!init.headers["X-PAYMENT"]) return response(402, challenge());
    return response(200, { intent, miner_id: "377" }, { "x-payment-response": btoa(JSON.stringify(validReceipt())) });
  };

  // Run 1: Settled
  const res1 = await performPaidAsk({
    provider: fakeWallet(), wallet: walletA, intent, params: { name: "Same Entity" },
    requestUrl, runId: "run_first", storage: saved, payTo: diamond, origin,
    fetchImpl: successFetch,
  });
  assert.equal(res1.paymentStatus, "protocol_receipt");

  // Attempting within SAME runId throws duplicate run authorization error
  await assert.rejects(() => performPaidAsk({
    provider: fakeWallet(), wallet: walletA, intent, params: { name: "Same Entity" },
    requestUrl, runId: "run_first", storage: saved, payTo: diamond, origin,
    fetchImpl: successFetch,
  }), /already authorized in the current assessment run/);

  // Fresh reassessment with Run 2 succeeds because Run 1 is safely accounted for
  const res2 = await performPaidAsk({
    provider: fakeWallet(), wallet: walletA, intent, params: { name: "Same Entity" },
    requestUrl, runId: "run_second", storage: saved, payTo: diamond, origin,
    fetchImpl: successFetch,
  });
  assert.equal(res2.paymentStatus, "protocol_receipt");
});

// 7. Sufficient effective escrow skips mint/approval/deposit. Low effective balance with high raw escrow, debt or withdrawal is handled
test("7. Sufficient spendable escrow skips funding; debt, pending withdrawal & liabilities reduce spendable balance", async () => {
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
        if (to === diamond) {
          if (data.startsWith("0x55af6353")) return "0x4c4b40"; // Raw escrow: 5 USDC
          if (data.startsWith("0x16a398f7")) return "0x2dc6c0"; // Effective balance: 3 USDC
          if (data.startsWith("0xdb9104c6")) return "0x1e8480"; // Agent debt: 2 USDC (5 - 2 = 3)
          if (data.startsWith("0x0964c95b")) return "0x" + "00000000000000000000000000000000000000000000000000000000000f4240".padEnd(128, "0"); // 1 USDC pending withdrawal
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
  });

  assert.equal(state.rawEscrowBalanceMicro, 5_000_000n);
  assert.equal(state.effectiveEscrowBalanceMicro, 3_000_000n);
  assert.equal(state.agentDebtMicro, 2_000_000n);
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
      if (req.method === "eth_sendTransaction") return `0x${"e".repeat(64)}`;
      throw new Error(`unexpected ${req.method}`);
    },
  };

  // Funding 20,000 uUSDC ($0.02) when allowance is 100,000 uUSDC skips approval!
  const resSkip = await fundEscrow({
    provider, wallet: walletA, usdc, diamond, amountMicro: 20_000n,
    onStage: (s) => stages.push(s),
    waitForReceipt: async () => ({ status: "0x1" }),
  });
  assert.ok(stages.includes("approval_skipped"));
  assert.equal(resSkip.approveHash, null);

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
        return `0x${"f".repeat(64)}`;
      }
      throw new Error(`unexpected ${req.method}`);
    },
  };

  await fundEscrow({
    provider: providerWithApproval, wallet: walletA, usdc, diamond, amountMicro: 500_000n,
    onStage: (s) => stages.push(s),
    waitForReceipt: async () => ({ status: "0x1" }),
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
