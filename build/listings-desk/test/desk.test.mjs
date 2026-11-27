import { test } from "node:test";
import assert from "node:assert/strict";
import { runDesk, contentDigest } from "../src/desk.mjs";
import { ENGINE_INTENT_BY_CHECK, resolveCaps } from "../src/config.mjs";
import { ask, PaymentRequiredError } from "../src/engine.mjs";
import { renderHtml, renderHtmlFragment, renderMarkdown } from "../src/memo.mjs";
import { fetchWithEscrow, PaymentPolicy, PaymentPolicyError, validateEscrowReceipt } from "../src/x402.mjs";
import { isEthereumAddress, requestMetaMaskAccounts, selectMetaMaskProvider } from "../public/wallet-client.mjs";
import pageHandler from "../api/index.js";
import memoHandler from "../api/memo.js";

const wallet = "0x1111111111111111111111111111111111111111";
const payTo = "0x2222222222222222222222222222222222222222";
const SANCTIONS_INTENT = ENGINE_INTENT_BY_CHECK.SANCTIONS_SCREENING_MATCH;
const SOCIAL_INTENT = ENGINE_INTENT_BY_CHECK.SOCIAL_BOT_DETECTION;
const expected = {
  network: "eip155:11155111",
  payTo,
  origin: "https://engine.test",
  resource: "/v1/ask",
};

function fakeReceipt(intent, overrides = {}) {
  return {
    intent,
    mode: "real",
    minerId: "1",
    minerName: "test-miner",
    costUsd: 0.01,
    durationMs: 5,
    signalHash: `0x${"a".repeat(64)}`,
    result: {},
    evidenceStatus: "invalid",
    proofStatus: "incomplete",
    paymentStatus: "unknown",
    ...overrides,
  };
}

function escrowChallenge({ amount = "10000", network = expected.network, payee = payTo, resource = expected.resource, templateOverrides = {} } = {}) {
  const template = [
    "Telegraph Escrow Payment",
    `Wallet: ${templateOverrides.wallet ?? "{from}"}`,
    `Pay To: ${templateOverrides.payTo ?? payee}`,
    `Network: ${templateOverrides.network ?? network}`,
    `Amount: ${templateOverrides.amount ?? amount} uUSDC`,
    `Resource: ${templateOverrides.resource ?? resource}`,
    `Nonce: ${templateOverrides.nonce ?? "{nonce}"}`,
    `Valid After: ${templateOverrides.validAfter ?? "{validAfter}"}`,
    `Valid Before: ${templateOverrides.validBefore ?? "{validBefore}"}`,
  ].join("\n");
  return {
    accepts: [{
      scheme: "escrow",
      network,
      payTo: payee,
      extra: { resource, message: template },
    }],
  };
}

function escrowReceipt(overrides = {}) {
  return {
    receipt_hash: `0x${"b".repeat(64)}`,
    rail: "escrow",
    payer: wallet,
    miner: "377",
    intent: SANCTIONS_INTENT,
    amount_uusdc: "10000",
    epoch_id: 314,
    settlement: "epoch",
    chain: "telegraph",
    timestamp: 1789466181,
    ...overrides,
  };
}

function response(status, body, headers = {}) {
  return new Response(body == null ? null : JSON.stringify(body), { status, headers });
}

function settlementResponse(status, receipt = escrowReceipt()) {
  const headers = receipt
    ? { "x-payment-response": Buffer.from(JSON.stringify(receipt)).toString("base64") }
    : {};
  return response(status, { ok: status === 200 }, headers);
}

function httpResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    end(body = "") { this.body = String(body); return this; },
  };
}

test("Vercel handlers are mock-only and validate methods and candidate input", async () => {
  const page = httpResponse();
  pageHandler({ method: "GET" }, page);
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /SIMULATED \/ OFFLINE/);
  assert.match(page.body, /Preview the memo format/);
  assert.equal(page.headers["Cache-Control"], "no-store");

  const memo = httpResponse();
  await memoHandler({ method: "GET", url: "/memo?token=DEMO", headers: { host: "localhost" } }, memo);
  assert.equal(memo.statusCode, 200);
  assert.match(memo.body, /SIMULATED\/OFFLINE/);
  assert.match(memo.body, /Actually spent: \$0 USD/);

  const invalid = httpResponse();
  await memoHandler({ method: "GET", url: "/memo", headers: { host: "localhost" } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const methodNotAllowed = httpResponse();
  await memoHandler({ method: "POST", url: "/memo?token=DEMO", headers: { host: "localhost" } }, methodNotAllowed);
  assert.equal(methodNotAllowed.statusCode, 405);
});

test("MetaMask provider discovery prefers EIP-6963 and only accepts MetaMask providers", () => {
  const metamask = { isMetaMask: true, request() {} };
  const otherWallet = { isMetaMask: false, request() {} };
  const announced = { request() {} };
  assert.equal(selectMetaMaskProvider({ providers: [otherWallet, metamask] }), metamask);
  assert.equal(selectMetaMaskProvider(otherWallet, [
    { info: { rdns: "io.metamask" }, provider: announced },
  ]), announced);
  assert.equal(selectMetaMaskProvider(otherWallet, [
    { info: { rdns: 7 }, provider: announced },
    null,
  ]), null);
  assert.equal(selectMetaMaskProvider(otherWallet), null);
});

test("MetaMask connection requests accounts only and validates returned addresses", async () => {
  const calls = [];
  const accounts = [wallet, payTo];
  const provider = {
    request: async (request) => {
      calls.push(request);
      return accounts;
    },
  };
  const result = await requestMetaMaskAccounts(provider);
  assert.deepEqual(result, accounts);
  assert.notEqual(result, accounts);
  assert.deepEqual(calls, [{ method: "eth_requestAccounts", params: [] }]);
  assert.equal(isEthereumAddress(wallet), true);
  assert.equal(isEthereumAddress("0x1234"), false);
  await assert.rejects(() => requestMetaMaskAccounts({ request: async () => [wallet, "not-an-address"] }), /valid Ethereum accounts/);
  await assert.rejects(() => requestMetaMaskAccounts({ request: async () => [] }), /valid Ethereum accounts/);
});

test("MetaMask user rejection is preserved without requesting a signature", async () => {
  const rejection = Object.assign(new Error("User rejected"), { code: 4001 });
  const methods = [];
  await assert.rejects(() => requestMetaMaskAccounts({
    request: async ({ method }) => {
      methods.push(method);
      throw rejection;
    },
  }), (error) => error === rejection && error.code === 4001);
  assert.deepEqual(methods, ["eth_requestAccounts"]);
});

function fakeSigner() {
  const state = { walletCalls: 0, signCalls: 0, messages: [] };
  return {
    state,
    signer: {
      async walletAddress() { state.walletCalls++; return wallet; },
      async personalSign(message) {
        state.signCalls++;
        state.messages.push(message);
        return "0xdead";
      },
    },
  };
}

function policy(run = "0.10", perIntent = "0.02") {
  return new PaymentPolicy(resolveCaps({ maxUsdPerRun: run, maxUsdPerIntent: perIntent }));
}

function engineData(overrides = {}) {
  return {
    miner_id: "377",
    miner_name: "test-miner",
    cost_usd: 0.01,
    duration_ms: 10,
    signal_hash: `0x${"c".repeat(64)}`,
    intent: SANCTIONS_INTENT,
    input: { name: "Example Entity" },
    result_shape: "intent",
    result: { name: "Example Entity", matched: false, matches: [], lists: ["OFAC_SDN"], match_score: 0.1 },
    field_status: { name: "ok", matched: "ok", matches: "ok", lists: "ok", match_score: "ok" },
    ...overrides,
  };
}

async function validatedSanctions(name, result) {
  const data = engineData({
    input: { name },
    result: { ...engineData().result, ...result, name },
  });
  const receipt = await ask("https://engine.test/engine", {
    intent: SANCTIONS_INTENT, params: { name },
  }, async () => response(200, data));
  receipt.requestInput = { name };
  return receipt;
}

async function validatedSocial(account, result) {
  const data = {
    miner_id: "377",
    miner_name: "test-miner",
    cost_usd: 0.01,
    duration_ms: 10,
    signal_hash: `0x${"d".repeat(64)}`,
    intent: SOCIAL_INTENT,
    input: { account },
    result_shape: "intent",
    result: { account, verdict: "human", bot_score: 0.1, signals: ["sample"], ...result },
    field_status: { account: "ok", verdict: "ok", bot_score: "ok", signals: "ok" },
  };
  const receipt = await ask("https://engine.test/engine", {
    intent: SOCIAL_INTENT, params: { account },
  }, async () => response(200, data));
  receipt.requestInput = { account };
  return receipt;
}

test("USD caps use exact micro-USDC and reject unsafe or invalid values", () => {
  assert.equal(resolveCaps({ maxUsdPerRun: "0.1" }).maxUsdPerRunMicros, 100000n);
  for (const bad of [0, -1, NaN, Infinity, "NaN", "1e2", "0.0000001", ""]) {
    assert.throws(() => resolveCaps({ maxUsdPerRun: bad }), /USD|cap|greater|decimal/i);
  }
});

test("empty results are not complete evidence and cannot produce GO", async () => {
  const askImpl = async (_base, { intent }) => fakeReceipt(intent);
  const { memo } = await runDesk("TOKEN", { mode: "real", askImpl });
  assert.notEqual(memo.verdict, "GO");
  assert.notEqual(memo.evidenceCompleteness.status, "complete");
  assert.equal(memo.signals.some(([, text]) => /no sanctions match/i.test(text)), false);
});

test("unavailable sanctions evidence cannot be treated as clean", async () => {
  const askImpl = async (_base, { check, intent }) => {
    if (check === "SANCTIONS_SCREENING_MATCH") {
      throw new PaymentRequiredError({ reason: "escrow unavailable" });
    }
    return fakeReceipt(intent);
  };
  const { memo, failures } = await runDesk({
    token: "TOKEN", deployerName: "Example Entity", treasuryName: "Example Entity",
  }, { mode: "real", askImpl });
  assert.notEqual(memo.verdict, "GO");
  assert.ok(failures.some((failure) => failure.intent === SANCTIONS_INTENT));
  assert.equal(memo.evidence.SANCTIONS_SCREENING_MATCH.status, "unavailable");
  assert.equal(memo.signals.some(([, text]) => /no sanctions match/i.test(text)), false);
});

test("null, wrong-type and legacy clean sanctions answers are not affirmative evidence", async () => {
  for (const result of [null, [], {}, { clean: true, matches: [], lists_checked: ["OFAC"] }]) {
    const askImpl = async (_base, { intent }) =>
      fakeReceipt(intent, { result, requestInput: { name: "Example Entity" } });
    const { memo } = await runDesk({
      token: "TOKEN", deployerName: "Example Entity", treasuryName: "Example Entity",
    }, { mode: "real", askImpl });
    assert.notEqual(memo.verdict, "GO");
    assert.notEqual(memo.evidence.SANCTIONS_SCREENING_MATCH.status, "valid");
    assert.equal(memo.signals.some(([, text]) => /no sanctions match/i.test(text)), false);
  }
});

test("four fulfilled responses do not cover the absent mandatory sanctions check", async () => {
  const askImpl = async (_base, { check, intent }) => {
    if (check === "SANCTIONS_SCREENING_MATCH") throw new Error("not called");
    return fakeReceipt(intent);
  };
  const { memo } = await runDesk({ token: "TOKEN", socialAccounts: ["@example"] }, { mode: "real", askImpl });
  assert.notEqual(memo.verdict, "GO");
  assert.ok(memo.evidenceCompleteness.missingChecks.includes("SANCTIONS_SCREENING_MATCH"));
});

test("a confirmed sanctions match remains NO-GO when other checks are missing", async () => {
  const askImpl = async (_base, { check, intent }) => {
    if (check === "SANCTIONS_SCREENING_MATCH") {
      return validatedSanctions("Example Entity", {
        matched: true, matches: ["OFAC entry"], lists: ["OFAC_SDN"],
      });
    }
    throw new Error("unavailable");
  };
  const { memo } = await runDesk({
    token: "TOKEN", deployerName: "Example Entity", treasuryName: "Example Entity",
  }, { mode: "real", askImpl });
  assert.equal(memo.verdict, "NO-GO");
  assert.equal(memo.hardBlock, true);
  assert.ok(memo.evidenceCompleteness.missingChecks.length > 0);
});

test("affirmative matched field stays a hard block despite malformed ancillary coverage", async () => {
  const askImpl = async (_base, { check, intent }) => {
    if (check === "SANCTIONS_SCREENING_MATCH") {
      return validatedSanctions("Example Entity", {
        matched: true, matches: [], lists: [], match_score: 1,
      });
    }
    throw new Error("unavailable");
  };
  const { memo } = await runDesk({
    token: "TOKEN", deployerName: "Example Entity", treasuryName: "Example Entity",
  }, { mode: "real", askImpl });
  assert.equal(memo.evidence.SANCTIONS_SCREENING_MATCH.status, "invalid");
  assert.equal(memo.verdict, "NO-GO");
  assert.equal(memo.hardBlock, true);
});

test("all currently supported safe-shaped evidence still reviews unsupported mandatory checks", async () => {
  const dispatched = [];
  const askImpl = async (_base, { check, intent }) => {
    dispatched.push({ check, intent });
    if (check === "SANCTIONS_SCREENING_MATCH") {
      return validatedSanctions("Example Entity", {
        matched: false, matches: [], lists: ["OFAC_SDN"],
      });
    }
    if (check === "SOCIAL_BOT_DETECTION") {
      return validatedSocial("@example", {});
    }
    return fakeReceipt(intent);
  };
  const { memo } = await runDesk({
    token: "TOKEN", deployerName: "Example Entity", treasuryName: "Example Entity",
    socialAccounts: ["@example"],
  }, { mode: "real", askImpl });
  assert.equal(memo.evidence.SANCTIONS_SCREENING_MATCH.status, "valid");
  assert.equal(memo.evidence.SOCIAL_BOT_DETECTION.status, "valid");
  assert.deepEqual(dispatched, [
    { check: "SMART_CONTRACT_AUDIT", intent: ENGINE_INTENT_BY_CHECK.SMART_CONTRACT_AUDIT },
    { check: "ONCHAIN_METRIC_VERIFY", intent: ENGINE_INTENT_BY_CHECK.ONCHAIN_METRIC_VERIFY },
    { check: "SANCTIONS_SCREENING_MATCH", intent: SANCTIONS_INTENT },
    { check: "SOCIAL_BOT_DETECTION", intent: SOCIAL_INTENT },
    { check: "CODE_REVIEW", intent: ENGINE_INTENT_BY_CHECK.CODE_REVIEW },
  ]);
  assert.match(memo.evidence.SANCTIONS_SCREENING_MATCH.sourceReferences[0], /^engine-signal:/);
  const sanctionsReceipt = memo.receipts.find((receipt) => receipt.check === "SANCTIONS_SCREENING_MATCH");
  assert.equal(sanctionsReceipt.intent, SANCTIONS_INTENT);
  assert.equal(sanctionsReceipt.proofStatus, "incomplete");
  assert.equal(memo.verdict, "REVIEW");
  assert.ok(memo.evidenceCompleteness.unsupportedChecks.length >= 3);
});

test("token-only real candidate makes no Engine request and reports missing inputs", async () => {
  let fetchCalls = 0;
  const { memo } = await runDesk("TOKEN", {
    mode: "real",
    fetchImpl: async () => { fetchCalls++; throw new Error("unexpected network"); },
  });
  assert.equal(fetchCalls, 0);
  assert.equal(memo.verdict, "UNKNOWN");
  assert.equal(memo.evidence.SANCTIONS_SCREENING_MATCH.status, "missing");
  assert.equal(memo.evidence.SOCIAL_BOT_DETECTION.status, "missing");
});

test("malformed candidate identity disables affected requests and invalid blocks are rejected", async () => {
  let fetchCalls = 0;
  const { memo } = await runDesk({
    token: "TOKEN", deployerName: 7, treasuryName: "Example Entity",
  }, {
    mode: "real",
    fetchImpl: async () => { fetchCalls++; throw new Error("unexpected network"); },
  });
  assert.equal(fetchCalls, 0);
  assert.equal(memo.evidence.SANCTIONS_SCREENING_MATCH.status, "invalid");
  await assert.rejects(() => runDesk({ token: "TOKEN", block: 1.5 }, { mode: "real" }), /candidate block/);
});

test("mock receipts are simulated, actual spend is zero, and all renderers are honest", async () => {
  const { memo } = await runDesk("DEMO", {
    mode: "mock", now: () => 0, sleep: async () => {},
  });
  const markdown = renderMarkdown(memo);
  const html = renderHtml(memo);
  const fragment = renderHtmlFragment(memo);
  const plainFragment = fragment.replaceAll("<wbr>", "");
  const json = JSON.stringify({ memo });
  assert.equal(memo.actualSpentUsd, "$0");
  assert.equal(memo.actualSpendDescription, "actual spent");
  assert.equal(memo.estimatedCostUsd, "$0.05");
  assert.equal(memo.modeLabel, "SIMULATED/OFFLINE");
  assert.equal(memo.receipts.every((receipt) => receipt.minerId === null && receipt.signalHash === null), true);
  assert.match(markdown, /\| `SANCTIONS_SCREENING_MATCH` \| `SANCTIONS_SCREENING_MATCH_GENERAL` \| SIMULATED receipt/);
  assert.match(fragment, /class="memo-card evidence-card"/);
  assert.match(plainFragment, /SANCTIONS_SCREENING_MATCH_GENERAL/);
  assert.equal((fragment.match(/<details class="memo-receipt-details">/g) ?? []).length, memo.receipts.length);
  assert.doesNotMatch(fragment, /<details class="memo-receipt-details" open/);
  assert.match(fragment, /Receipt, response and payment details/);
  assert.match(fragment, /memo-pill[^>]*status--simulated/);
  assert.match(plainFragment, /SANCTIONS_SCREENING_MATCH_GENERAL/);
  assert.doesNotMatch(fragment, /<table\b|<!doctype|<html\b|<head\b|<body\b/i);
  assert.match(html, /<body class="memo-page">/);
  assert.equal((html.match(/<html\b/g) ?? []).length, 1);
  assert.equal((html.match(/<body\b/g) ?? []).length, 1);
  // The honesty guard applies to rendered text. The <style> block carries CSS
  // class hooks such as the "not paid" status pill -- styling selectors, not
  // claims -- so it is stripped before matching. All visible text stays guarded.
  const htmlText = html.replace(/<style>[\s\S]*?<\/style>/g, "");
  for (const output of [markdown, htmlText, json]) {
    assert.match(output, /SIMULATED/);
    assert.match(output, /not spent/);
    assert.doesNotMatch(output, /\b(paid|purchased|signed)\b/i);
  }
  assert.match(markdown, /UNKNOWN/);
  assert.match(markdown, /\*\*actual spent:\*\* \$0 USD/);
  assert.doesNotMatch(markdown, /receipt-backed amount/i);
  assert.match(markdown, /not a signature/);
  assert.equal(memo.receipts.every((receipt) => receipt.paymentStatus === "simulated"), true);
});

test("partial and unknown real outcomes keep actual spend distinct from estimates", async () => {
  const askImpl = async (_base, { check, intent }) => {
    if (check === "SOCIAL_BOT_DETECTION") {
      const error = new Error("connection lost after authorization");
      error.paymentStatus = "unknown";
      throw error;
    }
    return fakeReceipt(intent, { paymentStatus: "unknown" });
  };
  const { memo } = await runDesk({ token: "TOKEN", socialAccounts: ["@example"] }, { mode: "real", askImpl });
  assert.equal(memo.actualSpentUsd, "$0");
  assert.equal(memo.estimatedCostUsd, "$0");
  assert.equal(memo.paymentStatus.status, "unknown");
  assert.equal(memo.evidence.SOCIAL_BOT_DETECTION.status, "unavailable");
  const markdown = renderMarkdown(memo);
  const fragment = renderHtmlFragment(memo);
  const plainFragment = fragment.replaceAll("<wbr>", "");
  assert.doesNotMatch(markdown, /\b(purchased|signed)\b/i);
  assert.match(fragment, /Recommendation: UNKNOWN/);
  assert.match(fragment, /connection lost after authorization/);
  assert.match(fragment, /SOCIAL_BOT_DETECTION/);
  assert.match(plainFragment, /SANCTIONS_SCREENING_MATCH_GENERAL/);
  assert.match(fragment, /test-miner/);
  assert.match(fragment, /signal hash/i);
  assert.match(fragment, /Payment status/);
  assert.match(fragment, /Payment\/proof details/);
  assert.match(fragment, /receiptValid/);
  assert.match(fragment, /Content checksum/);
  assert.match(fragment, /not a digital signature/i);
  assert.match(fragment, /Cost \(USD\)<\/dt><dd>0\.01/);
  assert.doesNotMatch(fragment, /\b(purchased|signed)\b/i);
});

test("memo HTML escapes candidate, evidence, response, and failure strings", async () => {
  const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const { memo } = await runDesk({ token: hostile, socialAccounts: ["@example"] }, {
    mode: "real",
    askImpl: async () => { throw new Error(hostile); },
  });
  const fragment = renderHtmlFragment(memo);
  assert.match(fragment, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(fragment, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.doesNotMatch(fragment, /<img\b|<script\b/);
});

test("partial mock runs report observed response and failure counts", async () => {
  const askImpl = async (_base, { check, intent }) => {
    if (check === "CODE_REVIEW") throw new Error("offline fixture failed");
    return fakeReceipt(intent);
  };
  const { memo } = await runDesk("TOKEN", { mode: "mock", askImpl });
  assert.deepEqual(memo.runCounts, { responses: 4, validEvidence: 0, failed: 1, unknown: 0 });
  assert.equal(memo.evidence.CODE_REVIEW.status, "unavailable");
  assert.equal(memo.paymentStatus.simulatedReceiptCount, 4);
  assert.equal(memo.paymentStatus.failedCount, 1);
  assert.match(renderMarkdown(memo), /4 responses · 0 valid evidence · 1 failed · 0 unknown/);
});

test("content checksum is stable under key order and changes with decision content", () => {
  const base = {
    candidate: { token: "T", subject: "A" },
    policyVersion: "policy-v1",
    inputs: { risk: 0.1 },
    evidence: { result: { risk_score: 0.1 } },
    verdict: "GO",
    signals: [["good", "safe"]],
    receipts: [{ intent: "X", proofStatus: "receipt_valid" }],
    failures: [],
    generatedAt: "first",
  };
  const digest = contentDigest(base);
  assert.equal(digest, "sha256-v1:bc1b0f19b1939debb162f3cf3e530af72b04e8c54d4e9f3b248061b0bb09ec5f");
  assert.equal(contentDigest({ ...base, generatedAt: "second" }), digest);
  assert.equal(contentDigest({
    failures: [], receipts: [{ proofStatus: "receipt_valid", intent: "X" }],
    signals: [["good", "safe"]], verdict: "GO", inputs: { risk: 0.1 },
    evidence: { result: { risk_score: 0.1 } },
    policyVersion: "policy-v1", candidate: { subject: "A", token: "T" },
    generatedAt: "third",
  }), digest);
  for (const mutation of [
    { ...base, inputs: { risk: 0.9 } },
    { ...base, evidence: { result: { risk_score: 0.9 } } },
    { ...base, candidate: { token: "T", subject: "B" } },
    { ...base, policyVersion: "policy-v2" },
    { ...base, verdict: "NO-GO" },
    { ...base, signals: [["bad", "unsafe"]] },
  ]) assert.notEqual(contentDigest(mutation), digest);
  assert.match(digest, /^sha256-v1:[0-9a-f]{64}$/);
});

test("over-intent and over-run reservations reject before signing", async () => {
  for (const p of [policy("0.10", "0.005"), policy("0.005", "0.10")]) {
    const { signer, state } = fakeSigner();
    let paidRetryCalls = 0;
    const fetchImpl = async (_url, init) => {
      if (init.headers?.["X-PAYMENT"]) paidRetryCalls++;
      return response(402, escrowChallenge({ amount: "10000" }));
    };
    await assert.rejects(() => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {}, {
      policy: p, intent: SANCTIONS_INTENT, expected,
    }), PaymentPolicyError);
    assert.equal(state.signCalls, 0);
    assert.equal(paidRetryCalls, 0);
  }
});

test("malformed or missing amount rejects before signing and paid retry", async () => {
  for (const amount of ["", "not-a-number", "-1", "1.5"]) {
    const { signer, state } = fakeSigner();
    let paidRetryCalls = 0;
    const challenge = escrowChallenge({ templateOverrides: { amount } });
    const fetchImpl = async (_url, init) => {
      if (init.headers?.["X-PAYMENT"]) paidRetryCalls++;
      return response(402, challenge);
    };
    await assert.rejects(() => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {}, {
      policy: policy(), intent: SANCTIONS_INTENT, expected,
    }), PaymentPolicyError);
    assert.equal(state.signCalls, 0);
    assert.equal(paidRetryCalls, 0);
  }
});

test("wrong network, payee, resource and template-envelope mismatch reject before signing", async () => {
  const challenges = [
    { accepts: [{ scheme: "exact" }] },
    escrowChallenge({ network: "eip155:8453" }),
    escrowChallenge({ payee: "0x3333333333333333333333333333333333333333" }),
    escrowChallenge({ resource: "/v1/other" }),
    escrowChallenge({ templateOverrides: { network: "eip155:8453" } }),
    escrowChallenge({ templateOverrides: { payTo: "0x3333333333333333333333333333333333333333" } }),
    escrowChallenge({ templateOverrides: { wallet: "{nonce}", nonce: "{from}" } }),
    escrowChallenge({ templateOverrides: { validAfter: "{validBefore}", validBefore: "{validAfter}" } }),
  ];
  for (const challenge of challenges) {
    const { signer, state } = fakeSigner();
    let paidRetryCalls = 0;
    const fetchImpl = async (_url, init) => {
      if (init.headers?.["X-PAYMENT"]) paidRetryCalls++;
      return response(402, challenge);
    };
    await assert.rejects(() => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {}, {
      policy: policy(), intent: SANCTIONS_INTENT, expected,
    }), PaymentPolicyError);
    assert.equal(state.walletCalls, 0);
    assert.equal(state.signCalls, 0);
    assert.equal(paidRetryCalls, 0);
  }
  const { signer, state } = fakeSigner();
  let paidRetryCalls = 0;
  await assert.rejects(() => fetchWithEscrow(
    async (_url, init) => {
      if (init.headers?.["X-PAYMENT"]) paidRetryCalls++;
      return response(402, escrowChallenge());
    },
    signer,
    "https://other.test/engine/v1/ask",
    {},
    { policy: policy(), intent: SANCTIONS_INTENT, expected },
  ), PaymentPolicyError);
  assert.equal(state.walletCalls, 0);
  assert.equal(state.signCalls, 0);
  assert.equal(paidRetryCalls, 0);
});

test("invalid cap blocks authorization without signer or paid retry calls", async () => {
  const { signer, state } = fakeSigner();
  let fetchCalls = 0;
  let paidRetryCalls = 0;
  assert.throws(() => policy("Infinity", "0.02"), /cap|USD|decimal/i);
  const fetchImpl = async (_url, init) => {
    fetchCalls++;
    if (init.headers?.["X-PAYMENT"]) paidRetryCalls++;
    return response(402, escrowChallenge());
  };
  await assert.rejects(() => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {}, {
    policy: { reserve() { throw new PaymentPolicyError("invalid configured cap"); } },
    intent: SANCTIONS_INTENT,
    expected,
  }), /invalid configured cap/);
  assert.equal(state.signCalls, 0);
  assert.equal(paidRetryCalls, 0);
  await assert.rejects(() => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {}, {
    policy: new PaymentPolicy(resolveCaps()), intent: SANCTIONS_INTENT, expected: undefined,
  }), PaymentPolicyError);
  assert.equal(fetchCalls, 2);
  assert.equal(state.signCalls, 0);
  assert.equal(paidRetryCalls, 0);
});

test("valid exact-boundary challenge signs once with the exact envelope value", async () => {
  const { signer, state } = fakeSigner();
  const p = policy("0.01", "0.01");
  let paidRetryCalls = 0;
  const fetchImpl = async (_url, init) => {
    if (init.headers?.["X-PAYMENT"]) {
      paidRetryCalls++;
      const header = JSON.parse(Buffer.from(init.headers["X-PAYMENT"], "base64").toString("utf8"));
      assert.equal(header.payload.authorization.value, "10000");
      return settlementResponse(200);
    }
    return response(402, escrowChallenge());
  };
  const result = await fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {}, {
    policy: p, intent: SANCTIONS_INTENT, expected,
    now: () => 1_800_000_000_000, nonceFactory: () => "offline-nonce",
  });
  assert.equal(state.signCalls, 1);
  assert.equal(state.walletCalls, 1);
  assert.equal(paidRetryCalls, 1);
  assert.equal(result.paymentStatus, "receipt_valid");
  assert.equal(result.receipt.tx_hash, undefined);
  assert.equal(p.snapshot().reservedOrAuthorizedMicro, "10000");
  assert.equal(p.snapshot().reservations[0].status, "settled");
});

test("concurrent challenges reserve atomically and never exceed the run cap", async () => {
  const p = policy("0.02", "0.02");
  const { signer, state } = fakeSigner();
  let firstResponses = 0;
  let openBarrier;
  const barrier = new Promise((resolve) => { openBarrier = resolve; });
  let paidRetryCalls = 0;
  const fetchImpl = async (_url, init) => {
    if (!init.headers?.["X-PAYMENT"]) {
      firstResponses++;
      if (firstResponses === 5) openBarrier();
      await barrier;
      return response(402, escrowChallenge());
    }
    paidRetryCalls++;
    return settlementResponse(200);
  };
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, index) =>
    fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {
      method: "POST",
      body: JSON.stringify({ request: index }),
    }, {
      policy: p, intent: SANCTIONS_INTENT, expected,
    })
  ));
  const ledger = p.snapshot();
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(state.signCalls, 2);
  assert.equal(paidRetryCalls, 2);
  assert.equal(ledger.reservedOrAuthorizedMicro, "20000");
  assert.ok(BigInt(ledger.reservedOrAuthorizedMicro) <= BigInt(ledger.maxRunMicro));
});

test("settled attempts share the same intent and run budget across later attempts", async () => {
  const p = policy("0.01", "0.01");
  const { signer, state } = fakeSigner();
  let paidRetryCalls = 0;
  const fetchImpl = async (_url, init) => {
    if (init.headers?.["X-PAYMENT"]) {
      paidRetryCalls++;
      return settlementResponse(200);
    }
    return response(402, escrowChallenge());
  };
  const options = { policy: p, intent: SANCTIONS_INTENT, expected };
  const first = await fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {
    method: "POST", body: "request-1",
  }, options);
  assert.equal(first.paymentStatus, "receipt_valid");
  await assert.rejects(() => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {
    method: "POST", body: "request-2",
  }, options), /cap exceeded/i);
  assert.equal(state.signCalls, 1);
  assert.equal(paidRetryCalls, 1);
  assert.equal(p.snapshot().reservedOrAuthorizedMicro, "10000");
});

test("definitive unpaid response releases reservation without retrying", async () => {
  const p = policy("0.01", "0.01");
  const { signer, state } = fakeSigner();
  let paidRetryCalls = 0;
  const fetchImpl = async (_url, init) => {
    if (init.headers?.["X-PAYMENT"]) {
      paidRetryCalls++;
      return settlementResponse(402, null);
    }
    return response(402, escrowChallenge());
  };
  const result = await fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {}, {
    policy: p, intent: SANCTIONS_INTENT, expected,
  });
  assert.equal(result.paymentStatus, "definitive_unpaid");
  assert.equal(state.signCalls, 1);
  assert.equal(paidRetryCalls, 1);
  assert.equal(p.snapshot().reservedOrAuthorizedMicro, "0");
  assert.equal(p.snapshot().reservations[0].status, "failed");
});

test("failed then unknown retry blocks a third authorization for the same request", async () => {
  const p = policy("0.03", "0.03");
  const { signer, state } = fakeSigner();
  const init = { method: "POST", body: JSON.stringify({ intent: SANCTIONS_INTENT, params: { name: "Example Entity" } }) };
  const options = { policy: p, intent: SANCTIONS_INTENT, expected };
  let paidRetryCalls = 0;
  const fetchImpl = async (_url, request) => {
    if (request.headers?.["X-PAYMENT"]) {
      paidRetryCalls++;
      if (paidRetryCalls === 1) return settlementResponse(402, null);
      if (paidRetryCalls === 2) throw new Error("connection lost after authorization");
      assert.fail("duplicate request reached another paid retry");
    }
    return response(402, escrowChallenge());
  };

  assert.equal((await fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", init, options)).paymentStatus, "definitive_unpaid");
  await assert.rejects(
    () => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", init, options),
    (error) => error.paymentStatus === "unknown"
  );
  await assert.rejects(
    () => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", init, options),
    /duplicate payment request ID is unknown/i
  );

  assert.equal(state.signCalls, 2);
  assert.equal(paidRetryCalls, 2);
  assert.deepEqual(p.snapshot().reservations.map(({ status }) => status), ["failed", "unknown"]);
  assert.equal(p.snapshot().reservedOrAuthorizedMicro, "10000");
});

test("failed then settled retry blocks a third authorization for the same request", async () => {
  const p = policy("0.03", "0.03");
  const { signer, state } = fakeSigner();
  const init = { method: "POST", body: JSON.stringify({ intent: SANCTIONS_INTENT, params: { name: "Example Entity" } }) };
  const options = { policy: p, intent: SANCTIONS_INTENT, expected };
  let paidRetryCalls = 0;
  const fetchImpl = async (_url, request) => {
    if (request.headers?.["X-PAYMENT"]) {
      paidRetryCalls++;
      return paidRetryCalls === 1 ? settlementResponse(402, null) : settlementResponse(200);
    }
    return response(402, escrowChallenge());
  };

  assert.equal((await fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", init, options)).paymentStatus, "definitive_unpaid");
  assert.equal((await fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", init, options)).paymentStatus, "receipt_valid");
  await assert.rejects(
    () => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", init, options),
    /duplicate payment request ID is settled/i
  );

  assert.equal(state.signCalls, 2);
  assert.equal(paidRetryCalls, 2);
  assert.deepEqual(p.snapshot().reservations.map(({ status }) => status), ["failed", "settled"]);
  assert.equal(p.snapshot().reservedOrAuthorizedMicro, "10000");
});

test("concurrent retries after definitive unpaid authorize the same request only once", async () => {
  const p = policy("0.03", "0.03");
  const { signer, state } = fakeSigner();
  const init = { method: "POST", body: JSON.stringify({ intent: SANCTIONS_INTENT, params: { name: "Example Entity" } }) };
  const options = { policy: p, intent: SANCTIONS_INTENT, expected };
  let initialRequests = 0;
  let paidRetryCalls = 0;
  let openBarrier;
  const barrier = new Promise((resolve) => { openBarrier = resolve; });
  const fetchImpl = async (_url, request) => {
    if (request.headers?.["X-PAYMENT"]) {
      paidRetryCalls++;
      return paidRetryCalls === 1 ? settlementResponse(402, null) : settlementResponse(200);
    }
    initialRequests++;
    if (initialRequests === 1) return response(402, escrowChallenge());
    if (initialRequests === 3) openBarrier();
    await barrier;
    return response(402, escrowChallenge());
  };

  assert.equal((await fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", init, options)).paymentStatus, "definitive_unpaid");
  const retries = await Promise.allSettled([
    fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", init, options),
    fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", init, options),
  ]);
  assert.equal(retries.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(retries.filter((result) => result.status === "rejected").length, 1);
  assert.match(retries.find((result) => result.status === "rejected").reason.message, /duplicate payment request ID/i);
  assert.equal(state.signCalls, 2);
  assert.equal(paidRetryCalls, 2);
  assert.deepEqual(p.snapshot().reservations.map(({ status }) => status), ["failed", "settled"]);
  assert.equal(p.snapshot().reservedOrAuthorizedMicro, "10000");
});

test("unknown post-sign outcome retains reservation and blocks duplicate authorization", async () => {
  const p = policy("0.02", "0.02");
  const firstBody = JSON.stringify({ intent: SANCTIONS_INTENT, params: { name: "Example Entity" } });
  const reorderedBody = JSON.stringify({ params: { name: "Example Entity" }, intent: SANCTIONS_INTENT });
  const { signer, state } = fakeSigner();
  let paidRetryCalls = 0;
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls++;
    if (init.headers?.["X-PAYMENT"]) {
      paidRetryCalls++;
      throw new Error("connection lost after authorization");
    }
    return response(402, escrowChallenge());
  };
  await assert.rejects(() => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {
    method: "POST", body: firstBody,
  }, {
    policy: p, intent: SANCTIONS_INTENT, expected,
  }));
  await assert.rejects(() => fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {
    method: "POST", body: reorderedBody,
  }, {
    policy: p, intent: SANCTIONS_INTENT, expected,
  }), /duplicate payment request ID is unknown/i);
  assert.equal(state.signCalls, 1);
  assert.equal(paidRetryCalls, 1);
  assert.equal(calls, 3);
  assert.equal(p.snapshot().reservedOrAuthorizedMicro, "10000");
  assert.equal(p.snapshot().reservations[0].status, "unknown");
  assert.match(p.snapshot().reservations[0].requestId, /^sha256:[0-9a-f]{64}$/);
});

test("malformed settlement header after signing retains unknown reservation", async () => {
  const p = policy("0.01", "0.01");
  const { signer } = fakeSigner();
  const fetchImpl = async (_url, init) => init.headers?.["X-PAYMENT"]
    ? response(200, { ok: true }, { "x-payment-response": "not-json-base64" })
    : response(402, escrowChallenge());
  const result = await fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {}, {
    policy: p, intent: SANCTIONS_INTENT, expected,
  });
  assert.equal(result.paymentStatus, "unknown");
  assert.equal(p.snapshot().reservations[0].status, "unknown");
  assert.equal(p.snapshot().reservedOrAuthorizedMicro, "10000");
});

test("malformed payment header on 402 reports unknown in both result and ledger", async () => {
  const p = policy("0.02", "0.02");
  const { signer, state } = fakeSigner();
  const fetchImpl = async (_url, init) => init.headers?.["X-PAYMENT"]
    ? response(402, { error: "unresolved" }, { "x-payment-response": "not-json-base64" })
    : response(402, escrowChallenge());
  const result = await fetchWithEscrow(fetchImpl, signer, "https://engine.test/engine/v1/ask", {}, {
    policy: p, intent: SANCTIONS_INTENT, expected,
  });
  assert.equal(result.paymentStatus, "unknown");
  assert.equal(result.res.paymentStatus, "unknown");
  assert.equal(p.snapshot().reservations[0].status, "unknown");
  assert.equal(p.snapshot().reservedOrAuthorizedMicro, "10000");
  assert.equal(state.signCalls, 1);
});

test("escrow epoch receipt validates without a per-request tx_hash", () => {
  assert.equal(validateEscrowReceipt(escrowReceipt(), {
    intent: SANCTIONS_INTENT, amount: 10000n, payer: wallet,
  }), true);
  assert.equal(validateEscrowReceipt({ ...escrowReceipt(), amount_uusdc: "9999" }, {
    intent: SANCTIONS_INTENT, amount: 10000n, payer: wallet,
  }), false);
  assert.equal(validateEscrowReceipt({ ...escrowReceipt(), miner: "" }, {
    intent: SANCTIONS_INTENT, amount: 10000n, payer: wallet,
  }), false);
});

test("shaped sanctions result validates identity, field status, and consistent clean fields", async () => {
  const valid = await ask("https://engine.test/engine", { intent: SANCTIONS_INTENT, params: { name: "Example Entity" } },
    async () => response(200, engineData()));
  assert.equal(valid.evidenceStatus, "valid");
  assert.equal(valid.proofStatus, "incomplete");
  assert.ok(valid.proofGaps.includes("escrow receipt missing"));

  const wrongSubject = await ask("https://engine.test/engine", { intent: SANCTIONS_INTENT, params: { name: "Example Entity" } },
    async () => response(200, engineData({ result: { ...engineData().result, name: "Wrong Entity" } })));
  assert.equal(wrongSubject.evidenceStatus, "invalid");

  const contradictory = await ask("https://engine.test/engine", { intent: SANCTIONS_INTENT, params: { name: "Example Entity" } },
    async () => response(200, engineData({ result: { ...engineData().result, matched: true } })));
  assert.equal(contradictory.evidenceStatus, "invalid");

  const rejectedField = await ask("https://engine.test/engine", { intent: SANCTIONS_INTENT, params: { name: "Example Entity" } },
    async () => response(200, engineData({ field_status: { ...engineData().field_status, matches: "rejected" } })));
  assert.equal(rejectedField.evidenceStatus, "invalid");

  const missingField = await ask("https://engine.test/engine", { intent: SANCTIONS_INTENT, params: { name: "Example Entity" } },
    async () => response(200, engineData({ field_status: { ...engineData().field_status, lists: "missing" } })));
  assert.equal(missingField.evidenceStatus, "missing");

  const unavailableField = await ask("https://engine.test/engine", { intent: SANCTIONS_INTENT, params: { name: "Example Entity" } },
    async () => response(200, engineData({ field_status: { ...engineData().field_status, lists: "unavailable" } })));
  assert.equal(unavailableField.evidenceStatus, "unavailable");

  const malformedMatches = await ask("https://engine.test/engine", { intent: SANCTIONS_INTENT, params: { name: "Example Entity" } },
    async () => response(200, engineData({ result: { ...engineData().result, matches: [null] } })));
  assert.equal(malformedMatches.evidenceStatus, "invalid");

  const invalidBound = await ask("https://engine.test/engine", { intent: SANCTIONS_INTENT, params: { name: "Example Entity" } },
    async () => response(200, engineData({ result: { ...engineData().result, match_score: 1.1 } })));
  assert.equal(invalidBound.evidenceStatus, "invalid");
});

test("missing cost stays missing; negative, nonfinite, string, and unrepresentable costs are invalid", async () => {
  for (const cost of [-0.01, Infinity, -Infinity, NaN, "0.01", 0.0000001]) {
    const data = engineData();
    data.cost_usd = cost;
    const answer = response(200, data);
    if (typeof cost === "number" && !Number.isFinite(cost)) answer.json = async () => data;
    const result = await ask("https://engine.test/engine", {
      intent: SANCTIONS_INTENT, params: { name: "Example Entity" },
    }, async () => answer);
    assert.equal(result.evidenceStatus, "invalid");
    assert.equal(result.costUsd, null);
  }
  const data = engineData();
  delete data.cost_usd;
  const missing = await ask("https://engine.test/engine", {
    intent: SANCTIONS_INTENT, params: { name: "Example Entity" },
  }, async () => response(200, data));
  assert.equal(missing.evidenceStatus, "missing");
  assert.equal(missing.costUsd, null);
});

test("raw fallback and envelope-as-result are never accepted as decision evidence", async () => {
  const raw = await ask("https://engine.test/engine", {
    intent: SANCTIONS_INTENT, params: { name: "Example Entity" },
  }, async () => response(200, engineData({ result_shape: "raw", result: { arbitrary: "object" } })));
  assert.equal(raw.evidenceStatus, "unsupported");

  const missingResult = await ask("https://engine.test/engine", {
    intent: SANCTIONS_INTENT, params: { name: "Example Entity" },
  }, async () => {
    const data = engineData();
    delete data.result;
    return response(200, data);
  });
  assert.equal(missingResult.evidenceStatus, "missing");
  assert.equal(missingResult.result, null);
});

test("response intent and candidate input mismatches are invalid", async () => {
  for (const change of [
    { intent: "OTHER_INTENT" },
    { intent: "SANCTIONS_SCREENING_MATCH" },
    { input: { name: "Other Entity" } },
  ]) {
    const result = await ask("https://engine.test/engine", {
      intent: SANCTIONS_INTENT, params: { name: "Example Entity" },
    }, async () => response(200, engineData(change)));
    assert.equal(result.evidenceStatus, "invalid");
  }
});

test("Engine requests and response/escrow receipts use the concrete leaf intent", async () => {
  let requestBody;
  const receipt = await ask("https://engine.test/engine", {
    intent: SANCTIONS_INTENT, params: { name: "Example Entity" },
  }, async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return response(200, engineData());
  });
  assert.deepEqual(requestBody, {
    intent: SANCTIONS_INTENT,
    params: { name: "Example Entity" },
  });
  assert.equal(receipt.matchedIntent, SANCTIONS_INTENT);
  assert.equal(validateEscrowReceipt(escrowReceipt(), {
    intent: SANCTIONS_INTENT, amount: 10000n, payer: wallet,
  }), true);
  assert.equal(validateEscrowReceipt(escrowReceipt({ intent: "SANCTIONS_SCREENING_MATCH" }), {
    intent: SANCTIONS_INTENT, amount: 10000n, payer: wallet,
  }), false);
});

test("social response rejects wrong subject and invalid numeric bounds; missing miner/hash are proof gaps", async () => {
  const base = {
    miner_id: "377",
    miner_name: "test-miner",
    cost_usd: 0.01,
    duration_ms: 10,
    signal_hash: `0x${"d".repeat(64)}`,
    intent: SOCIAL_INTENT,
    input: { account: "@example" },
    result_shape: "intent",
    result: { account: "@example", verdict: "human", bot_score: 0.1, signals: ["sample"] },
    field_status: { account: "ok", verdict: "ok", bot_score: "ok", signals: "ok" },
  };
  for (const resultValue of [
    { ...base.result, account: "@wrong" },
    { ...base.result, bot_score: 1.1 },
    { ...base.result, bot_score: -0.01 },
  ]) {
    const result = await ask("https://engine.test/engine", {
      intent: SOCIAL_INTENT, params: { account: "@example" },
    }, async () => response(200, { ...base, result: resultValue }));
    assert.equal(result.evidenceStatus, "invalid");
  }
  const unknownProof = await ask("https://engine.test/engine", {
    intent: SOCIAL_INTENT, params: { account: "@example" },
  }, async () => response(200, { ...base, miner_id: null, miner_name: null, signal_hash: null }));
  assert.equal(unknownProof.evidenceStatus, "valid");
  assert.ok(unknownProof.proofGaps.includes("miner identity missing or malformed"));
  assert.ok(unknownProof.proofGaps.includes("Engine signal hash missing or malformed"));
});

test("good decision shape and bad payment proof remain separate", async () => {
  const result = await ask("https://engine.test/engine", {
    intent: SANCTIONS_INTENT, params: { name: "Example Entity" },
  }, async () => {
    const res = response(200, engineData());
    res.settlementReceipt = escrowReceipt({ receipt_hash: "bad" });
    res.receiptValid = false;
    res.paymentStatus = "unknown";
    res.authorizedAmountMicro = "10000";
    return res;
  });
  assert.equal(result.evidenceStatus, "valid");
  assert.equal(result.proofStatus, "incomplete");
  assert.equal(result.paymentStatus, "unknown");
});

test("paid but unusable shaped/raw response keeps receipt validity separate", async () => {
  const validReceipt = escrowReceipt();
  const result = await ask("https://engine.test/engine", {
    intent: SANCTIONS_INTENT, params: { name: "Example Entity" },
  }, async () => {
    const res = response(200, engineData({ result_shape: "raw", result: { arbitrary: true } }));
    res.settlementReceipt = validReceipt;
    res.receiptValid = true;
    res.paymentStatus = "receipt_valid";
    res.authorizedAmountMicro = "10000";
    return res;
  });
  assert.equal(result.proofStatus, "receipt_valid");
  assert.equal(result.evidenceStatus, "unsupported");
  assert.equal(result.paymentStatus, "receipt_valid");
});

test("absent or malformed response body is not converted into free intelligence", async () => {
  await assert.rejects(() => ask("https://engine.test/engine", {
    intent: SANCTIONS_INTENT, params: { name: "Example Entity" },
  }, async () => new Response(null, { status: 200 })), /absent or invalid JSON/);
});

test("valid payment receipt survives an absent answer body as spend with unavailable evidence", async () => {
  const { signer, state } = fakeSigner();
  const p = policy("0.02", "0.02");
  let paidRetryCalls = 0;
  const fetchImpl = async (_url, init) => {
    if (init.headers?.["X-PAYMENT"]) {
      paidRetryCalls++;
      const header = Buffer.from(JSON.stringify(escrowReceipt())).toString("base64");
      return new Response(null, { status: 200, headers: { "x-payment-response": header } });
    }
    return response(402, escrowChallenge());
  };
  const wrappedFetch = async (url, init) =>
    (await fetchWithEscrow(fetchImpl, signer, url, init, {
      policy: p, intent: SANCTIONS_INTENT, expected,
    })).res;
  await assert.rejects(() => ask("https://engine.test/engine", {
    intent: SANCTIONS_INTENT, params: { name: "Example Entity" },
  }, wrappedFetch), /absent or invalid JSON/);
  assert.equal(state.signCalls, 1);
  assert.equal(paidRetryCalls, 1);
  assert.equal(p.snapshot().reservations[0].status, "settled");
  assert.equal(p.snapshot().reservedOrAuthorizedMicro, "10000");
});
