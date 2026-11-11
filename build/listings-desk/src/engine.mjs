import { usdCostToMicro } from "./x402.mjs";

const CONTRACT_FIELDS = {
  SANCTIONS_SCREENING_MATCH: ["name", "matched", "matches", "lists", "match_score"],
  SOCIAL_BOT_DETECTION: ["account", "verdict", "bot_score", "signals"],
};

export class PaymentRequiredError extends Error {
  constructor(challenge) {
    super(`402 Payment Required: ${JSON.stringify(challenge).slice(0, 400)}`);
    this.name = "PaymentRequiredError";
    this.challenge = challenge;
    this.isPaymentRequired = true;
    this.paymentStatus = "not_authorized";
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sameValue(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

function validateEngineAnswer({ intent, params, data, authorizedAmountMicro, settlementReceipt, receiptValid }) {
  const issues = [];
  const priority = { valid: 0, missing: 1, unavailable: 2, unsupported: 3, invalid: 4 };
  let evidenceStatus = "valid";
  const note = (status, message) => {
    issues.push(message);
    if (priority[status] > priority[evidenceStatus]) evidenceStatus = status;
  };
  let costMicro = null;
  if (!Object.hasOwn(data, "cost_usd") || data.cost_usd === null) {
    note("missing", "cost_usd is missing");
  } else if (typeof data.cost_usd !== "number" || !Number.isFinite(data.cost_usd) || data.cost_usd < 0) {
    note("invalid", "cost_usd must be a finite non-negative number");
  } else {
    try {
      costMicro = usdCostToMicro(data.cost_usd);
      if (authorizedAmountMicro != null && costMicro !== BigInt(authorizedAmountMicro)) {
        note("invalid", "cost_usd does not reconcile with the authorized micro-USDC amount");
      }
    } catch (error) {
      note("invalid", error.message);
    }
  }
  if (typeof data.intent !== "string") note("missing", "matched intent is missing");
  else if (data.intent !== intent) note("invalid", "matched intent does not match the request");
  if (!Object.hasOwn(data, "input") || data.input == null) {
    note("missing", "returned input is missing");
  } else if (!isRecord(data.input) || !sameValue(data.input, params)) {
    note("invalid", "returned input does not match the requested candidate identity");
  }
  if (!Object.hasOwn(data, "result_shape") || data.result_shape == null) {
    note("missing", "result_shape is missing");
  } else if (data.result_shape !== "intent" && data.result_shape !== "raw") {
    note("invalid", "result_shape is unrecognized");
  }
  if (!Object.hasOwn(data, "result")) {
    note("missing", "response result is missing; the response envelope is not a result");
  }
  if (data.result_shape === "intent" && Object.hasOwn(data, "result") && !isRecord(data.result)) {
    note("invalid", "shaped intent result must be an object");
  }
  const result = isRecord(data.result) ? data.result : null;
  if (evidenceStatus === "valid" && data.result_shape === "raw") {
    note("unsupported", `raw result has no validated adapter for ${intent}`);
  } else if (evidenceStatus === "valid" && result) {
    const requiredFields = CONTRACT_FIELDS[intent];
    if (!requiredFields) {
      note("unsupported", `no supported decision adapter for ${intent}`);
    } else if (!isRecord(data.field_status)) {
      note("missing", "field_status is missing for shaped result");
    } else if (requiredFields.some((field) => data.field_status[field] !== "ok")) {
      const statuses = requiredFields.map((field) => data.field_status[field]);
      if (statuses.some((status) => status === "rejected" ||
          !["ok", "missing", "unavailable", "rejected"].includes(status))) {
        note("invalid", "one or more required shaped fields are rejected or unrecognized");
      } else if (statuses.includes("unavailable")) note("unavailable", "one or more required shaped fields are unavailable");
      else if (statuses.includes("missing")) note("missing", "one or more required shaped fields are missing");
    } else if (intent === "SANCTIONS_SCREENING_MATCH") {
      const { name, matched, matches, lists } = result;
      if (typeof name !== "string" || name !== params.name ||
          typeof matched !== "boolean" || !Array.isArray(matches) ||
          !matches.every((entry) =>
            (typeof entry === "string" && entry.trim()) ||
            (isRecord(entry) && Object.values(entry).some((value) => typeof value === "string" && value.trim()))
          ) ||
          !Array.isArray(lists) || lists.length === 0 ||
          !lists.every((entry) => typeof entry === "string" && entry.trim()) ||
          typeof result.match_score !== "number" || !Number.isFinite(result.match_score) ||
          result.match_score < 0 || result.match_score > 1 ||
          (matched && matches.length === 0) || (!matched && matches.length > 0)) {
        note("invalid", "sanctions result has wrong identity, malformed coverage or contradictory match fields");
      }
    } else if (intent === "SOCIAL_BOT_DETECTION") {
      if (result.account !== params.account ||
          !["bot", "likely_bot", "inconclusive", "likely_human", "human"].includes(result.verdict) ||
          typeof result.bot_score !== "number" || !Number.isFinite(result.bot_score) ||
          result.bot_score < 0 || result.bot_score > 1 ||
          !Array.isArray(result.signals) || result.signals.length === 0) {
        note("invalid", "social result has wrong identity or malformed/out-of-range decision fields");
      }
    }
  }
  const proofGaps = [];
  const minerIdValid = (typeof data.miner_id === "string" && data.miner_id.trim()) ||
    (Number.isSafeInteger(data.miner_id) && data.miner_id > 0);
  if (!minerIdValid || typeof data.miner_name !== "string" || !data.miner_name.trim()) {
    proofGaps.push("miner identity missing or malformed");
  }
  if (typeof data.signal_hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(data.signal_hash)) {
    proofGaps.push("Engine signal hash missing or malformed");
  }
  if (!settlementReceipt) proofGaps.push("escrow receipt missing");
  else if (!receiptValid) proofGaps.push("escrow receipt malformed or inconsistent");
  return {
    evidenceStatus,
    issues,
    costMicro: costMicro == null ? null : String(costMicro),
    proofStatus: receiptValid ? "receipt_valid" : "incomplete",
    proofGaps,
  };
}

export async function ask(engineBase, args, fetchImpl = fetch) {
  const now = args.now ?? Date.now;
  const started = now();
  const body = args.params
    ? { intent: args.intent, params: args.params }
    : { query: args.query, ...(args.context ? { context: args.context } : {}) };
  let res;
  try {
    res = await fetchImpl(`${engineBase.replace(/\/$/, "")}/v1/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(args.timeoutMs ?? 120_000),
    });
  } catch (error) {
    if (error && typeof error === "object" &&
        error.paymentStatus !== "unknown" && error.paymentPolicyRejected !== true) {
      error.paymentStatus = "not_authorized";
    }
    throw error;
  }
  if (res.status === 402) {
    let challenge = null;
    try { challenge = await res.json(); } catch { /* malformed challenge is surfaced as unavailable */ }
    const error = new PaymentRequiredError(challenge);
    error.paymentStatus = res.paymentStatus ?? "not_authorized";
    error.settlementReceipt = res.settlementReceipt ?? null;
    error.receiptValid = res.receiptValid === true;
    error.authorizedAmountMicro = res.authorizedAmountMicro ?? null;
    throw error;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const error = new Error(`Engine HTTP ${res.status}: ${text.slice(0, 200)}`);
    error.paymentStatus = res.paymentStatus ?? "unknown";
    error.settlementReceipt = res.settlementReceipt ?? null;
    error.receiptValid = res.receiptValid === true;
    error.authorizedAmountMicro = res.authorizedAmountMicro ?? null;
    throw error;
  }
  let data;
  try {
    data = await res.json();
  } catch {
    const error = new Error("Engine response body is absent or invalid JSON");
    error.paymentStatus = res.paymentStatus ?? "unknown";
    error.settlementReceipt = res.settlementReceipt ?? null;
    error.receiptValid = res.receiptValid === true;
    error.authorizedAmountMicro = res.authorizedAmountMicro ?? null;
    throw error;
  }
  if (!isRecord(data)) {
    const error = new Error("Engine response body must be a JSON object");
    error.paymentStatus = res.paymentStatus ?? "unknown";
    error.settlementReceipt = res.settlementReceipt ?? null;
    error.receiptValid = res.receiptValid === true;
    error.authorizedAmountMicro = res.authorizedAmountMicro ?? null;
    throw error;
  }

  const validation = validateEngineAnswer({
    intent: args.intent,
    params: args.params ?? {},
    data,
    authorizedAmountMicro: res.authorizedAmountMicro,
    settlementReceipt: res.settlementReceipt,
    receiptValid: res.receiptValid === true,
  });
  const costUsd = validation.costMicro == null ? null : Number(validation.costMicro) / 1_000_000;
  return {
    intent: args.intent,
    mode: "real",
    minerId: data.miner_id ?? null,
    minerName: data.miner_name ?? null,
    costUsd,
    durationMs: Number.isFinite(data.duration_ms) && data.duration_ms >= 0 ? data.duration_ms : now() - started,
    signalHash: data.signal_hash ?? null,
    reasoning: typeof data.reasoning === "string" ? data.reasoning : null,
    result: Object.hasOwn(data, "result") ? data.result : null,
    rawResponse: data,
    resultShape: data.result_shape ?? null,
    fieldStatus: isRecord(data.field_status) ? data.field_status : null,
    matchedIntent: data.intent ?? null,
    returnedInput: data.input ?? null,
    evidenceStatus: validation.evidenceStatus,
    evidenceIssues: validation.issues,
    proofStatus: validation.proofStatus,
    proofGaps: validation.proofGaps,
    settlement: res.settlementReceipt ?? null,
    paymentStatus: res.paymentStatus ?? "unknown",
    authorizedAmountMicro: res.authorizedAmountMicro ?? null,
    timestamp: typeof data.timestamp === "string" ? data.timestamp : null,
  };
}

export function makeMockAsk({
  seed = "telegraph-demo",
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = Date.now,
} = {}) {
  let callCounter = 0;
  const seedNum = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const answerFor = (intent) => {
    const jitter = ((seedNum + callCounter++) % 7) / 100;
    switch (intent) {
      case "SMART_CONTRACT_AUDIT":
        return {
          result: { bytecode_verified: true, owner_mint: false, blacklist_function: false, honeypot_signals: [], risk_score: +(0.18 + jitter).toFixed(3) },
        };
      case "ONCHAIN_METRIC_VERIFY":
        return { result: { holders: 4812, top10_concentration_pct: +(22.4 + jitter * 100).toFixed(1), liquidity_usd: 1842000, contract_age_days: 411 } };
      case "SANCTIONS_SCREENING_MATCH":
        return { result: { lists_checked: ["OFAC_SDN", "UK_HMT", "EU Consolidated"], matches: [], clean: true } };
      case "SOCIAL_BOT_DETECTION":
        return { result: { bot_share_estimate: +(0.11 + jitter).toFixed(3), signals: ["simulated sample"] } };
      case "CODE_REVIEW":
        return { result: { authenticity_score: +(0.86 - jitter).toFixed(3), findings: ["simulated sample"] } };
      default:
        return { result: {} };
    }
  };
  return async function mockAsk(_engineBase, { intent }) {
    await sleep(10);
    callCounter++;
    const answer = answerFor(intent);
    return {
      intent,
      mode: "mock",
      minerId: null,
      minerName: "SIMULATED",
      costUsd: 0,
      estimatedCostUsd: 0.01,
      durationMs: 10,
      signalHash: null,
      reasoning: "SIMULATED/OFFLINE fixture; no Engine request, payment, miner or proof.",
      result: answer.result,
      evidenceStatus: "simulated",
      proofStatus: "simulated",
      paymentStatus: "simulated",
      timestamp: new Date(now()).toISOString(),
    };
  };
}
