# Milestone Log — 26 Oct 2026 (pre-season, all four milestones complete)

Every step below is real, on-chain or live-API verified. Tx hashes are on Base Sepolia
(sepolia.basescan.org); receipts are verifiable at `GET https://devnode.telegraphprotocol.com/engine/v1/signal/{hash}`.

## M1+M2 — Miners registered and ACTIVE

| Miner | Slug | Intent(s) | Registration | Tx | Status |
|---|---|---|---|---|---|
| OnChain Metric Verify | `onchain-metric-publicnode` (ID 9602) | `ONCHAIN_METRIC_VERIFY` | 4848 | `0x3f75bdf8…3ca2` | **ACTIVE** |
| Weather Forecast Verify | `weather-verify-openmeteo` (ID 9603) | `WEATHER_FORECAST`, `WEATHER_FORECAST_VERIFY` | 4847 | `0x7ecc1aa5…c111` | **ACTIVE** |

Network catalogue grew 1,919 → 1,921 the day we registered. Both miners are in their 7-day
grace period (started 26 Oct ~01:40 UTC): sharing 5% of routed traffic equally until scores build.

**Debug journey (kept as evidence):**
1. First registration (4845) rejected: `external_path is required` — the deployed node schema is
   stricter than the docs. Fixed all 3 YAMLs, verified against live miners' configs.
2. Second attempt (4846) rejected: `YAML hash mismatch` — **GitHub raw CDN served stale bytes**
   (~5 min cache). Fix: wait out the CDN, confirm the served hash matches the registered hash
   *before* re-submitting. Lesson recorded in the runbook.
3. Third submission (4848) → active. Total wasted gas: dust.

## M3 — Escrow funded

| Tx | What | Hash |
|---|---|---|
| 1 | `approve(Diamond, 5_000_000)` | `0xdcfa813d…05fe2` |
| 2 | `depositUSDC(5_000_000)` ($5.00) | `0x998fded3…93b7` |

USDC balance: 20.00 → 15.00 on-chain verified.

## M4 — First real machine-to-machine purchases

- Single-intent smoke buy: `CURRENCY_EXCHANGE` via FXRatesAPI (#200010), $0.01,
  settlement receipt `0x5d238598…749cd` (epoch 440, rail: escrow) — this validated the whole
  x402 escrow flow **and caught a real bug**: the node enforces a **max 2-minute** authorization
  window (our first attempt used 11 min → refused with `reason: authorization is valid for
  11m0s; the maximum is 2m0s`). Fixed to 110s in `src/x402.mjs`.
- Full desk run (5 parallel intents + sequential retry pass): **3 of 5 purchased** —
  - `SANCTIONS_SCREENING_MATCH` → OFAC SDN Entity Screen (#78021), $0.01, `0xce40d899…d77a`
  - `SOCIAL_BOT_DETECTION` → HN User (#108008), $0.01, `0xa0cc7845…3dfa`
  - `ONCHAIN_METRIC_VERIFY` → DefiLlama Token Price Context (#51010), $0.01, `0xe86f100b…81ff`
  - 2 failures were **miner-side upstream bugs** (HTTP 400/500 from routed miners' APIs) — not
    billed (per protocol), documented in the memo. Candidate for a GitHub bounty report.
- Total intelligence spend to date: ~$0.05. Memo artifacts in `listings-desk/memos/` (md/html/json).

## Artifacts for the Nov 14 milestone

The requirement — "demonstrate a first working Telegraph intelligence request or purchase" — is
already satisfied: real purchases with receipts, produced by our own app, on our own registered
miners' network. Remaining polish before Nov 14: run against real pending-listing candidates and
record cost/latency comparisons vs manual research.

## Wait — one more capability we validated

The desk's escrow payment client (`src/x402.mjs`) is a complete, working x402-escrow client:
402 → template fill → `personal_sign` via cast → `X-PAYMENT` retry → settlement-proof capture.
Reusable by any agent we build.
