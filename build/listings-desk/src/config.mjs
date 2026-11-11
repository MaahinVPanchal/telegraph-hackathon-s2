export const ENGINE_BASE =
  process.env.TELEGRAPH_ENGINE_URL || "https://devnode.telegraphprotocol.com/engine";

export const POLICY_VERSION = "listings-desk-policy-2026-11-11-v3";

export const DEFAULTS = {
  mode: "mock",
  maxUsdPerRun: process.env.MAX_USD_PER_RUN ?? "0.10",
  maxUsdPerIntent: process.env.MAX_USD_PER_INTENT ?? "0.02",
};

export const MANDATORY_CHECKS = [
  "SMART_CONTRACT_AUDIT",
  "ONCHAIN_METRIC_VERIFY",
  "SANCTIONS_SCREENING_MATCH",
  "SOCIAL_BOT_DETECTION",
  "CODE_REVIEW",
];

export const INTENT_ASKS = [
  {
    check: "SMART_CONTRACT_AUDIT",
    intent: "SMART_CONTRACT_AUDIT_GENERAL",
    query: "Audit the smart contract at {token}: report verified source, owner controls, honeypot findings and risk score.",
  },
  {
    check: "ONCHAIN_METRIC_VERIFY",
    intent: "ONCHAIN_METRIC_VERIFY_GENERAL",
    query: "For token {token}: report holder count, top-10 concentration, liquidity and contract age.",
  },
  {
    check: "SANCTIONS_SCREENING_MATCH",
    intent: "SANCTIONS_SCREENING_MATCH_GENERAL",
    query: "Screen the explicitly supplied project entity {subject} against sanctions lists.",
  },
  {
    check: "SOCIAL_BOT_DETECTION",
    intent: "SOCIAL_BOT_DETECTION_GENERAL",
    query: "Assess the explicitly supplied project social account {account}.",
  },
  {
    check: "CODE_REVIEW",
    intent: "CODE_REVIEW_GENERAL",
    query: "Review the explicitly supplied repository source for project history and contributor authenticity.",
  },
];

export const ENGINE_INTENT_BY_CHECK = Object.freeze(
  Object.fromEntries(INTENT_ASKS.map(({ check, intent }) => [check, intent]))
);

const usdPattern = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/;

export function usdToMicro(value, label = "USD amount") {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError(`${label} must be a decimal USD string or finite number`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  const text = String(value);
  const match = usdPattern.exec(text);
  if (!match) {
    throw new TypeError(`${label} must be a non-negative decimal with at most 6 fractional digits`);
  }
  const micros = BigInt(match[1]) * 1_000_000n +
    BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  if (micros <= 0n) throw new RangeError(`${label} must be greater than zero`);
  if (typeof value === "number" &&
      (micros > BigInt(Number.MAX_SAFE_INTEGER) || Number(micros) / 1_000_000 !== value)) {
    throw new RangeError(`${label} cannot be represented safely as integer micro-USDC; provide an exact decimal string`);
  }
  return micros;
}

export function formatUsd(micros) {
  const value = typeof micros === "bigint" ? micros : BigInt(micros);
  const whole = value / 1_000_000n;
  const fraction = String(value % 1_000_000n).padStart(6, "0").replace(/0+$/, "");
  return fraction ? `$${whole}.${fraction}` : `$${whole}`;
}

export function resolveCaps(overrides = {}) {
  const maxUsdPerRunMicros = usdToMicro(overrides.maxUsdPerRun ?? DEFAULTS.maxUsdPerRun, "maxUsdPerRun");
  const maxUsdPerIntentMicros = usdToMicro(overrides.maxUsdPerIntent ?? DEFAULTS.maxUsdPerIntent, "maxUsdPerIntent");
  return {
    mode: overrides.mode ?? DEFAULTS.mode,
    maxUsdPerRun: formatUsd(maxUsdPerRunMicros).slice(1),
    maxUsdPerIntent: formatUsd(maxUsdPerIntentMicros).slice(1),
    maxUsdPerRunMicros,
    maxUsdPerIntentMicros,
  };
}
