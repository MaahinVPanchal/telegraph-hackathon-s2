// Preview scenarios for the offline workspace and /memo.
//
// The preview runs STATIC FIXTURE receipts through the real assess() evidence
// path (runDesk with an injected askImpl and mode "real"), so every verdict
// comes from the same decision pipeline a live run uses — never from a
// hard-coded verdict string. Nothing here touches the network: no Engine
// calls, no payments, no wallet, no fetch.
//
// Honesty rules (do not weaken):
//   - fixture data is always labeled (memo.preview = true + preview banner);
//   - the preview can never produce GO (fixtures only cover sanctions/social,
//     and audit/on-chain/code-review stay unsupported);
//   - receipts carry no miner, signal hash, cost or settlement — those fields
//     stay empty and proof gaps say so explicitly.

import { runDesk, contentDigest } from "./desk.mjs";
import { ENGINE_INTENT_BY_CHECK } from "./config.mjs";

export const DEFAULT_PREVIEW_SCENARIO = 1;

const SANCTIONS_INTENT = ENGINE_INTENT_BY_CHECK.SANCTIONS_SCREENING_MATCH;
const SOCIAL_INTENT = ENGINE_INTENT_BY_CHECK.SOCIAL_BOT_DETECTION;

// Fixed example subjects. The preview never screens arbitrary visitor input:
// every scenario screens exactly these fixture identities, and the workspace
// form fields are rehearsal inputs that explain the LIVE data model.
export const PREVIEW_FIXTURES = {
  token: "PREVIEW",
  ordinary: {
    deployerName: "Sample Deployer Ltd",
    treasuryName: "Sample Treasury Foundation",
    socialAccount: "@sample_account",
    repositoryUrl: "https://github.com/example/sample-repo",
  },
  sanctioned: {
    deployerName: "Sample Sanctioned Entity",
    treasuryName: "Sample Treasury Foundation",
    repositoryUrl: "https://github.com/example/sample-repo",
  },
  botSocialAccount: "@sample_bot",
};

// Marks by-design non-sent jobs so the preview presenter can prune them from
// the memo (they are walkthrough structure, not run failures).
const SKIP_PREFIX = "preview-skip:";

function skipJob(check, reason) {
  const error = new Error(`${SKIP_PREFIX} ${check} was not sent: ${reason}`);
  error.paymentStatus = "not_paid";
  throw error;
}

function unavailableJob(check, message) {
  const error = new Error(message);
  error.paymentStatus = "not_paid";
  throw error;
}

function sanctionsReceipt({ name, matched, matches, lists, matchScore }) {
  return {
    intent: SANCTIONS_INTENT,
    mode: "preview",
    minerId: null,
    minerName: "FIXTURE",
    costUsd: 0,
    durationMs: 0,
    signalHash: null,
    reasoning: "Preview fixture; no Engine request, payment, miner or proof.",
    result: { name, matched, matches, lists, match_score: matchScore },
    rawResponse: null,
    resultShape: "intent",
    // Mirrors the published contract: a clean no-match legitimately omits
    // matches/lists; a match reports every shaped field.
    fieldStatus: matched
      ? { name: "ok", matched: "ok", matches: "ok", lists: "ok", match_score: "ok" }
      : { name: "ok", matched: "ok", matches: "missing", lists: "missing", match_score: "ok" },
    matchedIntent: SANCTIONS_INTENT,
    returnedInput: { name },
    requestInput: { name },
    evidenceStatus: "valid",
    evidenceIssues: [],
    proofStatus: "incomplete",
    proofGaps: [
      "preview fixture: no Engine signal hash",
      "preview fixture: no escrow receipt; nothing was paid",
    ],
    paymentStatus: "not_paid",
    authorizedAmountMicro: null,
    settlement: null,
    timestamp: null,
  };
}

function socialReceipt({ account, verdict, botScore, signals }) {
  return {
    intent: SOCIAL_INTENT,
    mode: "preview",
    minerId: null,
    minerName: "FIXTURE",
    costUsd: 0,
    durationMs: 0,
    signalHash: null,
    reasoning: "Preview fixture; no Engine request, payment, miner or proof.",
    result: { account, verdict, bot_score: botScore, signals },
    rawResponse: null,
    resultShape: "intent",
    fieldStatus: { account: "ok", verdict: "ok", bot_score: "ok", signals: "ok" },
    matchedIntent: SOCIAL_INTENT,
    returnedInput: { account },
    requestInput: { account },
    evidenceStatus: "valid",
    evidenceIssues: [],
    proofStatus: "incomplete",
    proofGaps: [
      "preview fixture: no Engine signal hash",
      "preview fixture: no escrow receipt; nothing was paid",
    ],
    paymentStatus: "not_paid",
    authorizedAmountMicro: null,
    settlement: null,
    timestamp: null,
  };
}

const { ordinary, sanctioned, botSocialAccount } = PREVIEW_FIXTURES;

const cleanSanctionsFor = (name, matchScore) => sanctionsReceipt({
  name,
  matched: false,
  matches: [],
  lists: ["OFAC SDN"],
  matchScore,
});

const humanSocialReceipt = () => socialReceipt({
  account: ordinary.socialAccount,
  verdict: "human",
  botScore: 0.1,
  signals: ["fixture: steady human posting cadence", "fixture: conversation replies present"],
});

const botSocialReceipt = () => socialReceipt({
  account: botSocialAccount,
  verdict: "likely_bot",
  botScore: 0.4,
  signals: ["fixture: repetitive posting cadence", "fixture: mostly recycled content"],
});

export const PREVIEW_SCENARIOS = [
  {
    id: 1,
    name: "Token only",
    summary: "Only a token symbol is supplied. Without explicit entity names nothing is screenable, so checks stay missing or unsupported.",
    candidate: (token) => ({ token }),
    respond({ check }) {
      skipJob(check, "this scenario supplies the token only, and explicit inputs are never guessed");
    },
  },
  {
    id: 2,
    name: "Clean explicit identities",
    summary: "Deployer, treasury and social account are supplied explicitly and screen clean, while unsupported checks stay unsent.",
    candidate: (token) => ({
      token,
      deployerName: ordinary.deployerName,
      treasuryName: ordinary.treasuryName,
      socialAccounts: [ordinary.socialAccount],
      repositoryUrl: ordinary.repositoryUrl,
    }),
    respond({ check }) {
      if (check === "SANCTIONS_SCREENING_MATCH") {
        // One generic job per check on the injected path -- return one receipt
        // per explicit subject, exactly what the real per-subject jobs produce.
        return [
          cleanSanctionsFor(ordinary.deployerName, 0.04),
          cleanSanctionsFor(ordinary.treasuryName, 0.07),
        ];
      }
      if (check === "SOCIAL_BOT_DETECTION") return humanSocialReceipt();
      skipJob(check, "unsupported by current contracts");
    },
  },
  {
    id: 3,
    name: "Sanctions screening unavailable",
    summary: "The sanctions screening response is unavailable, social evidence is still valid, and the memo must say so instead of guessing.",
    candidate: (token) => ({
      token,
      deployerName: ordinary.deployerName,
      treasuryName: ordinary.treasuryName,
      socialAccounts: [ordinary.socialAccount],
      repositoryUrl: ordinary.repositoryUrl,
    }),
    respond({ check }) {
      if (check === "SANCTIONS_SCREENING_MATCH") {
        unavailableJob(check,
          "the sanctions screening response is unavailable in this scenario (simulated screening outage); nothing was paid");
      }
      if (check === "SOCIAL_BOT_DETECTION") return humanSocialReceipt();
      skipJob(check, "unsupported by current contracts");
    },
  },
  {
    id: 4,
    name: "Bot-like social account",
    summary: "Sanctions screen clean but the supplied social account scores above the app's 0.25 bot threshold.",
    candidate: (token) => ({
      token,
      deployerName: ordinary.deployerName,
      treasuryName: ordinary.treasuryName,
      socialAccounts: [botSocialAccount],
      repositoryUrl: ordinary.repositoryUrl,
    }),
    respond({ check }) {
      if (check === "SANCTIONS_SCREENING_MATCH") {
        return [
          cleanSanctionsFor(ordinary.deployerName, 0.04),
          cleanSanctionsFor(ordinary.treasuryName, 0.07),
        ];
      }
      if (check === "SOCIAL_BOT_DETECTION") return botSocialReceipt();
      skipJob(check, "unsupported by current contracts");
    },
  },
  {
    id: 5,
    name: "Sanctioned entity match",
    summary: "A supplied entity matches a sanctions list, which hard-blocks the assessment regardless of anything else.",
    candidate: (token) => ({
      token,
      deployerName: sanctioned.deployerName,
      treasuryName: sanctioned.treasuryName,
      repositoryUrl: sanctioned.repositoryUrl,
    }),
    respond({ check }) {
      if (check === "SANCTIONS_SCREENING_MATCH") {
        return [
          sanctionsReceipt({
            name: sanctioned.deployerName,
            matched: true,
            matches: ["Sample Sanctioned Entity"],
            lists: ["OFAC SDN"],
            matchScore: 0.97,
          }),
          cleanSanctionsFor(sanctioned.treasuryName, 0.06),
        ];
      }
      skipJob(check, check === "SOCIAL_BOT_DETECTION"
        ? "this scenario supplies no social account"
        : "unsupported by current contracts");
    },
  },
];

export function parsePreviewScenario(raw) {
  if (raw == null || String(raw).trim() === "") return DEFAULT_PREVIEW_SCENARIO;
  const text = String(raw).trim();
  return /^[1-5]$/.test(text) ? Number(text) : null;
}

export function getPreviewScenario(id) {
  const definition = PREVIEW_SCENARIOS.find((scenario) => scenario.id === id);
  if (!definition) throw new TypeError(`unknown preview scenario: ${id}`);
  return definition;
}

const WALK_CHECKS = [
  { check: "SANCTIONS_SCREENING_MATCH", intent: SANCTIONS_INTENT },
  { check: "SOCIAL_BOT_DETECTION", intent: SOCIAL_INTENT },
  { check: "SMART_CONTRACT_AUDIT", intent: ENGINE_INTENT_BY_CHECK.SMART_CONTRACT_AUDIT },
  { check: "ONCHAIN_METRIC_VERIFY", intent: ENGINE_INTENT_BY_CHECK.ONCHAIN_METRIC_VERIFY },
  { check: "CODE_REVIEW", intent: ENGINE_INTENT_BY_CHECK.CODE_REVIEW },
];

function subjectsLine(definition) {
  const candidate = definition.candidate(PREVIEW_FIXTURES.token);
  const names = [candidate.deployerName, candidate.treasuryName].filter(Boolean);
  const accounts = candidate.socialAccounts ?? [];
  return [
    names.length ? `entities: ${names.map((name) => JSON.stringify(name)).join(", ")}` : null,
    accounts.length ? `social account: ${JSON.stringify(accounts[0])}` : null,
    candidate.repositoryUrl ? `repository: ${candidate.repositoryUrl}` : null,
  ].filter(Boolean).join(" · ") || "token only — no explicit identities supplied";
}

function requestLine(intent, paramsList) {
  return `POST /engine/v1/ask → intent ${intent} · params ${JSON.stringify(paramsList)} (fixture; no request is dialed)`;
}

// Per-scenario stage text for checks this scenario actually exercises. A check
// with no stage here is rendered "not sent" with the check-specific reason.
function fixtureStages(definition) {
  const stages = {};
  const candidate = definition.candidate(PREVIEW_FIXTURES.token);
  const names = [candidate.deployerName, candidate.treasuryName].filter(Boolean);
  if (names.length) {
    stages.SANCTIONS_SCREENING_MATCH = {
      input: subjectsLine(definition),
      request: requestLine(SANCTIONS_INTENT, names),
      answer: definition.id === 3
        ? "no answer — the screening response is unavailable in this scenario"
        : definition.id === 5
          ? `${JSON.stringify(sanctioned.deployerName)} → matched=true, matches ["Sample Sanctioned Entity"], lists ["OFAC SDN"], match_score 0.97; ${JSON.stringify(sanctioned.treasuryName)} → matched=false`
          : `${JSON.stringify(ordinary.deployerName)} → matched=false, lists checked ["OFAC SDN"], match_score 0.04; ${JSON.stringify(ordinary.treasuryName)} → matched=false, match_score 0.07`,
      validation: definition.id === 3
        ? "recorded as unavailable with paymentStatus not_paid; the memo never guesses a screening result"
        : "returned identity, matched intent and shaped fields validated against the published response contract (fixture answer, not a live response)",
    };
  }
  if (candidate.socialAccounts?.length) {
    const bot = definition.id === 4;
    stages.SOCIAL_BOT_DETECTION = {
      input: `social account: ${JSON.stringify(bot ? botSocialAccount : ordinary.socialAccount)}`,
      request: requestLine(SOCIAL_INTENT, [bot ? botSocialAccount : ordinary.socialAccount]),
      answer: bot
        ? `verdict likely_bot, bot_score 0.40, signals ["fixture: repetitive posting cadence", "fixture: mostly recycled content"]`
        : `verdict human, bot_score 0.10, signals ["fixture: steady human posting cadence", "fixture: conversation replies present"]`,
      validation: "returned account, verdict vocabulary, score range and signals validated (fixture answer, not a live response)",
    };
  }
  return stages;
}

const NOT_SENT_REQUEST = {
  SANCTIONS_SCREENING_MATCH:
    "not sent: explicit deployer and treasury names are required, and this scenario supplies the token only",
  SOCIAL_BOT_DETECTION:
    "not sent: an explicit social account is required, and this scenario supplies none",
  SMART_CONTRACT_AUDIT: "not sent: unsupported by current contracts",
  ONCHAIN_METRIC_VERIFY: "not sent: unsupported by current contracts",
  CODE_REVIEW: "not sent: unsupported by current contracts",
};

function buildWalkthrough(definition, memo) {
  const stages = fixtureStages(definition);
  const evidence = memo.evidence ?? {};
  return WALK_CHECKS.map(({ check, intent }) => {
    const fixture = stages[check];
    const item = evidence[check] ?? {};
    const sent = Boolean(fixture);
    return {
      check,
      intent: sent ? intent : null,
      sent,
      input: fixture?.input ?? subjectsLine(definition),
      request: fixture?.request ?? NOT_SENT_REQUEST[check],
      answer: fixture?.answer ?? "—",
      validation: fixture?.validation ?? "—",
      verdict: item.status ?? "missing",
      reason: item.reason ?? "",
    };
  });
}

// Removes by-design skip failures (and their signals) that the injected ask
// produced for checks the scenario intentionally does not exercise. Evidence
// statuses themselves already carry the honest missing/unsupported wording.
function prunePreviewSkips(memo) {
  memo.failures = (memo.failures ?? []).filter((failure) =>
    !String(failure.error ?? "").includes(SKIP_PREFIX));
  memo.signals = (memo.signals ?? []).filter(([kind, text]) =>
    !(kind === "warn" && String(text).includes(SKIP_PREFIX)));
  if (memo.runCounts) memo.runCounts.failed = memo.failures.length;
}

export async function runPreviewMemo(scenarioId, token) {
  const definition = getPreviewScenario(scenarioId);
  // mode "real" + askImpl: the real assess() evidence path decides statuses and
  // the verdict, but the injected ask returns static fixtures and never dials.
  const { memo, receipts, failures } = await runDesk(
    definition.candidate(token),
    // async so scenario skips become rejected jobs (allSettled handles them),
    // never a synchronous throw during job construction.
    { mode: "real", askImpl: async (_engineBase, args) => definition.respond(args) },
  );
  prunePreviewSkips(memo);
  // Stamp the preview labeling AFTER assess() so the decision pipeline is the
  // production one; the digest is recomputed so it covers the labels as well.
  memo.preview = true;
  memo.previewScenario = { id: definition.id, name: definition.name, summary: definition.summary };
  memo.previewWalkthrough = buildWalkthrough(definition, memo);
  memo.mode = "mock";
  memo.modeLabel = "SIMULATED/OFFLINE";
  memo.actualSpendDescription = "actual spent (preview: no funds moved)";
  memo.contentDigest = contentDigest(memo);
  return { memo, receipts, failures };
}
