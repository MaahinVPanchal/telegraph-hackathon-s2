# 🪪 IDENTITY CARD — everything we might be asked, on one page

> Open this during calls, interviews, or Discord chats. Every name, number and link below is
> verified live (27 Oct 2026). If asked something not here — the deep answer is in
> `docs/COMPLETE-WALKTHROUGH.md`, and `build/check-leaderboard.mjs` gives live rankings.

---

## 🗣️ Our names — say them like this

| What | Name (say it as) | The technical string |
|---|---|---|
| **Our app** | **"the Listings Desk"** | `listings-desk` (Mission 01 entry) |
| **Miner #1** | **"On-Chain Metric Verify — Ethplorer edition"** | name: `OnChain Metric Verify (Ethplorer Ethereum)` · slug: `onchain-metric-publicnode` · ID **9602** · registration **4856** (active; `ETH.balance` in ETH units) |
| **Miner #2** | **"Weather Forecast Verify — Open Meteo ICON"** (say: "open-MEH-teh-oh") | name: `Weather Forecast Verify (Open-Meteo ICON)` · slug: `weather-verify-openmeteo` · ID **9603** · registration **4853** (label_field: hourly — scoring-optimized) |
| **Miner #3** | **"FX Now — Frankfurter"** | name: `FX Now (Frankfurter ECB)` · slug: `fx-now-frankfurter` · ID **9601** · registration **4854** |

One-liner if asked "what do you run?":
> "Three live miners — ONCHAIN_METRIC_VERIFY (Ethereum node reads), weather forecast verification (Open-Meteo ICON), and FX_NOW (ECB rates) — plus a listings-desk app for Mission 01 that buys five Intents in parallel. 12 of 15 missions touched."

---

## 🔢 Numbers worth quoting

| Number | Value |
|---|---|
| Prize pool (Season II) | **$10,000** ($7,000 main + $3,000 December) · 29 award places |
| Cost per intelligence request | **$0.01** |
| Cost of a full listing review | **~$0.05 · 2–5 minutes end-to-end** incl. automatic retries (measured: 249 s) — vs weeks of analyst time |
| Real purchases completed | **4**, all with settlement receipts (~$0.08 spent of $5 escrow) |
| Network size when we joined | 1,919 miners → **1,921** after ours went live |
| Routing split | **70% / 20% / 10%** by rank, per Intent |
| Incumbents to beat | `ONCHAIN_METRIC_VERIFY` #1 @ 0.465 · `WEATHER_FORECAST` #1 @ 0.0005 (wide open!) · `WEATHER_FORECAST_VERIFY` #1 @ 0.641 |
| Grace period | 7 days (registered 26 Oct → placement ~Nov 2–3, rank routing ~Nov 7) |
| Season window | **1 Nov – 1 Dec 2026** · deadline 23:59 UTC · judging Dec 2–8 · results Dec 9 + 72h appeals |
| MACHINA token | 21,000,000 max supply, halving every 4 years, **zero pre-mine** |
| Fee split | **2%** treasury · **98%** → TWAP → MACHINA to miner's fee address |
| Mainnet target | **January 2027** — "mainnet is the deadline": we build on the shipping contracts |

---

## 🔗 Links to paste (all public)

| What | Link |
|---|---|
| Our wallet on Base Sepolia (7 txs) | https://sepolia.basescan.org/address/0x5549286a1C71893816899BbEF8F4CE4d91f87821 |
| Live network catalogue (Ctrl+F our slugs) | https://devnode.telegraphprotocol.com/api/miners |
| Current miner registrations | https://devnode.telegraphprotocol.com/api/miners/4856 · weather: `…/4853` |
| Explorer — miners / intents | https://explorer.telegraphprotocol.com/miners · `/intents` |
| Leaderboard script | `node build/check-leaderboard.mjs` |
| Miner YAMLs (public repo) | https://github.com/MaahinVPanchal/telegraph-miner-yaml |
| Main repo (private until submission) | https://github.com/MaahinVPanchal/telegraph-hackathon-s2 |
| Signal lookup (verify any purchase) | https://devnode.telegraphprotocol.com/engine/v1/signal/{signal_hash} |
| Demo video script | `build/pitch/DEMO-SCRIPT.md` · Overview: `build/pitch/OVERVIEW.md` |

---

## 🧾 Key hashes (proofs)

| What | Hash |
|---|---|
| Wallet (also our fee address) | `0x5549286a1C71893816899BbEF8F4CE4d91f87821` |
| Diamond contract (Base Sepolia) | `0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8` |
| Latest miner registrations | onchain 4856 active (update tx hash not captured) · weather 4853 tx `0x7ecc1aa5…c111` |
| Escrow funding | approve `0xdcfa813d…05fe2` · deposit $5 `0x998fded3…93b7` |
| YAML commitment (onchain) | `0xd84094733f0f27aa0bc1dc7f086c41b6466f427c5b9a842e99c536947348c6bc` (SHA-256, byte-verified vs GitHub raw) |
| Purchase receipts | sanctions `0xce40d899…d77a` · social-bot `0xa0cc7845…3dfa` · onchain-metric `0xe86f100b…81ff` · FX `0x0148e11d…5e0` |
| Settlement proof | `0x5d238598…49cd` (rail: escrow, epoch 440) |

---

## 🗣️ Quick answers to likely questions

**"Which network?"** — Base Sepolia, chain 84532. Testnet now; mainnet January 2027 on the same contracts.

**"How do miners get paid?"** — Agent pays USDC → 2% treasury → 98% drips through Uniswap over 24h → miner receives MACHINA at their registered fee address. Miners earn from demand only — zero emissions.

**"What did it cost you?"** — Registration is free (gas dust only, no bond). We've spent ~$0.08 of testnet USDC total, including four real purchases with receipts.

**"What happens if your miner answers badly?"** — Score drops → less routed traffic (70/20/10 by rank). Fail liveness spot checks ~every 20 seconds → revoked from routing until the next epoch re-scores you. Our upstreams are PublicNode and Open-Meteo — high uptime.

**"Why these two Intents?"** — Live recon showed no priority Intent has a rank-1 miner scoring ≥ 0.9, and ours target the weakest incumbents with the most mission demand. `ONCHAIN_METRIC_VERIFY` is comparator-scored (mechanical), `WEATHER_FORECAST`'s #1 scores 0.0005 — wide open.

**"Team?"** — Solo builder (me) + AI pair-engineering. Everything documented: research, strategy, code, evidence.

**"What are those 0xc3e35965 rows on basescan?"** — our `updateMiner` transactions (basescan has not labeled that selector yet). The 20 USDC "IN" is the Circle faucet drop; the 5 USDC "OUT" is our escrow deposit. All intentional.

**"What's after the hackathon?"** — December challenges ($3,000 reserved), then mainnet January 2027. Our miners keep earning from routed demand either way.
