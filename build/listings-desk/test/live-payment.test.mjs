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
  saveAttempt,
  validateEscrowChallenge,
  validateEscrowReceipt,
  waitForTransaction,
} from "../public/live-payment.mjs";

const wallet = "0x1111111111111111111111111111111111111111";
const diamond = "0x3624eb012b5e998bb57b6be6c9cfc9c4bc5eb99b";
const usdc = "0xcc194e1a843b658526d0d5c431f670028582ae17";
const origin = "https://desk.example";
const requestUrl = `${origin}/api/engine/v1/ask`;
const intent = "SANCTIONS_SCREENING_MATCH_GENERAL";
const params = { name: "Example Entity" };
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

function fakeWallet(calls = []) {
  return {
    async request(request) {
      calls.push(request);
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_accounts") return [wallet];
      if (request.method === "personal_sign") return "0xdead";
      throw new Error(`unexpected provider request: ${request.method}`);
    },
  };
}

test("escrow calldata uses ABI words and the documented deposit selector", () => {
  assert.equal(encodeFunctionCall("0xf688bcfb", ["uint256"], [3_000_000n]),
    "0xf688bcfb" + "0".repeat(58) + "2dc6c0");
  assert.equal(
    encodeFunctionCall("0x095ea7b3", ["address", "uint256"], [diamond, 3_000_000n]),
    "0x095ea7b3" + diamond.slice(2).padStart(64, "0") + "0".repeat(58) + "2dc6c0",
  );
  assert.throws(() => parseMicroUsdc("1<script>"), /unsigned integer/);
});

test("transaction confirmation requires the matching mined successful receipt", async () => {
  const hash = `0x${"a".repeat(64)}`;
  const providerWithReceipt = (receipt) => ({
    request: async () => receipt,
  });
  assert.deepEqual(await waitForTransaction(providerWithReceipt({
    transactionHash: hash, status: "0x1",
  }), hash), { transactionHash: hash, status: "0x1" });
  await assert.rejects(() => waitForTransaction(providerWithReceipt({
    transactionHash: `0x${"b".repeat(64)}`, status: "0x1",
  }), hash), /mismatched receipt/);
  await assert.rejects(() => waitForTransaction(providerWithReceipt({
    transactionHash: hash, status: "0x0",
  }), hash), /mismatched receipt/);
  let time = 0;
  await assert.rejects(() => waitForTransaction({ request: async () => null }, hash, {
    timeoutMs: 2, pollMs: 1, now: () => time, sleep: async () => { time += 2; },
  }), /still pending/);
});

test("challenge network, resource, payee, and amount mismatches reject before signing", async () => {
  for (const badChallenge of [
    challenge({ network: "eip155:1" }),
    challenge({ resource: "/v1/other" }),
    challenge({ payTo: wallet }),
    challenge({ amount: "10001" }),
  ]) {
    const calls = [];
    await assert.rejects(() => performPaidAsk({
      provider: fakeWallet(calls), wallet, intent, params, requestUrl,
      storage: storage(), payTo: diamond, origin,
      fetchImpl: async () => response(402, badChallenge),
    }));
    assert.equal(calls.some((call) => call.method === "personal_sign"), false);
  }
  const calls = [];
  const saved = storage();
  saveAttempt(saved, `sha256:${"b".repeat(64)}`, {
    status: "protocol_receipt",
    authorizationStarted: true,
    amountMicro: "15000",
  });
  await assert.rejects(() => performPaidAsk({
    provider: fakeWallet(calls), wallet, intent, params, requestUrl,
    storage: saved, payTo: diamond, origin,
    fetchImpl: async () => response(402, challenge()),
    onAttempt() {},
  }), /payment limit/);
  assert.equal(calls.some((call) => call.method === "personal_sign"), false);
});

test("wallet on the wrong network rejects before signing", async () => {
  const calls = [];
  const provider = fakeWallet(calls);
  provider.request = async (request) => {
    calls.push(request);
    if (request.method === "eth_chainId") return "0x1";
    if (request.method === "eth_accounts") return [wallet];
    return "0xdead";
  };
  await assert.rejects(() => performPaidAsk({
    provider, wallet, intent, params, requestUrl, storage: storage(),
    payTo: diamond, origin, fetchImpl: async () => response(402, challenge()),
  }), /Sepolia/);
  assert.equal(calls.some((call) => call.method === "personal_sign"), false);
});

test("arbitrary and mismatched escrow receipt objects are never valid", () => {
  const expected = { intent, amount: 10_000n, payer: wallet, minerId: "377" };
  assert.equal(validateEscrowReceipt({ arbitrary: true }, expected), false);
  const valid = {
    receipt_hash: `0x${"a".repeat(64)}`,
    rail: "escrow",
    payer: wallet,
    miner: "377",
    intent,
    amount_uusdc: "10000",
    epoch_id: 314,
    settlement: "epoch",
    chain: "telegraph",
    timestamp: 1789466181,
  };
  assert.equal(validateEscrowReceipt(valid, expected), true);
  assert.equal(validateEscrowReceipt({ ...valid, amount_uusdc: "10001" }, expected), false);
  assert.equal(validateEscrowReceipt({ ...valid, payer: diamond }, expected), false);
  assert.equal(validateEscrowReceipt({ ...valid, intent: "OTHER" }, expected), false);
  assert.equal(validateEscrowReceipt({ ...valid, miner: "other-miner" }, expected), false);
});

test("authorized outcomes persist and block duplicate signing after reload", async () => {
  const saved = storage();
  const calls = [];
  const provider = fakeWallet(calls);
  let fetchCount = 0;
  const fetchImpl = async (_url, init) => {
    fetchCount++;
    if (!init.headers["X-PAYMENT"]) return response(402, challenge());
    throw new Error("response connection lost");
  };
  await assert.rejects(() => performPaidAsk({
    provider, wallet, intent, params, requestUrl, storage: saved,
    payTo: diamond, origin, fetchImpl,
  }), /response connection lost/);
  assert.equal(readAttemptLedger(saved).attempts != null, true);
  assert.equal(calls.filter((call) => call.method === "personal_sign").length, 1);
  await assert.rejects(() => performPaidAsk({
    provider, wallet, intent, params, requestUrl, storage: saved,
    payTo: diamond, origin, fetchImpl,
  }), /Reconcile/);
  assert.equal(fetchCount, 2);
  assert.equal(calls.filter((call) => call.method === "personal_sign").length, 1);
});

test("valid protocol receipt and answer are saved before returning to the renderer", async () => {
  const saved = storage();
  const receipt = {
    receipt_hash: `0x${"a".repeat(64)}`,
    rail: "escrow",
    payer: wallet,
    miner: "377",
    intent,
    amount_uusdc: "10000",
    epoch_id: 314,
    settlement: "epoch",
    chain: "telegraph",
    timestamp: 1789466181,
  };
  const answer = { intent, input: params, miner_id: "377", result: { matched: false } };
  let callCount = 0;
  const result = await performPaidAsk({
    provider: fakeWallet(), wallet, intent, params, requestUrl, storage: saved,
    payTo: diamond, origin,
    fetchImpl: async (_url, init) => {
      callCount++;
      if (!init.headers["X-PAYMENT"]) return response(402, challenge());
      return response(200, answer, {
        "x-payment-response": btoa(JSON.stringify(receipt)),
      });
    },
  });
  assert.equal(result.paymentStatus, "protocol_receipt");
  assert.equal(result.amountMicro, "10000");
  const attempt = readAttemptLedger(saved).attempts[result.requestId];
  assert.equal(attempt.status, "protocol_receipt");
  assert.deepEqual(attempt.answer, answer);
  assert.deepEqual(attempt.receipt, receipt);
  assert.equal(callCount, 2);
  await assert.rejects(() => performPaidAsk({
    provider: fakeWallet(), wallet, intent, params, requestUrl, storage: saved,
    payTo: diamond, origin, fetchImpl: async () => response(402, challenge()),
  }), /Reconcile/);
});

test("failed approval receipt never submits the escrow deposit", async () => {
  const calls = [];
  const provider = fakeWallet(calls);
  provider.request = async (request) => {
    calls.push(request);
    if (request.method === "eth_chainId") return "0xaa36a7";
    if (request.method === "eth_accounts") return [wallet];
    if (request.method === "eth_call") return "0x0";
    if (request.method === "eth_sendTransaction") return `0x${"b".repeat(64)}`;
    throw new Error(`unexpected provider request: ${request.method}`);
  };
  await assert.rejects(() => fundEscrow({
    provider, wallet, usdc, diamond, isCurrent: () => true,
    waitForReceipt: async () => { throw new Error("approval reverted"); },
  }), /approval reverted/);
  const sent = calls.filter((call) => call.method === "eth_sendTransaction");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params[0].to.toLowerCase(), usdc);
  assert.equal(sent[0].params[0].data.slice(0, 10), "0x095ea7b3");
});

test("insufficient allowance and failed deposit receipt never report funded", async () => {
  const calls = [];
  const provider = fakeWallet(calls);
  provider.request = async (request) => {
    calls.push(request);
    if (request.method === "eth_chainId") return "0xaa36a7";
    if (request.method === "eth_accounts") return [wallet];
    if (request.method === "eth_call") return "0x0";
    if (request.method === "eth_sendTransaction") return `0x${"c".repeat(64)}`;
    throw new Error(`unexpected provider request: ${request.method}`);
  };
  await assert.rejects(() => fundEscrow({
    provider, wallet, usdc, diamond, isCurrent: () => true,
    waitForReceipt: async () => ({ status: "0x1" }),
  }), /allowance is insufficient/);
  assert.equal(calls.filter((call) => call.method === "eth_sendTransaction").length, 1);

  const depositCalls = [];
  const depositProvider = fakeWallet(depositCalls);
  let balanceReads = 0;
  depositProvider.request = async (request) => {
    depositCalls.push(request);
    if (request.method === "eth_chainId") return "0xaa36a7";
    if (request.method === "eth_accounts") return [wallet];
    if (request.method === "eth_call") {
      if (request.params[0].to.toLowerCase() === usdc) return "0x2dc6c0";
      balanceReads++;
      return balanceReads === 1 ? "0x0" : "0x0";
    }
    if (request.method === "eth_sendTransaction") return `0x${"d".repeat(64)}`;
    throw new Error(`unexpected provider request: ${request.method}`);
  };
  let receiptCount = 0;
  await assert.rejects(() => fundEscrow({
    provider: depositProvider, wallet, usdc, diamond, isCurrent: () => true,
    waitForReceipt: async () => {
      receiptCount++;
      if (receiptCount === 2) throw new Error("deposit reverted");
      return { status: "0x1" };
    },
  }), /deposit reverted/);
  assert.equal(depositCalls.filter((call) => call.method === "eth_sendTransaction").length, 2);
});

test("funding confirms approval, allowance, deposit receipt, and credited balance", async () => {
  const calls = [];
  let readCount = 0;
  const provider = fakeWallet(calls);
  provider.request = async (request) => {
    calls.push(request);
    if (request.method === "eth_chainId") return "0xaa36a7";
    if (request.method === "eth_accounts") return [wallet];
    if (request.method === "eth_call") {
      if (request.params[0].to.toLowerCase() === usdc) return "0x2dc6c0";
      readCount++;
      return readCount === 1 ? "0x0" : "0x2dc6c0";
    }
    if (request.method === "eth_sendTransaction") return `0x${String(calls.length).padStart(64, "0")}`;
    throw new Error(`unexpected provider request: ${request.method}`);
  };
  const result = await fundEscrow({
    provider, wallet, usdc, diamond, isCurrent: () => true,
    waitForReceipt: async () => ({ status: "0x1" }),
  });
  const sent = calls.filter((call) => call.method === "eth_sendTransaction");
  assert.equal(sent.length, 2);
  assert.equal(sent[1].params[0].data.slice(0, 10), "0xf688bcfb");
  assert.equal(result.balanceMicro, "3000000");
  assert.equal(LIVE_PAYMENT_LIMITS.chainId, "0xaa36a7");
});

test("payment attempt ledger rejects malformed saved state rather than clearing it", () => {
  const brokenStorage = {
    getItem: () => "{",
    setItem() {},
  };
  assert.throws(() => readAttemptLedger(brokenStorage), /reconcile/);
  const saved = storage();
  saveAttempt(saved, `sha256:${"a".repeat(64)}`, { status: "unknown", authorizationStarted: true });
  assert.equal(Object.values(readAttemptLedger(saved).attempts)[0].status, "unknown");
});

test("wrong request origin is rejected before signing", () => {
  assert.throws(() => validateEscrowChallenge(challenge(), {
    wallet,
    network,
    payTo: diamond,
    origin: "https://other.example",
    resource: "/v1/ask",
    requestUrl,
  }), /origin\/resource/);
});

  test("payment fingerprints are stable for the same wallet and request", async () => {
    assert.equal(
      await paymentRequestId(wallet, intent, { b: 2, a: 1 }),
      await paymentRequestId(wallet, intent, { a: 1, b: 2 }),
    );
    assert.notEqual(await paymentRequestId(wallet, intent, params),
      await paymentRequestId(diamond, intent, params));
  });
