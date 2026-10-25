// The listings desk: fire the five paid requests in parallel, collect receipts,
// score the listing, and assemble the memo. One app run = one complete,
// reviewable mission result with a verification hash and a cost line.

import { createHash } from "node:crypto";
import { INTENT_ASKS, resolveCaps, ENGINE_BASE } from "./config.mjs";
import { ask, makeMockAsk, PaymentRequiredError } from "./engine.mjs";
import { EscrowSigner, fetchWithEscrow } from "./x402.mjs";

/**
 * Run the desk for one listing candidate.
 * @param {string} token  token symbol or address under review
 * @param {object} opts   { mode, maxUsdPerRun, maxUsdPerIntent, fetchImpl, askImpl }
 * @returns {{ memo: object, receipts: object[] }}  structured result (memo rendered separately)
 */
export async function runDesk(token, opts = {}) {
  const caps = resolveCaps(opts);
  const mode = opts.mode ?? caps.mode;

  const estimated = INTENT_ASKS.length * caps.maxUsdPerIntent;
  if (estimated > caps.maxUsdPerRun) {
    throw new Error(
      `run cap $${caps.maxUsdPerRun.toFixed(2)} cannot cover ${INTENT_ASKS.length} intents at $${caps.maxUsdPerIntent.toFixed(2)} each`
    );
  }

  const engineBase = opts.engineBase ?? ENGINE_BASE;
  const askFn =
    opts.askImpl ??
    (mode === "mock" ? makeMockAsk({ seed: token }) : realAskFactory(caps));

  const started = Date.now();
  // The heart of the Mission 01 example build: one request per intelligence need,
  // all fired simultaneously, each routed by Telegraph to the best-ranked miner.
  const settled = await Promise.allSettled(
    INTENT_ASKS.map((a) =>
      askFn(engineBase, {
        intent: a.intent,
        query: a.query.replaceAll("{token}", token),
        context: { token, mission: "exchange-listings-desk" },
        maxUsd: caps.maxUsdPerIntent,
      })
    )
  );

  const receipts = [];
  const failures = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") receipts.push(s.value);
    else
      failures.push({
        intent: INTENT_ASKS[i].intent,
        query: INTENT_ASKS[i].query.replaceAll("{token}", token),
        error: String(s.reason?.message ?? s.reason),
        isPaymentRequired: s.reason instanceof PaymentRequiredError,
      });
  });

  // Retry pass — sequential with backoff. The Engine's LLM router 429s under
  // parallel bursts and some miner upstreams flap; failed requests are never
  // billed, so a retry costs nothing unless it actually succeeds.
  let spent = receipts.reduce((s, r) => s + r.costUsd, 0);
  for (const f of failures.filter((x) => !x.isPaymentRequired)) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (spent + caps.maxUsdPerIntent > caps.maxUsdPerRun) break; // stay under the run cap
      await new Promise((r) => setTimeout(r, 3000 * attempt));
      try {
        const r = await askFn(engineBase, {
          intent: f.intent,
          query: f.query,
          context: { token, mission: "exchange-listings-desk", retry: attempt },
          maxUsd: caps.maxUsdPerIntent,
        });
        spent += r.costUsd;
        receipts.push(r);
        f.retried = true;
        f.recovered = true;
        break;
      } catch (e) {
        f.error = String(e?.message ?? e);
        f.isPaymentRequired = e instanceof PaymentRequiredError;
        if (f.isPaymentRequired) break;
      }
    }
  }
  const recovered = failures.filter((f) => f.recovered);
  for (const f of recovered) failures.splice(failures.indexOf(f), 1);
  for (const f of recovered) f.error = null;

  if (!receipts.length) {
    const pr = failures.find((f) => f.isPaymentRequired);
    throw new Error(
      pr
        ? `no intelligence could be purchased — the Engine returned 402 Payment Required.\n` +
          `In REAL mode you need USDC on Base and a funded wallet (see README "Going real").\n` +
          `Run with --mode mock to exercise the pipeline without payments.`
        : `all requests failed: ${failures.map((f) => `${f.intent}: ${f.error}`).join("; ")}`
    );
  }

  const totalUsd = receipts.reduce((s, r) => s + r.costUsd, 0);
  if (totalUsd > caps.maxUsdPerRun) {
    throw new Error(`spending cap breach: run total $${totalUsd.toFixed(4)} > cap $${caps.maxUsdPerRun.toFixed(2)}`);
  }

  const memo = assess(token, receipts, failures, {
    totalUsd,
    wallMs: Date.now() - started,
    caps,
    mode,
  });
  return { memo, receipts, failures };
}

/** Real mode: plain fetch, upgraded to the escrow x402 flow when a wallet key is present. */
function realAskFactory(caps) {
  const key = process.env.WALLET_PRIVATE_KEY;
  const signer = key ? new EscrowSigner(key) : null;
  if (!signer) {
    console.error(
      "[real mode] WALLET_PRIVATE_KEY not set — requests will reach the Engine but stop at the 402 challenge.\n" +
      "            Fund the escrow once (EscrowFacet.depositUSDC) and set WALLET_PRIVATE_KEY to pay automatically."
    );
  }
  return async (base, args) => {
    const fetchImpl = signer
      ? async (url, init) => {
          const { res } = await fetchWithEscrow(fetch, signer, url, init);
          return res; // carries settlementReceipt when the node returned one
        }
      : fetch;
    return ask(base, args, fetchImpl);
  };
}

/**
 * Turn five purchases into a decision. Deterministic and explainable:
 * every line of the verdict points at a receipt.
 */
function assess(token, receipts, failures, { totalUsd, wallMs, caps, mode }) {
  const byIntent = Object.fromEntries(receipts.map((r) => [r.intent, r]));

  const audit = byIntent.SMART_CONTRACT_AUDIT?.result ?? {};
  const onchain = byIntent.ONCHAIN_METRIC_VERIFY?.result ?? {};
  const sanctions = byIntent.SANCTIONS_SCREENING_MATCH?.result ?? {};
  const social = byIntent.SOCIAL_BOT_DETECTION?.result ?? {};
  const code = byIntent.CODE_REVIEW?.result ?? {};

  const riskScore = num(audit.risk_score);
  const botShare = num(social.bot_share_estimate);
  const authenticity = num(code.authenticity_score);
  const concentration = num(onchain.top10_concentration_pct);
  const sanctioned = sanctions.clean === false || (sanctions.matches?.length ?? 0) > 0;

  const signals = [];
  if (riskScore != null) signals.push(riskScore <= 0.35 ? ["good", `contract risk score ${riskScore} (≤ 0.35)`] : ["bad", `contract risk score ${riskScore} (> 0.35)`]);
  if (concentration != null) signals.push(concentration <= 40 ? ["good", `top-10 holders hold ${concentration}% (≤ 40%)`] : ["bad", `top-10 holders hold ${concentration}% (> 40%) — concentration risk`]);
  signals.push(sanctioned ? ["bad", "sanctions match found on deployer/treasury"] : ["good", `no sanctions matches (${sanctions.lists_checked?.join(", ") ?? "lists per miner"})`]);
  if (botShare != null) signals.push(botShare <= 0.25 ? ["good", `social bot share ${(botShare * 100).toFixed(1)}% (≤ 25%)`] : ["bad", `social bot share ${(botShare * 100).toFixed(1)}% (> 25%) — purchased following`]);
  if (authenticity != null) signals.push(authenticity >= 0.7 ? ["good", `repo authenticity ${authenticity} (≥ 0.7)`] : ["bad", `repo authenticity ${authenticity} (< 0.7)`]);
  for (const f of failures) signals.push(["warn", `${f.intent} unavailable: ${f.error.slice(0, 120)}`]);

  const hardBlock = sanctioned;
  const badCount = signals.filter((s) => s[0] === "bad").length;
  // Confidence gate: a GO on partial intelligence is overclaiming — cap at REVIEW
  // when fewer than 4 of 5 Intents answered. NO-GO (sanctions) is never upgraded.
  let verdict = hardBlock ? "NO-GO" : badCount === 0 ? "GO" : badCount === 1 ? "REVIEW" : "NO-GO";
  if (verdict === "GO" && receipts.length < INTENT_ASKS.length - 1) verdict = "REVIEW";

  return {
    token,
    verdict,
    signals,
    hardBlock,
    inputs: { audit, onchain, sanctions, social, code },
    receipts: receipts.map(minimalReceipt),
    failures,
    totalUsd: round4(totalUsd),
    wallMs,
    mode,
    caps: { maxUsdPerRun: caps.maxUsdPerRun, maxUsdPerIntent: caps.maxUsdPerIntent },
    verificationHash: verificationHash(token, receipts, failures),
    generatedAt: new Date().toISOString(),
  };
}

function minimalReceipt(r) {
  return {
    intent: r.intent,
    miner: `${r.minerName ?? "?"} (#${r.minerId ?? "?"})`,
    costUsd: round4(r.costUsd),
    durationMs: r.durationMs,
    signalHash: r.signalHash,
    mode: r.mode,
  };
}

export function verificationHash(token, receipts, failures) {
  const canonical = JSON.stringify({
    token,
    receipts: receipts.map((r) => [r.intent, r.minerId, r.costUsd, r.signalHash]).sort(),
    failures: failures.map((f) => [f.intent, f.error]).sort(),
  });
  return "0x" + createHash("sha256").update(canonical).digest("hex");
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round4 = (v) => Math.round(v * 10_000) / 10_000;
