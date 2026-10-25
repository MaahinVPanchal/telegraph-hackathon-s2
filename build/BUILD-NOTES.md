# BUILD-NOTES — what's ready, what needs you, what happens Nov 1

Built overnight 25→26 Oct 2026. Everything is tested where it can be without a wallet;
each section lists exactly what still needs a human.

```
telegraph-hackathon/
├── README.md                     the full hackathon reference (rules/prizes/missions/intents/winners)
├── data-intents.json             raw 134-Intent catalogue (extracted from the site bundle)
├── data-missions.json            raw 15 missions + 102 example builds (verbatim)
└── build/
    ├── BUILD-NOTES.md            ← you are here
    ├── miner-kit/                3 ready-to-register Miners (YAML + validate + register + smoke tests)
    ├── listings-desk/            the Mission 01 app (mock + real escrow-x402 mode, 8 passing tests)
    └── reports/                  live network recon + raw API captures
```

## ✅ What's done and verified

| Item | Status |
|---|---|
| Miner YAMLs (onchain-metric, weather-verify, fx-now) | Written to spec; **request contracts proven live** against PublicNode RPC, Open-Meteo and Frankfurter (`miner-kit/smoke/run-smoke.mjs` — all OK) |
| IDs 9601–9603 + slugs | Confirmed **free** on the live network (1,919 miners checked) |
| Registration scripts (`register.sh`, `check-intents.sh`) | Prepared; use `cast` on Base Sepolia, Diamond `0x5a23…7ff8`; **not executed** (needs your wallet) |
| Listings desk pipeline | **Working end-to-end in mock mode**: 5 parallel intent buys → receipts → risk memo with cost line + verification hash. `npm test` = 8/8 green. Web UI at `localhost:7788` |
| Real payment path | Implemented against the **live** Engine's actual 402 challenge (escrow scheme, `personal_sign` via `cast`, `X-PAYMENT` retry, settlement-proof capture). Probe without wallet fails exactly as designed, with actionable guidance |
| Network recon | **1,919 miners, all 134 Intents served, but zero priority Intent has a rank-1 miner scoring ≥ 0.9** — full opportunity table in `reports/network-snapshot-2026-10-26.md` |
| Free validator endpoint | Currently 404s (docs ahead of the deployed console) — use the UI at integrate.telegraphprotocol.com instead; noted in miner-kit README |

## 🔑 What needs YOU (morning runbook, ~30 min)

1. **Wallet setup** (~10 min)
   - Create a hot wallet for testnet (e.g. a fresh MetaMask account — never your main one).
   - Faucet **Base Sepolia ETH** (gas only; registration has no other cost).
   - Get (or bridge) a little **Base Sepolia USDC** — only needed for real-mode Engine calls.
2. **Register one Miner** (~10 min) — `miner-kit/README.md` has the exact commands:
   - Pin a YAML to IPFS → `node validate.mjs <yaml>` (or console UI) → `source .env` → `./register.sh`.
   - Recommended first: `onchain-metric-publicnode.yaml` (weakest incumbent: rank-1 at 0.364).
3. **Fund the desk escrow once** (~5 min) — `EscrowFacet.depositUSDC(1_000_000)` ($1 of testnet USDC)
   on the Diamond, then `listings-desk` runs real purchases:
   `node src/cli.mjs <token> --mode real`.
4. **Join the Discord** and say what you're building — team-forming is part of the game, and
   delivery awards reward "missions enabled" for others.

## 📅 Nov 1 — day one

- Lock track + mission: **Apps & Agents on Mission 01 (Exchange)** with the listings desk,
  **Miner** with one or two of the kit YAMLs. Both entries are legitimate (real, distinct contributions).
- Re-pull `GET /api/miners` and re-check incumbent scores (`reports/` scripts show how) —
  epoch 439 numbers will have moved.
- Register the miner(s) **on day 1, not day 20**: the 7-day grace period means earlier =
  more baseline traffic = a leaderboard score by the time the Nov 14 milestone hits.
- Nov 14 milestone: show a real listings-desk memo with real receipts (screenshot + the
  `memos/*.html` file — that satisfies "first working Telegraph request or purchase").

## ⚠️ Risks / open questions

- **Incumbent scores are low network-wide** — possibly sparse evaluation material, not just weak
  miners. Verify by watching your miner's actual epoch scores after grace period.
- The escrow signing flow is implemented from the docs + captured challenge but **hasn't run
  end-to-end with a real funded wallet** — if the node rejects the envelope, its error message
  names the field (docs are explicit about lowercase-from and fresh nonces; both handled).
- `WEATHER_FORECAST` looks almost unguarded (rank-1 at 0.001) but is "core" group, not ★ priority;
  `WEATHER_FORECAST_VERIFY` is the priority one and our YAML serves both.
- Prices on the docs' demand-multiplier table assume real demand; on testnet most Intents sit in
  the 1.0× tier. Don't model earnings yet — model *rank*, which is what routing pays on.
