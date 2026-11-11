import { createHash } from "node:crypto";
import {
  INTENT_ASKS, ENGINE_INTENT_BY_CHECK, MANDATORY_CHECKS, POLICY_VERSION, resolveCaps, formatUsd, usdToMicro, ENGINE_BASE,
} from "./config.mjs";
import { ask, makeMockAsk, PaymentRequiredError } from "./engine.mjs";
import { PaymentPolicy } from "./x402.mjs";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const UNSUPPORTED = {
  SMART_CONTRACT_AUDIT: "published leaf has no request schema or response format; audit evidence is unsupported",
  ONCHAIN_METRIC_VERIFY: "published schema returns address balance only; it does not establish holder concentration, liquidity or age",
  CODE_REVIEW: "published schema reviews supplied code; it does not establish repository history or contributor authenticity",
};

function normalizeCandidate(value) {
  const candidate = typeof value === "string" ? { token: value } : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("candidate must be a token string or an object with a token");
  }
  const token = typeof candidate.token === "string" ? candidate.token.trim() : "";
  if (!token || token.length > 120) throw new TypeError("candidate token is required and must be at most 120 characters");
  const sanctionsKeys = ["deployerName", "treasuryName"];
  const invalidSanctionsInput = sanctionsKeys.some((key) =>
    Object.hasOwn(candidate, key) && (typeof candidate[key] !== "string" || !candidate[key].trim())
  );
  const names = sanctionsKeys.map((key) =>
    typeof candidate[key] === "string" ? candidate[key].trim() : ""
  ).filter(Boolean);
  const sanctionsInputStatus = invalidSanctionsInput ? "invalid" : names.length === 2 ? "valid" : "missing";
  const socialInputProvided = Object.hasOwn(candidate, "socialAccounts");
  const invalidSocialInput = socialInputProvided &&
    (!Array.isArray(candidate.socialAccounts) ||
      candidate.socialAccounts.some((account) => typeof account !== "string" || !account.trim()));
  const socialAccounts = Array.isArray(candidate.socialAccounts) && !invalidSocialInput
    ? [...new Set(candidate.socialAccounts.map((account) => account.trim()))]
    : [];
  const socialInputStatus = invalidSocialInput ? "invalid" : socialAccounts.length ? "valid" : "missing";
  if (candidate.chain != null && (typeof candidate.chain !== "string" || !candidate.chain.trim())) {
    throw new TypeError("candidate chain, when supplied, must be a non-empty explicit string");
  }
  if (candidate.block != null &&
      (!Number.isSafeInteger(candidate.block) || candidate.block < 0 || candidate.block > 1_000_000_000_000)) {
    throw new TypeError("candidate block must be an integer from 0 to 1000000000000");
  }
  if (candidate.repositoryUrl != null &&
      (typeof candidate.repositoryUrl !== "string" || !candidate.repositoryUrl.trim())) {
    throw new TypeError("candidate repositoryUrl, when supplied, must be a non-empty explicit string");
  }
  return {
    token,
    deployerName: typeof candidate.deployerName === "string" ? candidate.deployerName.trim() : null,
    treasuryName: typeof candidate.treasuryName === "string" ? candidate.treasuryName.trim() : null,
    sanctionsSubjects: [...new Set(names)],
    socialAccounts,
    sanctionsInputStatus,
    socialInputStatus,
    chain: candidate.chain ?? null,
    block: candidate.block ?? null,
    repositoryUrl: candidate.repositoryUrl ?? null,
  };
}

function buildRealJobs(candidate) {
  const jobs = [];
  for (const name of candidate.sanctionsInputStatus === "valid" ? candidate.sanctionsSubjects : []) {
    jobs.push({
      check: "SANCTIONS_SCREENING_MATCH",
      intent: ENGINE_INTENT_BY_CHECK.SANCTIONS_SCREENING_MATCH,
      params: { name },
      requestInput: { name },
      query: null,
    });
  }
  for (const account of candidate.socialInputStatus === "valid" ? candidate.socialAccounts : []) {
    jobs.push({
      check: "SOCIAL_BOT_DETECTION",
      intent: ENGINE_INTENT_BY_CHECK.SOCIAL_BOT_DETECTION,
      params: { account },
      requestInput: { account },
      query: null,
    });
  }
  return jobs;
}

/** Run one listing candidate. Real requests are only made for supported checks with explicit inputs. */
export async function runDesk(candidateInput, opts = {}) {
  const candidate = normalizeCandidate(candidateInput);
  const caps = resolveCaps(opts);
  const mode = opts.mode ?? caps.mode;
  if (mode !== "mock" && mode !== "real") throw new TypeError(`unsupported desk mode: ${mode}`);
  const now = opts.now ?? Date.now;
  const started = now();
  const engineBase = opts.engineBase ?? ENGINE_BASE;
  const paymentPolicy = new PaymentPolicy(caps);
  const jobs = opts.askImpl
    ? INTENT_ASKS.map((definition) => ({
        check: definition.check,
        intent: definition.intent,
        query: definition.query.replaceAll("{token}", candidate.token),
        params: null,
        requestInput: null,
      }))
    : mode === "mock"
      ? INTENT_ASKS.map((definition) => ({
          check: definition.check,
          intent: definition.intent,
          query: definition.query.replaceAll("{token}", candidate.token),
          params: null,
          requestInput: null,
        }))
      : buildRealJobs(candidate);
  const askFn = opts.askImpl ?? (mode === "mock"
    ? makeMockAsk({ seed: candidate.token, sleep: opts.sleep, now })
    : jobs.length ? realAskFactory(paymentPolicy, opts) : null);

  const settled = await Promise.allSettled(jobs.map((job) => askFn(engineBase, {
    check: job.check,
    intent: job.intent,
    query: job.query,
    params: job.params,
    requestInput: job.requestInput,
    maxUsd: caps.maxUsdPerIntent,
    context: mode === "mock" ? { token: candidate.token } : undefined,
    now,
  })));
  const receipts = [];
  const failures = [];
  settled.forEach((result, index) => {
    const job = jobs[index];
    if (result.status === "fulfilled") {
      receipts.push({
        ...result.value,
        check: job.check,
        mode: mode === "mock" ? "mock" : result.value.mode,
        minerId: mode === "mock" ? null : result.value.minerId,
        minerName: mode === "mock" ? "SIMULATED" : result.value.minerName,
        costUsd: mode === "mock" ? 0 : result.value.costUsd,
        estimatedCostUsd: mode === "mock"
          ? result.value.estimatedCostUsd ?? result.value.costUsd ?? 0
          : result.value.estimatedCostUsd,
        signalHash: mode === "mock" ? null : result.value.signalHash,
        evidenceStatus: mode === "mock" ? "simulated" : result.value.evidenceStatus,
        proofStatus: mode === "mock" ? "simulated" : result.value.proofStatus,
        paymentStatus: mode === "mock" ? "simulated" : result.value.paymentStatus,
        intent: result.value.intent ?? job.intent,
        requestInput: result.value.requestInput ?? job.requestInput,
      });
    } else {
      failures.push({
        check: job.check,
        intent: job.intent,
        requestInput: job.requestInput,
        error: String(result.reason?.message ?? result.reason),
        isPaymentRequired: result.reason instanceof PaymentRequiredError || result.reason?.isPaymentRequired === true,
        paymentStatus: mode === "mock" ? "simulated" :
          result.reason?.paymentStatus ?? (result.reason?.paymentPolicyRejected ? "policy_rejected" : "unknown"),
        proofStatus: mode === "mock" ? "simulated" : result.reason?.receiptValid ? "receipt_valid" : "incomplete",
        settlement: mode === "mock" ? null : result.reason?.settlementReceipt ?? null,
        authorizedAmountMicro: mode === "mock" ? null : result.reason?.authorizedAmountMicro ?? null,
      });
    }
  });

  const paymentLedger = paymentPolicy.snapshot();
  const actualMicro = paymentLedger.reservations
    .filter((reservation) => reservation.status === "settled")
    .reduce((sum, reservation) => sum + BigInt(reservation.amountMicro), 0n);
  const estimateMicro = receipts.reduce((sum, receipt) => {
    if (receipt.mode !== "mock" || typeof receipt.estimatedCostUsd !== "number" || !Number.isFinite(receipt.estimatedCostUsd)) return sum;
    return sum + usdFloatToMicro(receipt.estimatedCostUsd);
  }, 0n);
  const memo = assess(candidate, receipts, failures, {
    actualMicro,
    estimateMicro,
    wallMs: now() - started,
    caps,
    mode,
    paymentLedger,
    now,
  });
  return { memo, receipts, failures };
}

function usdFloatToMicro(value) {
  return value === 0 ? 0n : usdToMicro(value, "demonstration estimate");
}

function realAskFactory(paymentPolicy, opts) {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey || opts.signer === null) {
    // No wallet: requests run without payment and surface the 402 challenge as failures.
    return (base, args) => ask(base, args, opts.fetchImpl ?? fetch);
  }
  // The connected wallet signs the x402 "exact" scheme (EIP-3009) directly --
  // no server-side key ever exists. The facilitator verifies and settles on-chain.
  const account = privateKeyToAccount(privateKey);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  const fetchWithPay = wrapFetchWithPayment(fetch, client);
  return async (base, args) => ask(base, args, fetchWithPay);
}

export function assess(candidate, receipts, failures, {
  actualMicro, estimateMicro, wallMs, caps, mode, paymentLedger, now = Date.now,
}) {
  const evidence = {};
  const signals = [];
  const failedFor = (check) => failures.filter((failure) => failure.check === check);
  const receiptsFor = (check) => receipts.filter((receipt) => receipt.check === check);

  for (const check of MANDATORY_CHECKS) {
    const responseReceipts = receiptsFor(check);
    if (mode === "mock") {
      const failed = failedFor(check);
      evidence[check] = {
        status: responseReceipts.length ? "simulated" : failed.length ? "unavailable" : "missing",
        reason: responseReceipts.length
          ? "offline demonstration only; simulation is not decision evidence"
          : failed.map((failure) => failure.error).join("; ") || "no simulated response was produced",
        sourceReferences: [
          ...responseReceipts.map(sourceReference),
          ...failed.map(failureSourceReference),
        ],
      };
      continue;
    }
    if (UNSUPPORTED[check]) {
      evidence[check] = {
        status: "unsupported",
        reason: UNSUPPORTED[check],
        sourceReferences: responseReceipts.map(sourceReference),
      };
      continue;
    }
    const inputStatus = check === "SANCTIONS_SCREENING_MATCH"
      ? candidate.sanctionsInputStatus
      : candidate.socialInputStatus;
    const expectedInputs = check === "SANCTIONS_SCREENING_MATCH"
      ? candidate.sanctionsSubjects.map((name) => ({ name }))
      : candidate.socialAccounts.map((account) => ({ account }));
    if (inputStatus !== "valid") {
      evidence[check] = {
        status: inputStatus,
        reason: check === "SANCTIONS_SCREENING_MATCH"
          ? inputStatus === "invalid"
            ? "deployerName and treasuryName must be non-empty strings"
            : "explicit deployerName and treasuryName inputs are both required; addresses are not guessed"
          : inputStatus === "invalid"
            ? "socialAccounts must contain only non-empty strings"
            : "explicit socialAccounts input is required; channels are not guessed",
        sourceReferences: [],
      };
      continue;
    }
    const selected = expectedInputs.map((input) =>
      responseReceipts.find((receipt) => sameInput(receipt.requestInput ?? receipt.returnedInput, input))
    );
    const failed = failedFor(check);
    if (selected.some((receipt) => !receipt)) {
      const sourceFailures = failedFor(check);
      evidence[check] = {
        status: failed.length ? "unavailable" : "missing",
        reason: failed.map((failure) => failure.error).join("; ") || "required subject receipt is missing",
        sourceReferences: [
          ...responseReceipts.map(sourceReference),
          ...sourceFailures.map(failureSourceReference),
        ],
      };
      continue;
    }
    const invalid = selected.find((receipt) => receipt.evidenceStatus !== "valid");
    if (invalid) {
      evidence[check] = {
        status: ["missing", "unavailable", "unsupported", "invalid"].includes(invalid.evidenceStatus)
          ? invalid.evidenceStatus
          : "invalid",
        reason: (invalid.evidenceIssues ?? []).join("; ") || "receipt is not validated for this check",
        sourceReferences: selected.map(sourceReference),
      };
      continue;
    }
    const expectedIntent = ENGINE_INTENT_BY_CHECK[check];
    if (selected.some((receipt) =>
      receipt.intent !== expectedIntent || receipt.matchedIntent !== expectedIntent
    )) {
      evidence[check] = {
        status: "invalid",
        reason: `receipt request/response intent does not match concrete Engine intent ${expectedIntent}`,
        sourceReferences: selected.map(sourceReference),
      };
      continue;
    }
    evidence[check] = {
      status: "valid",
      reason: `validated ${selected.length} explicit subject${selected.length === 1 ? "" : "s"} against the published response shape`,
      sourceReferences: selected.map(sourceReference),
      results: selected.map((receipt) => receipt.result),
    };
  }

  const sanctions = evidence.SANCTIONS_SCREENING_MATCH;
  const confirmedMatch = receiptsFor("SANCTIONS_SCREENING_MATCH").some((receipt) => {
    const result = receipt.result;
    const name = receipt.requestInput?.name;
    return typeof name === "string" && candidate.sanctionsSubjects.includes(name) &&
      receipt.resultShape === "intent" &&
      receipt.intent === ENGINE_INTENT_BY_CHECK.SANCTIONS_SCREENING_MATCH &&
      receipt.matchedIntent === ENGINE_INTENT_BY_CHECK.SANCTIONS_SCREENING_MATCH &&
      receipt.fieldStatus?.matched === "ok" &&
      result?.name === name && result.matched === true;
  });
  const validChecks = MANDATORY_CHECKS.filter((check) => evidence[check]?.status === "valid");
  const missingChecks = MANDATORY_CHECKS.filter((check) => evidence[check]?.status !== "valid");
  const hardBlock = confirmedMatch;
  if (confirmedMatch) {
    signals.push(["bad", "confirmed sanctions match for an explicitly supplied entity"]);
  } else if (sanctions?.status === "valid") {
    signals.push(["good", "no sanctions match for the explicitly supplied entities; returned list coverage is present"]);
  }
  for (const check of MANDATORY_CHECKS) {
    const item = evidence[check];
    if (item.status !== "valid") signals.push(["warn", `${check} ${item.status}: ${item.reason}`]);
    else if (check === "SOCIAL_BOT_DETECTION") {
      const risky = item.results.some((result) => result.bot_score > 0.25);
      signals.push([risky ? "bad" : "good", `social bot score checked using app threshold 0.25${risky ? " (above threshold)" : " (at or below threshold)"}`]);
    }
  }
  for (const failure of failures) {
    signals.push(["warn", `${failure.check} (${failure.intent}) request ${failure.paymentStatus}: ${failure.error.slice(0, 120)}`]);
  }
  const badCount = signals.filter(([kind]) => kind === "bad").length;
  const verdict = hardBlock ? "NO-GO" :
    missingChecks.length > 0 ? (validChecks.length === 0 ? "UNKNOWN" : "REVIEW") :
      badCount === 0 ? "GO" : badCount === 1 ? "REVIEW" : "NO-GO";
  const completeness = {
    status: missingChecks.length === 0 ? "complete" : "incomplete",
    validChecks,
    missingChecks,
    unsupportedChecks: MANDATORY_CHECKS.filter((check) => evidence[check]?.status === "unsupported"),
    invalidChecks: MANDATORY_CHECKS.filter((check) => evidence[check]?.status === "invalid"),
    unavailableChecks: MANDATORY_CHECKS.filter((check) => evidence[check]?.status === "unavailable"),
  };
  const runCounts = {
    responses: receipts.length,
    validEvidence: receipts.filter((receipt) => receipt.evidenceStatus === "valid").length,
    failed: failures.length,
    unknown: receipts.filter((receipt) => receipt.paymentStatus === "unknown").length +
      failures.filter((failure) => failure.paymentStatus === "unknown").length,
  };
  const paymentStatus = mode === "mock"
    ? { status: "simulated", simulatedReceiptCount: receipts.length, failedCount: failures.length, unknownCount: 0 }
    : summarizePayments(receipts, failures);
  const memo = {
    policyVersion: POLICY_VERSION,
    candidate,
    token: candidate.token,
    verdict,
    hardBlock,
    signals,
    evidence,
    evidenceCompleteness: completeness,
    paymentStatus,
    runCounts,
    actualSpentUsd: formatUsd(actualMicro),
    estimatedCostUsd: formatUsd(estimateMicro),
    actualSpendDescription: mode === "mock" ? "actual spent" : "receipt-backed amount",
    estimateDescription: "demonstration estimate; not spent",
    receipts: receipts.map(minimalReceipt),
    failures,
    wallMs,
    mode,
    modeLabel: mode === "mock" ? "SIMULATED/OFFLINE" : "REAL",
    caps: {
      maxUsdPerRun: caps.maxUsdPerRun,
      maxUsdPerIntent: caps.maxUsdPerIntent,
    },
    paymentLedger,
    generatedAt: new Date(now()).toISOString(),
  };
  memo.contentDigest = contentDigest(memo);
  return memo;
}

function sameInput(actual, expected) {
  return actual && Object.keys(expected).every((key) => actual[key] === expected[key]);
}

function sourceReference(receipt) {
  if (receipt.settlement?.receipt_hash) return `escrow-receipt:${receipt.settlement.receipt_hash}`;
  if (receipt.signalHash) return `engine-signal:${receipt.signalHash}`;
  return null;
}

function failureSourceReference(failure) {
  return failure.settlement?.receipt_hash
    ? `escrow-receipt:${failure.settlement.receipt_hash}`
    : null;
}

function summarizePayments(receipts, failures) {
  const receiptValid = receipts.filter((receipt) => receipt.paymentStatus === "receipt_valid").length +
    failures.filter((failure) => failure.proofStatus === "receipt_valid").length;
  const unknown = receipts.filter((receipt) => receipt.paymentStatus === "unknown").length +
    failures.filter((failure) => failure.paymentStatus === "unknown").length;
  const failed = failures.filter((failure) => ["definitive_unpaid", "policy_rejected"].includes(failure.paymentStatus)).length;
  return { status: unknown ? "unknown" : receiptValid ? "receipt-backed" : failed ? "unpaid-or-rejected" : "not-paid", receiptValid, unknown, failed };
}

function minimalReceipt(receipt) {
  return {
    check: receipt.check ?? null,
    intent: receipt.intent,
    requestInput: receipt.requestInput ?? null,
    minerId: receipt.minerId ?? null,
    minerName: receipt.minerName ?? null,
    costUsd: receipt.costUsd ?? null,
    estimatedCostUsd: receipt.estimatedCostUsd ?? null,
    durationMs: receipt.durationMs ?? null,
    signalHash: receipt.signalHash ?? null,
    resultShape: receipt.resultShape ?? null,
    matchedIntent: receipt.matchedIntent ?? null,
    returnedInput: receipt.returnedInput ?? null,
    fieldStatus: receipt.fieldStatus ?? null,
    evidenceStatus: receipt.evidenceStatus ?? "simulated-or-unverified",
    evidenceIssues: receipt.evidenceIssues ?? [],
    proofStatus: receipt.proofStatus ?? "incomplete",
    proofGaps: receipt.proofGaps ?? [],
    paymentStatus: receipt.paymentStatus ?? "unknown",
    authorizedAmountMicro: receipt.authorizedAmountMicro ?? null,
    settlement: receipt.settlement ?? null,
    rawResponse: receipt.rawResponse ?? null,
    timestamp: receipt.timestamp ?? null,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function contentDigest(artifact) {
  const { contentDigest: _excludedDigest, generatedAt: _excludedGeneratedAt, ...content } = artifact;
  return `sha256-v1:${createHash("sha256").update(JSON.stringify(canonicalize(content))).digest("hex")}`;
}
