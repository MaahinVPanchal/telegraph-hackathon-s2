# Telegraph Testnet — Live Network Snapshot (26 Oct 2026, ~02:45 PKT)

> Read-only recon for hackathon strategy. Sources: `GET https://devnode.telegraphprotocol.com/api/miners`
> (full catalogue, 2.9 MB), the Engine's live 402 challenge, and the hackathon data files
> (`data-intents.json`, `data-missions.json`). Raw artifacts in this folder:
> `miners-raw.json`, `per-intent-supply.json`, `intent-opportunities.json`, `engine-402-challenge.json`.

## Headline numbers

| Metric | Value |
|---|---|
| Active miners | **1,919** (all `active`; 1,846 scored in the latest epoch) |
| Distinct Intents served | **134** — every Intent in the hackathon catalogue has live supply |
| Total requests served (all time, testnet) | 41,691 |
| Miner protocols | 1,910 `generic` (YAML-wrapped APIs), 7 `bittensor`, 2 unset |
| Miners with fee address configured | 1,919 / 1,919 |
| Epoch at snapshot | 439 |
| Intents whose **rank-1 miner** scores ≥ 0.9 | **13 of 129 scored Intents** |

## The single most important finding

**The supply side is wide but shallow.** Every ★ Season II priority Intent is served, but the
incumbents are weak almost everywhere. Across all 63 priority Intents, **not a single Intent has
even one miner scoring ≥ 0.9**, and most rank-1 scores sit between 0.2 and 0.7. Since routing pays
**70% of traffic to rank #1, 20% to #2, 10% to #3**, a competent miner on the right Intent can take
the top slot — and the paid demand that comes with it — within the 7-day grace period.

Worst incumbents among high-demand priority Intents (demand = number of missions whose example
builds buy the Intent):

| Intent | Missions | Miners serving | Rank-1 score | Notes |
|---|---|---|---|---|
| `WEATHER_FORECAST` | core (feeds priority VERIFY) | 6 | **0.001** | #2 and #3 score 0. A working miner wins this instantly. |
| `LIVE_SHELF_PRICE` | 4 | 20 | 0.298 | |
| `ONCHAIN_METRIC_VERIFY` | 4 (priority 10) | 35 | **0.364** | Comparator-scored; correct RPC reads beat everyone. |
| `SATELLITE_IMAGERY_ANALYSIS` | 3 | 12 | 0.161 | |
| `SKU_IN_STOCK` | 2 | 12 | 0.198 | |
| `COMMERCE_PURCHASE_VERIFY` | 1 | 12 | 0.251 | |
| `PACKAGE_STATUS` | 2 | 12 | 0.261 | |
| `SOCIAL_BOT_DETECTION` | 4 | 12 | 0.455 | Mission 01 + 07 need this. |
| `SANCTIONS_SCREENING_MATCH` | 5 | 14 | 0.63 | Highest-demand weak Intent. |

Healthiest Intents (for reference, Apps should prefer these today): `FRAUD_DETECTION`,
`CONTENT_EXTRACTION`, `FACT_CHECK`, `WALLET_BALANCE_CHECK`, `TEXT_GENERATION` — rank-1 at 1.000.

Full table: `intent-opportunities.json` (all 63 priority Intents with demand, supply, top score,
strong/weak miner counts).

## What this means for our three tracks

1. **Miner (our best ROI):** pick a weak-incumbent priority Intent and simply be *correct*.
   Best targets with free keyless upstreams: `ONCHAIN_METRIC_VERIFY` (0.364 — build provided in
   `../miner-kit`), `WEATHER_FORECAST`/`WEATHER_FORECAST_VERIFY` (0.001 / 0.632 — build provided),
   `FX_NOW` (0.791 — build provided, but note an existing `fx-frankfurter`; differentiate).
   Deterministic comparator Intents are the easiest to win: scoring is mechanical (median of ≤3
   truth sources), so a correct wrapper with good `params` documentation should score near 1.0.
2. **Apps & Agents:** the Engine answers today — the live 402 confirms `escrow` payments work
   with one `EscrowFacet.depositUSDC` funding. Build against the *healthy* Intents now
   (`FRAUD_DETECTION`, `WALLET_BALANCE_CHECK`, `FACT_CHECK`) and the mission-specific ones for
   the scored build; the listings desk in `../listings-desk` already does.
3. **Evaluator:** with 12–35 mediocre miners per Intent, a good judgment adapter (or accurate
   truth-source contributions for the deterministic ones) has real leverage — measurement is the
   bottleneck the network actually has.

## Payment rail — verified live

`POST https://devnode.telegraphprotocol.com/engine/v1/ask` with no payment returns the real 402:

- `scheme: "exact"` on **eip155:84532** (Base Sepolia) and **solana**, `price: "$0.01"`,
  `payTo: 0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8` (the Diamond).
- `scheme: "escrow"` — sign the message template with `personal_sign` (EIP-191), send as
  `X-PAYMENT: base64(JSON)`; settle from a pre-funded escrow (`EscrowFacet.depositUSDC`).
  Full envelope captured in `engine-402-challenge.json`; implemented in `../listings-desk/src/x402.mjs`.

## Caveats

- Scores move every epoch (439 at snapshot); re-pull the catalogue before finalizing targets.
- Low incumbent scores may partly reflect sparse Evaluation Pool material on testnet, not just
  weak miners — but the routing edge (70/20/10) applies regardless of *why* scores are low.
- The hackathon site's documented public YAML validator endpoint
  (`POST integrate.telegraphprotocol.com/api/validate`) currently 404s — the developer console
  appears to have moved it behind its UI. Use the console UI for validation.
- `integrate.telegraphprotocol.com` is now branded "Telegraph · Developer Console"
  ("Monetize your APIs, write evaluation scripts, and build autonomous agents") — the
  registration flow lives there.
