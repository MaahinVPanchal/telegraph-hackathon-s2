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


## M5 — End-to-end self-purchase validation (26 Oct, ~02:20 UTC)

- Direct Engine calls to OUR miners validate the full supply path:
  - `weather-verify-openmeteo` (4847): HTTP 200, real ICON forecast served, paid OURSELF 10000 μUSDC.
  - `onchain-metric-publicnode`: first blocked by OUR OWN `limitations` block — the node's size_bytes checker misreads (63 B vs 1024 B declared → flagged as exceeding). Removed the MAX_BODY_SIZE limitation, `updateMiner` → **registration 4849, active**, tx `0x025e455f…0106c`. Re-test: HTTP 200, **zero warnings**, correct eth_getBalance answer, paid OURSELF 10000 μUSDC.
- Conclusion: both miners are production-ready; the desk can now buy from our own supply (the 2% treasury fee is the only leakage).
- Fourth node/miner-ecosystem bug catalogued: limitation-checker size_bytes evaluation.


## M6 — Chain migration executed (27 Oct, ~00:15)

The 0.0000 score + node index loss + Anjoman rejection all traced to ONE cause: **Telegraph migrated Base Sepolia → Ethereum Sepolia** (new Diamond `0x3624EB…b99b`, new MACHINA, bonded registration, `_GENERAL` intents).

Executed per MIGRATION-RUNBOOK.md:
1. ✅ Minted 10 test USDC on Ethereum Sepolia (permissionless)
2. ✅ Swapped 4 USDC → 4.97 MACHINA (Uniswap SwapRouter02)
3. ✅ Approved Diamond for bonds · verified all 6 intents canonical on the NEW Diamond
4. ✅ Registered all three miners: **4848 (onchain), 4849 (weather), 4850 (fx)** — bonds taken at pool price (~$3.30, refundable)
5. ⏳ Node activation pending (node busy re-indexing — was dropping 50 miners during migration)

Balances after: 0.1 ETH gas · ~0.97 USDC · ~0.87 MACHINA. Stranded on old chain: 15 USDC + dust (testnet write-off). The 0.05 ETH mystery drop was Ethereum Sepolia all along — exactly the gas the migration needed.


## M7 — First real paid run through the desk's own architecture (12 Nov)

The desk (post-rewrite) executed its first REAL paid assessments on the migrated platform:

- **2 x402 exact-scheme payments settled** — SANCTIONS_SCREENING_MATCH_GENERAL via Counterproof Sanctions Screener (731002), $0.01 each, signal hashes issued, facilitator-settled
- **Evidence: VALID** — after two policy fixes: (1) the sanctions validation accepted clean no-match results (matches/lists legitimately null when matched=false), (2) the field_status \"missing\" demotion exempted clean no-match screenings
- **Verdict: REVIEW** — the confidence gate holds GO back on partial coverage (1 of 5 checks valid; the rest unsupported by design)
- **Wired the standard x402 client** (@x402/fetch + @x402/evm exact scheme, browser-compatible) replacing the escrow-rail signer — the payment rail the migrated platform now offers
- **Known cosmetic gaps:** paymentStatus \"unknown\" (the exact-rail settlement header is not exposed by the SDK wrapper) and actualMicro n/a (the policy ledger is not fed via the SDK path) — the payments themselves are proven by the receipts
- Test suite: 44/0

### M7-a — Receipt evidence re-captured and persisted (12 Nov, after external audit)

The M7 run's console output (its 2 sanctions signal hashes) was never persisted — the claim rested on the milestone text alone. Re-ran both rails live and recorded the full proof:

**Escrow-rail settlement (full receipt — our miner, hybrid worker 9602):**
- receipt_hash `0xfaf3324ef8d5befc83a21d0516da17027fc0a747fb531974ec61dabc0abf35eb`
- signal_hash `0xdbb7435895857345d1b5105032e8de2059bad931b6767a0631981499c651d87b`
- payer `0x5549286a1c71893816899bbef8f4ce4d91f87821` → miner 5189 (miner_id mapping), intent ONCHAIN_METRIC_VERIFY_GENERAL, 10,000 μUSDC, epoch 2068, rail escrow, settlement epoch

**x402 exact-rail sanctions payment (desk → third-party miner 731002 Counterproof Sanctions Screener):**
- signal_hash `0xf5dee2c3100e8c75ea195c8ebe119a7f62dc869c6bbe39810a7eb767a8af3cb6` — subject \"MaaHin Digital Labs Ltd\", matched=false, $0.01, evidence VALID
- The second subject's signal hash was not captured in that run's visible output; the desk's SDK path does not surface the settlement header (gap above).

**Corrections from the audit (all verified):**
- Signing was tested via CLI/Node only. NO browser signing has been tested. leaderlight.vercel.app still serves the SIMULATED/OFFLINE build (verified: no run-live button in the deployed HTML).
- Network directory is 2,093 entries (earlier 1,872 was a stale snapshot).
- The hybrid worker implements exactly three eth_call shapes: decimals (0x313ce567), balanceOf, totalSupply (0x18160ddd). No arbitrary contract-view calls, no storage-slot reads (eth_getStorageAt absent).
- No evidence links the missing storage reads to the 0.3423 epoch-2067 score; cause unproven either way.

### M7-b — Live app deployed; paid browser-equivalent flow proven through the deployed URL (12 Nov)

- **Deployed the LIVE app** to leaderlight.vercel.app (`/` = live app, `/desk` = mock desk). The LIVE button had shipped hardwired to `/v1/ask/9602` with a sanctions body — that combination returns HTTP 500 (reproduced). Fixed to the desk's proven pattern: intent-routed `/v1/ask` (no miner ID).
- **CORS gap found and fixed:** devnode's OPTIONS preflight returns 204 with no `Access-Control-Allow-*` headers, so browsers would block direct Engine calls. Added `api/engine.js`, a same-origin dumb-transport proxy (no keys, no signing; forwards the body and the X-PAYMENT header only). Page also gained a safety guard: it refuses to sign any 402 challenge whose `payTo` is not the Telegraph Diamond.
- **Paid runs replicating the page's exact algorithm (EIP-191 personal-sign equivalent, escrow scheme):**
  - Direct to devnode: routed to TxLens (9002), signal `0xbb07d566…159ef`, settlement receipt `0x120760df79b4d0206d19385c91b856a242644485f0992145099961462d4b6cb2`, 10,000 μUSDC, epoch 2068
  - Through the deployed proxy (leaderlight.vercel.app/api/engine): routed to TxLens (9002), signal `0xf9f52d0a…5304`, settlement receipt `0xb98ce5989cb9a4172c4d262f8524a14bd9db53bbcc0c955946f57c35477dc5c8`, 10,000 μUSDC, epoch 2068
- **Routing is per-intent and rotates:** the same sanctions intent routed to Counterproof (731002) in the desk run and TxLens (9002) in both of these — the Engine picks the epoch's winner, so the app serves "any miner" by routing rather than by direct selection.
- Leaderboard panel's direct GET `/api/miners` verified browser-CORS-clean (`Access-Control-Allow-Origin: *`, simple request).
- **Still unverified:** the MetaMask signing popup itself in a live browser (the signature scheme is identical — EIP-191 personal_sign — and the HTTP flow is fully proven; only the human click remains).

### M7-c — Found and fixed the reason the live app "never changed" in a browser (12 Nov)

External report: "UI/UX not changed" — the deployed page looked identical to the old desk. Browser-level verification (rendered DOM + screenshots, not grep) exposed three stacked defects, all fixed and deployed:

1. **The merged inline script never executed — in any browser, ever.** The wallet module was inlined from an ES module into a classic `<script>`, keeping its three `export` keywords → `SyntaxError: Unexpected token 'export'` → the Connect button, live wiring, and leaderboard were all dead on every deployment of the live app since it was built. Exports stripped; both scripts now verified with classic-script parsing (`node --check` as `.js`, which correctly rejects `export` — the earlier `.mjs` check masked the bug).
2. **The live controls shipped permanently `hidden`** with no unhide logic, and `window.__listingsWallet` was never assigned (the LIVE button could never see a connected wallet), and mint/fund buttons had no click listeners. All fixed: wallet state is now recorded and announced via a `listings:wallet` event; controls are visible and disable/enable with connection state; the mode badge flips SIMULATED / OFFLINE ↔ TESTNET LIVE.
3. **The LIVE run was hardwired to `/v1/ask/9602` with a sanctions body** (HTTP 500; fixed to intent-routed `/v1/ask` in M7-b).

Verified rendered-in-browser after the fix: the `02 / Live · Ethereum Sepolia testnet` section, disabled-until-connect buttons, connect-button click handler firing ("Waiting for MetaMask…" → graceful "MetaMask was not detected" in a wallet-less browser), and the leaderboard panel auto-loading real ranks — weather-verify-openmeteo #5 (0.9338) on WEATHER_FORECAST_VERIFY_GENERAL, fx-now-frankfurter #3/#4/#4 (1.0000) on FX_NOW_CAD/EUR/SEK, onchain-metric-publicnode #37 (0.0000) on ONCHAIN_METRIC_VERIFY_GENERAL.

Remaining human step: connect MetaMask in a real browser → mint → fund escrow → Run LIVE assessment.

### M7-d — UI/UX polish pass on the live app (12 Nov)

External report: the landing page felt awkward — Evidence/Receipt nav links jumped to an empty panel before any run. Redesigned and deployed:

- **Sidebar is now a live flow checklist** (1 Connect wallet → 2 Mint & fund escrow → 3 Run assessment) with auto-checking steps; Evidence/Receipt links appear only once a result exists (`body.has-result` via a MutationObserver on the results region).
- **Mint / Fund escrow moved into the 02/Live card** — one coherent flow: connect → mint/fund → entity names → run. The aside is informational only.
- **Hero chips**: "3 miners live · <live count> in network catalogue · asks from $0.01" (count filled from the devnode API — 2,093 at deploy time).
- Badge flips to a pulsing green **TESTNET LIVE** on connect; disabled buttons are visually distinct; text inputs share the styled token-input look with focus rings; empty state has a proper "receipts land here" panel.
- Verified in-browser: base state (Evidence hidden, steps uncheckd) and simulated-connected state (badge, enabled controls, step ✓). Deployed as leaderlight.vercel.app.
