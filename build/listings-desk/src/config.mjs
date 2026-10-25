// Configuration: the five Intents the listings desk buys, and the money guardrails.
// Safe handling is a scored rubric item — spending caps are enforced before dispatch.

export const ENGINE_BASE =
  process.env.TELEGRAPH_ENGINE_URL || "https://devnode.telegraphprotocol.com/engine";

export const DEFAULTS = {
  mode: "mock", // "mock" (no wallet needed) | "real" (x402 USDC payments)
  maxUsdPerRun: Number(process.env.MAX_USD_PER_RUN ?? 0.1),
  maxUsdPerIntent: Number(process.env.MAX_USD_PER_INTENT ?? 0.02),
  requestTimeoutMs: 30_000,
};

// One entry per intelligence need of the Mission 01 example build
// ("The autonomous listings desk", hackathon.telegraphprotocol.com/missions/exchange).
// Each query is a natural-language ask; the Engine classifies it to the Intent and
// routes to the best-ranked miner. We never pick miners ourselves.
export const INTENT_ASKS = [
  {
    intent: "SMART_CONTRACT_AUDIT",
    query:
      "Audit the smart contract at {token}: is the bytecode verified, is there an owner-controlled mint or blacklist function, is the source a honeypot, and what is the overall deploy risk? Answer with findings and a risk score 0-1.",
    weight: 0.25,
  },
  {
    intent: "ONCHAIN_METRIC_VERIFY",
    query:
      "For token {token}: report holder count, top-10 holder concentration as a percentage of supply, liquidity pool depth in USD, and contract age. Answer with the numbers as of now.",
    weight: 0.2,
  },
  {
    intent: "SANCTIONS_SCREENING_MATCH",
    query:
      "Screen the deployer and treasury addresses of token {token} against sanctions lists (OFAC SDN and similar). Answer with matches found or a clean result, and the lists checked.",
    weight: 0.2,
  },
  {
    intent: "SOCIAL_BOT_DETECTION",
    query:
      "Analyze the social following of token {token}: estimate the share of bot or purchased accounts on its X/community channels. Answer with a bot share estimate 0-1 and the signals used.",
    weight: 0.15,
  },
  {
    intent: "CODE_REVIEW",
    query:
      "Review the public commit history and contributor authenticity of token {token}'s repository: are commits organic, do contributors have real history, any signs of a copy-paste fork? Answer with findings and an authenticity score 0-1.",
    weight: 0.2,
  },
];

export function resolveCaps(overrides = {}) {
  const caps = { ...DEFAULTS, ...overrides };
  if (caps.maxUsdPerIntent * INTENT_ASKS.length > caps.maxUsdPerRun) {
    // Never let per-intent caps sum past the run cap.
    caps.maxUsdPerIntent = Math.min(caps.maxUsdPerIntent, caps.maxUsdPerRun / INTENT_ASKS.length);
  }
  return caps;
}
