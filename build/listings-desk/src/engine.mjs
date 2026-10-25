// Telegraph Engine client.
//
//  - ask(): one paid intelligence request. Real mode implements the x402 flow
//    (first call → 402 Payment Required with payment instructions → pay → retry).
//    Mock mode simulates the whole thing offline so the pipeline is runnable
//    without a wallet.
//
// Docs: docs.telegraphprotocol.com/docs/using/engine-ask and /docs/using/x402-inference

import { createHash } from "node:crypto";

export class PaymentRequiredError extends Error {
  constructor(challenge) {
    super(`402 Payment Required: ${JSON.stringify(challenge).slice(0, 400)}`);
    this.name = "PaymentRequiredError";
    this.challenge = challenge;
  }
}

/**
 * Ask the Engine one question. Returns a receipt + the miner's raw answer.
 * fetchImpl is injectable for tests.
 */
export async function ask(engineBase, { query, context, intent, maxUsd }, fetchImpl = fetch) {
  const started = Date.now();
  const res = await fetchImpl(`${engineBase.replace(/\/$/, "")}/v1/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, ...(context ? { context } : {}) }),
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 402) {
    const challenge = await res.json().catch(() => ({}));
    throw new PaymentRequiredError(challenge);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Engine HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const cost = Number(data.cost_usd ?? 0);
  if (cost > maxUsd) {
    throw new Error(
      `spending cap breach: intent ${intent} cost $${cost.toFixed(4)} > cap $${maxUsd.toFixed(4)} — aborting run`
    );
  }

  const receipt = receiptFrom({ intent, data, cost, durationMs: Date.now() - started, mode: "real" });
  // settlement proof arrives on the X-PAYMENT-RESPONSE header (attached by fetchWithEscrow)
  if (res.settlementReceipt) receipt.settlement = res.settlementReceipt;
  return receipt;
}

function receiptFrom({ intent, data, cost, durationMs, mode, mock }) {
  return {
    intent,
    mode,
    minerId: data.miner_id ?? mock?.minerId ?? null,
    minerName: data.miner_name ?? mock?.minerName ?? null,
    costUsd: cost,
    durationMs: mock?.durationMs ?? durationMs,
    signalHash: data.signal_hash ?? mock?.signalHash ?? null,
    reasoning: data.reasoning ?? mock?.reasoning ?? null,
    result: data.result ?? data,
    timestamp: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* MOCK MODE — deterministic, offline, clearly labelled.               */
/* ------------------------------------------------------------------ */

export function makeMockAsk({ seed = "telegraph-demo" } = {}) {
  let callCounter = 0; // per-desk-instance, so the same token replays identically
  const seedNum = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

  // Per-intent canned answers shaped like real miner outputs.
  const answerFor = (intent, token) => {
    const jitter = ((seedNum + callCounter++) % 7) / 100; // small, deterministic variation
    switch (intent) {
      case "SMART_CONTRACT_AUDIT":
        return {
          minerName: "audit-sim",
          reasoning: "Simulated SMART_CONTRACT_AUDIT miner — mock mode, nothing was purchased.",
          result: {
            bytecode_verified: true,
            owner_mint: false,
            blacklist_function: false,
            honeypot_signals: [],
            risk_score: +(0.18 + jitter).toFixed(3),
            findings: [
              "Source verified on Etherscan-class explorer",
              "No owner mint; fixed supply constructor",
              "No blacklist or fee-on-transfer switch",
            ],
          },
        };
      case "ONCHAIN_METRIC_VERIFY":
        return {
          minerName: "onchain-sim",
          reasoning: "Simulated ONCHAIN_METRIC_VERIFY miner — mock mode.",
          result: {
            holders: 4_812,
            top10_concentration_pct: +(22.4 + jitter * 100).toFixed(1),
            liquidity_usd: 1_842_000,
            contract_age_days: 411,
          },
        };
      case "SANCTIONS_SCREENING_MATCH":
        return {
          minerName: "sanctions-sim",
          reasoning: "Simulated SANCTIONS_SCREENING_MATCH miner — mock mode.",
          result: {
            lists_checked: ["OFAC_SDN", "UK_HMT", "EU Consolidated"],
            matches: [],
            clean: true,
          },
        };
      case "SOCIAL_BOT_DETECTION":
        return {
          minerName: "social-sim",
          reasoning: "Simulated SOCIAL_BOT_DETECTION miner — mock mode.",
          result: { bot_share_estimate: +(0.11 + jitter).toFixed(3), signals: ["follower growth curve", "account age entropy", "engagement ratio"] },
        };
      case "CODE_REVIEW":
        return {
          minerName: "code-sim",
          reasoning: "Simulated CODE_REVIEW miner — mock mode.",
          result: {
            authenticity_score: +(0.86 - jitter).toFixed(3),
            findings: ["3 contributors with 2+ years history", "commit cadence organic", "not a fork of a known token template"],
          },
        };
      default:
        return { result: { note: "unknown intent" } };
    }
  };

  return async function mockAsk(engineBase, { intent, token }) {
    await new Promise((r) => setTimeout(r, 60)); // simulate network latency
    callCounter++;
    const a = answerFor(intent, token);
    const signalHash =
      "0x" + createHash("sha256").update(`${intent}:${token}:${callCounter}`).digest("hex");
    return {
      intent,
      mode: "mock",
      minerId: String(9000 + (callCounter % 100)),
      minerName: a.minerName,
      costUsd: 0.01, // mock price — matches the $0.01 testnet floor
      durationMs: 60 + ((callCounter * 17) % 240),
      signalHash: signalHash.slice(0, 18) + "…" + signalHash.slice(-4),
      reasoning: a.reasoning,
      result: a.result,
      timestamp: new Date().toISOString(),
    };
  };
}

