# 🚀 Telegraph Hackathon S2 — Mission Control

## LeaderLight quick start

LeaderLight helps reviewers assess a token listing, inspect the evidence behind the recommendation, and review payment outcomes for Telegraph intelligence requests.

- [Open LeaderLight](https://leaderlight.vercel.app/) and select the simulated mode for a wallet-free walkthrough. Live requests use MetaMask and Ethereum Sepolia.
- [Read the app setup and payment evidence](build/listings-desk/README.md) for local commands, miner rank history, and receipt details.
- [Browse the miner configurations](build/miner-kit/) for on-chain metrics, weather, and FX.

**🟢 3 miners live on testnet · 🟢 real purchases with on-chain receipts · 🟢 escrow funded ($5) · 🟡 grace period until ~Nov 2 · 📅 season opens Nov 1**

> **Deep-dive companion:** `docs/COMPLETE-WALKTHROUGH.md` — the full beginner-to-hackathon documentation (concepts, every command, failure post-mortems, tx tracing, rubric mapping, repo policy).
>
> **What this file is:** every detail of the **Telegraph Hackathon Season II** (runs **1 Nov – 1 Dec 2026**), collected on **25 Oct 2026** from the official announcement (X/Discord, 10/22/26) and every page of `hackathon.telegraphprotocol.com`, the protocol site, and `docs.telegraphprotocol.com`. **Search this file instead of visiting the sites** — and re-verify anything critical via [All links](#all-links).
>
> Raw data next to this file: `data-intents.json` (134-Intent catalogue, every field) · `data-missions.json` (15 missions, all 102 example builds, verbatim).

### 🧭 Find your way

| You want… | Jump to |
|---|---|
| The 60-second brief | ⚡ [TL;DR](#tldr--the-60-second-version) |
| How we got here — the full story | 🧭 [The Journey](#-the-journey--from-zero-to-live-in-five-chapters) |
| What "Miner" and "EVM wallet" even mean | 💡 [Explained](#-why-this-miner-and-evm-wallet-what-is-this--explained) |
| Rules, prizes, judging, submissions | 📜 [The event in full](#-the-event-in-full) |
| Strategy per track | 🎯 [How to win each track](#-how-to-actually-win-each-track-practical-notes-from-the-docs) |
| Season I winners | 🏆 [Recap](#-season-i-recap--what-already-happened-and-the-winners) |
| Ready-for-Nov-1 checklist | ✅ [Checklist](#-what-to-do-now-before-nov-1--readiness-checklist) |
| Every link worth having | 🔗 [All links](#all-links) |
| Pitch kit: overview, video script, Discord + LinkedIn posts | 🎬 [build/pitch/](build/pitch/OVERVIEW.md) |
| **Identity card — names, numbers, hashes, Q&A crib** | 🪪 [IDENTITY-CARD.md](IDENTITY-CARD.md) |
| All 15 mission briefs + 102 builds | 🎯 [Missions](#the-15-commercial-missions-full-detail) |
| All 134 Intents | 📇 [Intent catalogue](#appendix-the-shared-intent-catalogue-all-134-intents) |

---

## 🚨 READ FIRST — Telegraph migrated chains (27 Oct)

**Base Sepolia → Ethereum Sepolia.** New Diamond (`0x3624EB…b99b`), new MACHINA, bonded registrations ($1 first intent, returned on deregister), `_GENERAL` intent names + per-currency FX (`FX_NOW_EUR`). Our Base Sepolia registrations and $5 escrow are stranded on the old chain (testnet write-off). **Full runbook: [MIGRATION-RUNBOOK.md](MIGRATION-RUNBOOK.md)** — mint test USDC → swap for MACHINA → re-register the three miners on the new chain. Our 0.05 ETH on Ethereum Sepolia (the mystery faucet drop) is exactly the gas we need.

---

## ⚡ TL;DR — the 60-second version

| | |
|---|---|
| **Event** | Telegraph Hackathon **Season II** (H2) — fully online |
| **Runs** | **1 November → 1 December 2026** (30 days). Deadline **1 Dec, 23:59 UTC** |
| **Prize pool** | **$10,000 USD** for Season II ($7,000 main competition + $3,000 reserved for December challenges) |
| **"Across both seasons"** | Season I (Aug–Sep 2026) had $5,000 — hence the "$15,000 across both seasons" line in the announcement |
| **Tracks (3)** | ① **Miners/Providers** (supply intelligence) ② **Evaluators** (measure it) ③ **Apps & Agents** (build products that buy it) |
| **Missions** | **15 commercial missions** (industries) — only the Apps & Agents track picks one; Miners & Evaluators compete per **Intent** |
| **Award places** | **29 total**: 8 delivery + 3 excellence (Apps), 4 + 2 (Miners), 4 + 2 (Evaluators), 4 + 2 (December) |
| **Win condition** | Score **≥ 70/100** + technical pass. You do **not** need 1st place — 8 delivery awards go to verified working deliveries |
| **Key dates** | Nov 14 = **First Integration Milestone** (show a first working Telegraph request — progress check, **not** disqualification); Nov 20 community showcase; Dec 2–8 judging; Dec 9 provisional results + 72h appeal window |
| **Registration** | One free registration covers all three tracks — **already done for us** ✅ |
| **What "Miner" and "EVM wallet" mean** | See the next section — a Miner = anyone wrapping an API/model as an intelligence provider; the EVM wallet = where your **MACHINA** token payouts are sent |

---

## 🧭 The Journey — from zero to live in five chapters

> A chronological record of the whole build-up, so any step can be reproduced or revisited. Public identifiers only — the wallet's private key lives solely in the local `build/miner-kit/.env` (git-ignored, never committed).

### 📚 Ch.0 — Research & reference *(25 Oct, evening)*
- Collected every page of `hackathon.telegraphprotocol.com` (rules, missions, tracks, timeline, why, how-it-works, build, S1 archive) plus the protocol site and full docs (miners, scoring, x402/escrow, tokenomics).
- The missions and intents pages are JS-rendered, so the data was extracted from the site's own Next.js webpack bundles → `data-intents.json` (134 Intents), `data-missions.json` (15 missions, 102 example builds) — the catalogue in this README's appendix comes from that.
- Wrote this README as the single searchable reference.

### 🔭 Ch.1 — Recon & strategy *(overnight 25→26 Oct)*
- Pulled the **live miner catalogue** (`GET devnode.telegraphprotocol.com/api/miners`, 1,919 active miners, epoch 439).
- Key finding: **all 134 Intents have supply, but no priority Intent has a rank-1 miner scoring ≥ 0.9** — routing pays 70/20/10 by rank, so weak incumbents are beatable.
- Targets chosen (free, keyless upstreams): `ONCHAIN_METRIC_VERIFY` (#1 scores **0.364**), `WEATHER_FORECAST` (#1 scores **0.001**), `FX_NOW` (#1 scores 0.791, crowded).
- Built and tested **`build/miner-kit/`** (3 registerable YAML miners + smoke tests, all passing live) and **`build/listings-desk/`** (Mission 01 app: 5 parallel paid intents → receipts → risk memo with cost line; mock mode working, real mode implemented against the Engine's live 402 escrow challenge; 8/8 unit tests).
- Created **private** repo [`MaahinVPanchal/telegraph-hackathon-s2`](https://github.com/MaahinVPanchal/telegraph-hackathon-s2) and pushed everything (private until submission — it holds the strategy research).

### 👛 Ch.2 — Wallet & faucets *(user, guided)*
- Created a **fresh MetaMask wallet** (`0x5549286a1C71893816899BbEF8F4CE4d91f87821`) — testnet-only, zero mainnet exposure.
- Added **Base Sepolia** as a custom network (chain ID **84532**, RPC `https://sepolia.base.org`, explorer `sepolia.basescan.org`).
- Faucet lessons learned the hard way:
  - **QuickNode faucet blocked us** — it requires a small *mainnet* ETH balance as an anti-abuse check. Fresh wallets don't have one. Same class of gate on Alchemy's faucet. **Skipped both.**
  - **USDC** came from the [Circle faucet](https://faucet.circle.com) (GitHub sign-in → Base Sepolia → 20 USDC ✅) — this is the faucet Telegraph's own docs recommend. **Watch its Network dropdown — it defaults to Arc Testnet** (a stray ~1 USDC still sits on Arc from that; harmless, wrong chain).
  - **ETH** came from the [Coinbase Developer Platform faucet](https://portal.cdp.coinbase.com/products/faucet) (free account → Base Sepolia → 0.0001 ETH ✅, no mainnet-balance gate). A bonus **0.05 testnet ETH** also landed on *Ethereum Sepolia* (tx `0xa4a2554c…ca810`, traced and harmless — see `build/trace-tx.mjs`).
- Pitfalls hit and solved along the way: USDC is **invisible in MetaMask** until you *Import tokens* with contract `0x036CbD53842c5426634e7929541eC2318f3dCF7e`; balances are publicly checkable by address (`eth_call balanceOf` — no keys involved), which is what `build/check-wallet.mjs` does.

### 🛠️ Ch.3 — Local environment
- Installed **Foundry** (`curl -L https://foundry.paradigm.xyz | bash`, then `foundryup`) → `cast` 1.8.6 for signing/transactions.
- Created `build/miner-kit/.env` (`MINER_PRIVATE_KEY`, `FEE_ADDRESS`, `RPC_URL=https://base-sepolia-rpc.publicnode.com`). Two pitfalls fixed: Notepad saved it as **`.env.txt`** (renamed), and MetaMask exports keys **without the `0x` prefix** (added).
- Verified without printing the key: `cast wallet address` derives **exactly** `0x5549…7821` ✅, and the RPC answers with chain `0x14a34` (84532) ✅.
- Verified on-chain that all four target Intents are **canonical** (`isCanonicalIntent` = true), so registration can't revert on intent grounds.

### 🌐 Ch.4 — Hosting & registration *(26 Oct — a three-act saga)*
- The main repo is private, so GitHub can't serve YAMLs from it (raw URLs 404). Created a **separate public repo** [`MaahinVPanchal/telegraph-miner-yaml`](https://github.com/MaahinVPanchal/telegraph-miner-yaml) holding only the three YAMLs — they're public by design anyway (every registered miner's YAML is publicly readable).
- **Act 1:** first `registerMiner` rejected — `external_path is required` (the deployed node schema is stricter than the docs). Fixed all YAMLs, cross-checked against live miners' configs.
- **Act 2:** second attempt rejected — `YAML hash mismatch`: **GitHub raw's CDN served stale bytes for ~5 min after the push**. New rule: fetch the URL, hash what it *serves*, only submit when it matches.
- **Act 3:** ✅ both miners **ACTIVE** — network catalogue grew **1,919 → 1,921** the day we registered.

### ✅ Ch.5 — Validation: buying from ourselves *(26 Oct)*
- **M3 escrow:** `approve` + `depositUSDC(5_000_000)` confirmed on-chain (USDC 20.00 → 15.00) — txs `0xdcfa813d…05fe2`, `0x998fded3…93b7`.
- **M4 purchases:** first a single-intent smoke buy (`CURRENCY_EXCHANGE` via FXRatesAPI, settlement receipt `0x5d238598…49cd`) — which caught a real protocol quirk: **the escrow authorization window is capped at 2 minutes** (server: *"authorization is valid for 11m0s; the maximum is 2m0s"*). Our client now signs 110-second windows. Then the full desk run: **3 of 5 Intents purchased** (OFAC sanctions screen, social-bot detection, DefiLlama on-chain metrics — receipts in the memo), 2 failures were *other miners'* upstream bugs (not billed — documented, bounty material).
- **M5 self-purchase loop:** direct Engine calls to **our own miners** — weather served a real ICON forecast; onchain initially blocked by our own `limitations` block (the node's size checker misread 63 B vs 1024 B — removed, re-registered as **4849**, active) — then **clean 200 answers, zero warnings, and the Engine paid OUR registration 10,000 μUSDC**. The full supply→demand loop now runs inside our own project, leaking only the 2% treasury fee.
- 💰 Total intelligence spend to date: **~$0.08** of the $5 escrow. 📜 Full evidence log: `build/milestones/MILESTONES-2026-10-26.md`.

### 📊 Status board

| System | State |
|---|---|
| 🪨 Miner `onchain-metric-publicnode` (ID 9602) | 🟢 **ACTIVE** — registration 4856 (Ethplorer, ETH-unit `ETH.balance`), serves `ONCHAIN_METRIC_VERIFY` (missions 01, 02, 05, 07) |
| 🌤️ Miner `weather-verify-openmeteo` (ID 9603) | 🟢 **ACTIVE** — registration 4853, serves `WEATHER_FORECAST` + `_VERIFY` (missions 05, 06, 13, 14) |
| 💵 Escrow | 🟢 $5.00 funded · ~$4.92 remaining after test purchases |
| 🖥️ Listings desk (Mission 01) | 🟢 working — mock + real modes, 8/8 tests, retry pass, real receipts |
| 📈 Leaderboard | 🟡 grace period — first placement expected **~Nov 2–3** |
| 🧾 Nov 14 milestone | ✅ already satisfied (real purchases with receipts) |

### 🗓️ What's next

| When | What |
|---|---|
| **Now → Nov 2** | Grace period accumulates; spot checks every ~20s (our upstreams are reliable) |
| **~Nov 2–3** | First leaderboard placement — compare vs verifywire (0.465) and wxfv-om-aq (0.632) |
| **Nov 1** | Season opens — lock formal entries, run the desk against real listing candidates, start Mission 01 build #2 |
| **~Nov 7** | Grace period ends → 70/20/10 rank-based routing begins |
| **Dec 1, 23:59 UTC** | Submission — flip the main repo **public** |

---

## 🏃 November game plan — week by week (nothing is "just waiting")

The grace period is only the miners' *ranking mechanic* — November itself is the 30-day build season. Here is the full schedule:

### Week 1 (Nov 1–7): lock in + first sprint

> 🔗 **Check here:** entries → [hackathon.telegraphprotocol.com](https://hackathon.telegraphprotocol.com/) · leaderboard → [Explorer /leaderboard](https://explorer.telegraphprotocol.com/leaderboard) or `node build/check-leaderboard.mjs` · community → [Discord](https://discord.gg/telegraphprotocol)

| What | Why |
|---|---|
| **Formal entries on the site** — lock Apps & Agents (Mission 01) + Miner track | Formal registration of what we're competing for |
| **Run the desk against 2–3 real pending-listing candidates** | Memo artifacts become "tested on real cases", not just a demo token |
| **Start Mission 01 build #2** — "surveillance that only bills when it finds something" (`WASH_TRADING_DETECTION` + `LIQUIDITY_DEPTH_VERIFY`) | Two completed missions = the multi-mission delivery-award path (8 Apps awards!) |
| **Discord daily-ish**: answer builder questions, reply to founder posts | "Real adoption & retention" is **15 rubric points** — it comes from people actually using our stuff |
| **~Nov 2–3:** pull the first leaderboard placement (`node build/check-leaderboard.mjs`) | See where the miners landed vs verifywire's 0.465 |
| **~Nov 7:** grace ends → 70/20/10 rank routing begins | If our score beats 0.465, we take rank 1 = 70% of that Intent's traffic |

### Week 2 (Nov 8–14): ship build #2 + milestone showcase

> 🔗 **Check here:** milestone rules → [rules page](https://hackathon.telegraphprotocol.com/rules) · memo artifact → [`build/milestones/real-run-memos/`](build/milestones/real-run-memos/) · showcase → Discord **#showcase**

- Finish build #2 (simpler than the desk — continuous monitoring + a billing-when-alerting twist)
- **Nov 14:** First Integration Milestone — show a working Telegraph request (artifact ✅ already exists; now show both builds)
- **Nov 20:** community showcase — demo both builds publicly

### Week 3 (Nov 15–22): adoption push

> 🔗 **Check here:** share your miners → [explorer miner pages](https://explorer.telegraphprotocol.com/miners) · [live catalogue](https://devnode.telegraphprotocol.com/api/miners) · log adoption receipts → [`build/milestones/`](build/milestones/)

- Get 1–2 other builders to actually *run* the desk or call our miners — "real independent adoption" is **15 rubric points**
- Keep every receipt of external usage — that is the adoption evidence

### Week 4 (Nov 23–Dec 1): submission sprint

> 🔗 **Check here:** submit → [hackathon.telegraphprotocol.com](https://hackathon.telegraphprotocol.com/) · video script → [`build/pitch/DEMO-SCRIPT.md`](build/pitch/DEMO-SCRIPT.md) · summary → [`build/pitch/OVERVIEW.md`](build/pitch/OVERVIEW.md) · on-chain proof → [basescan](https://sepolia.basescan.org/address/0x5549286a1C71893816899BbEF8F4CE4d91f87821)

- Record the demo video (script ready in `build/pitch/DEMO-SCRIPT.md`)
- Finalize the public summary (draft ready in `build/pitch/OVERVIEW.md`)
- **Dec 1, 23:59 UTC:** submit — flip the main repo **public**, paste links

### 🤖 Runs itself (zero action needed)

Grace-period scoring · spot checks every ~20s · epoch settlements (~every 9h) · miner earnings accumulating · MACHINA payouts to the fee address.

> **The mindset:** the miners work in the background — November is spent on the demand side, because that's where the 70/100 score and the 8 delivery awards live. Waiting is the only losing move. 🏃‍♂️💨

---

## 📈 Leaderboard — how to check & where we stand

**There is no single global board.** Every Intent has its **own** leaderboard, recomputed each epoch by the validators: rank #1 receives **70%** of that Intent's routed traffic, #2 gets 20%, #3 gets 10%. A miner's **first 7 days are the grace period** — no placement yet, but 5% of traffic is shared equally among new miners so a track record can build. That's the phase we're in (registered 26 Oct → placement expected **~Nov 2–3**).

### Three ways to check

1. **Our one-command checker** (best — shows our position highlighted against the field):
   ```bash
   node build/check-leaderboard.mjs
   ```
2. **Browser:** [explorer.telegraphprotocol.com/miners](https://explorer.telegraphprotocol.com/miners) and [explorer.telegraphprotocol.com/intents](https://explorer.telegraphprotocol.com/intents) (per-Intent rankings)
3. **Raw API:** `curl -s https://devnode.telegraphprotocol.com/api/miners` → each miner carries a `scores[]` array with `intent_id`, `epoch_id`, **`rank`**, `score`

### Epoch ~440 history (pulled 26 Oct)

**Historical snapshot only:** these standings were pulled 26 Oct around epoch 440. Our miners were active and serving (`onchain-metric-publicnode`: 2 requests, `weather-verify-openmeteo`: 1) and had no rank recorded in that snapshot.

| Intent | Top of the board | Field | Our shot |
|---|---|---|---|
| `ONCHAIN_METRIC_VERIFY` | 1. verifywire **0.465** · 2. telegraph-verity 0.361 · 3. ocm-mempool 0.309 | 36 ranked | Our RPC reads are exact — the comparator scores mechanically, so rank 1 is realistic |
| `WEATHER_FORECAST` | 1. livecert **0.0005** · 2. wxf-wttr 0.0005 · 3. txlens 0.0004 | 25 ranked | **Effectively wide open** — nobody validates well; our Open-Meteo ICON miner can take rank 1 |
| `WEATHER_FORECAST_VERIFY` | 1. wxfv-om-flood **0.641** · 2. wxfv-om-aq 0.638 · 3. wxfv-om-daily 0.636 | 19 ranked | Crowded with Open-Meteo variants, all mediocre — beatable with a tighter model pin |

> 💡 These numbers move every epoch — `node build/check-leaderboard.mjs` always reflects the live board. The scores to beat are low enough that "be correct and stay online" is a genuine winning strategy.

**Epoch 443 actuals for `ONCHAIN_METRIC_VERIFY`:** `ocm-stablecoins` 0.4124, `ocm-ethplorer-addr` 0.3967, `ocm-blockcypher-eth` 0.3729, `ocm-eth-balance` 0.3260, and `ocm-eth-balance-flashbots` 0.3260.

**Read-only recheck (27 Oct, 06:13 UTC):** the live catalogue reports registration **4856 active**, registered at 06:01:05 UTC, using the public Ethplorer YAML. The checker still shows rank 24 / 0.0000 for epoch 443, but its `scored_at` is 26 Oct 23:27 UTC, before registration 4856; there is no post-update score result yet. The prior registration 4852 had that epoch 443 result. The endpoint returns `ETH.balance` in ETH units (`5.773572485065093` for the tested address) and tolerates an extra `block_number` parameter. `ocm-ethplorer-addr` scored 0.3967 in epoch 443, evidence that the upstream/answer pattern can score but not proof that our new registration will. The live YAML SHA-256 matches the local public file. The online validator API returned 404 and the UI led to account creation; schema/answer-parser checks and historical-block semantics remain unverified. The new registration transaction hash was not captured here; no transaction was submitted by this assistant.

### 🌅 After the next epoch — self-service check (no AI needed)

Run this one command in the project folder:

```bash
node build/check-leaderboard.mjs
```

**How to read the output:**

| What you see | What it means | Do this |
|---|---|---|
| `ONCHAIN_METRIC_VERIFY · rank 1 · score > 0.435` | 🏆 **RANK 1** — we beat ocm-ethplorer; 70% of that Intent's traffic is ours | Screenshot → Discord + tell the AI next session |
| onchain score **above 0.0000** but below 0.435 | ✅ The label fix worked — climbing | Note the rank/score, compare next epoch |
| onchain score **still 0.0000** after 2+ epochs | ⚠️ The label fix didn't take — something deeper | Save the full output + the epoch number shown, bring it to the AI session for debugging |
| `WEATHER_FORECAST_VERIFY · score > 0.702` | 🏆 #1 — we beat Txlens | Screenshot → Discord + LinkedIn update |
| weather score between 0.577 and 0.702 | ✅ Climbing (was rank 7 @ 0.577) | Keep watching — each epoch re-shuffles |

**Browser alternative:** [explorer.telegraphprotocol.com/leaderboard](https://explorer.telegraphprotocol.com/leaderboard) → the leaderboard tab → Ctrl+F `publicnode` and `openmeteo`. The top of each Intent board shows exactly who to beat and by how much.

**Golden rule:** any score **above 0.0000** for the onchain miner is the single most important signal — it proves the Blockscout + `label_field` pattern works, which unlocks the rest of the plan (miners 4 and 5).

### 🔧 Rank-climb pass (26 Oct) — why we weren't #1, and the fix

Fetched the #1 miners' actual YAMLs and diffed against ours. Two fatal gaps:

| | Their YAML (rank #1) | Our old YAML | Effect |
|---|---|---|---|
| Upstream output | Ethplorer returns `coin_balance` in **decimal** | PublicNode returned **hex** (`0x501f…`) | Parser choked → **0.0000** |
| `signal_mapping.label_field` | Points at the exact answer field | **Missing** | Node guessed where the answer is |

**Fixes applied (both re-registered, ACTIVE):**

- 💶 FX miner registered (26 Oct): `fx-now-frankfurter` (ID 9601, registration 4854) — unlocks missions 03, 05, 09 → **12 of 15 missions touched**. Validated end-to-end (200 OK, paid to our own registration).
- 🪨 onchain miner → upstream switched to **Blockscout** (keyless, decimal `coin_balance`, independent of the incumbent) + `signal_mapping: {label_field: coin_balance}` + `on_chain` block + input_schema defaults → registration **4852**. Direct-ask: 200 OK, zero warnings, parser-readable decimal answer (5.7736 ETH).
- 🌤️ weather miner → added `label_field: hourly` + `on_chain` block → registration **4853**. Was **rank 7 (0.577)** on WEATHER_FORECAST_VERIFY *without* these fixes.
- Expected: next 1–2 epochs re-score with the parser-readable labels → onchain climbs from 0.0000 toward rank-1 territory (beat 0.435), weather from 0.577 toward 0.702.

**Strategy insight — how the leaders got there (two models):**

- 🧨 **Carpet model:** one operator machine-generates a miner per Intent (`ocm-` family = 32 miners, `route-` = 33, `wxfv-om` ~10) — mediocre scores, but they occupy many Intents.
- 🎯 **Specialist model:** Txlens — ONE miner, **72 Intents**, 4,023 requests (4× anyone), best scores 1.000.
- **Our plan: deep-first, then widen.** Rank 1 on our existing Intents, then add more Intents to the same miners via `updateMiner` (onchain naturally fits WALLET_BALANCE_CHECK, GAS_PRICE, ONCHAIN_TX_LOOKUP…). Every added Intent = a new leaderboard with our existing infrastructure.

---

### ⚠️ Verification discipline — what is proven vs unproven

The optimizations above are **live but not yet proven by a ranked evaluation**. Honest ledger:

| Claim | Status |
|---|---|
| Both manifests published + registrations Active | ✅ proven (onchain 4852, weather 4853) |
| Direct-ask returns a parser-readable decimal label (`coin_balance`) | ✅ proven for one address lookup |
| The ranked evaluator accepts that label and scores it | ⏳ **unproven — next epochs will tell** |
| `coin_balance` unit matches what the scorer expects (wei vs ETH) | ⏳ unknown — truth sources also read on-chain wei, likely aligned, but unverified |
| Weather `label_field: hourly` works despite being an object of arrays | ⏳ unknown for ours — **counter-evidence: the wxfv-om-aq leader uses exactly this pattern on the same Intent and scores 0.638** |
| The `on_chain` `result/intent/ok` fields resolve | ⏳ copied verbatim from the leader's validated YAML — unverified for ours |
| Epoch cadence | **~9 hours** (earlier 7.5 h estimate corrected) |

**Discipline: no further scoring-related changes until the next 1–2 epochs produce evidence.** The useful next artifact is a ranked evaluation's question, expected unit, and parsed answer.

---

### 🗺️ Path to 15/15 mission coverage — miners 4 and 5

Delivery awards measure **distinct commercial missions enabled**. After FX_NOW we touch **12 of 15**; missing are **4 (Legal), 10 (Model Economy), 15 (Consumer Automation)**. The mission-unlock map (from the catalogue data) shows a clean path — **two more miners, both Deterministic class, both keyless, both reusing the proven Blockscout-style pattern**:

| # | Miner | Intent | Upstream (keyless) | Unlocks | Coverage |
|---|---|---|---|---|---|
| 4 | `crypto-transfer-verify` | `CRYPTO_TRANSFER_VERIFY` | Blockscout tx endpoint (decimal JSON — same API we already use) | missions **10 + 15** | **14/15** |
| 5 | `regulatory-filing-monitor` | `REGULATORY_FILING_MONITOR` | SEC EDGAR (keyless JSON API) | mission **4** | **15/15** 🎯 |

Both are Deterministic (mechanical comparator scoring — our strength), both follow the exact YAML pattern just validated on miner 4852. **Gate: registration happens only after the current optimizations prove out in an epoch.** YMLs will be prepared and hosted in advance (the FX playbook: ready to fire).

> Note on a "Personal Agent" miner: Mission 09 is **already covered** via FX_NOW — no Personal-Agent-specific miner is needed for coverage. A personal-agent *product* is an app-side idea for later, not a Miner-track priority.

---

### 📖 Reading your own explorer page (sepolia.basescan.org)

Basescan **decodes the method names** for anyone viewing our wallet — the tx list is self-explanatory: `Register Miner`, `Deposit USDC`, `Approve`. Two rows need explanation if anyone asks:

- The rows showing `0xc3e35965` are our **`updateMiner`** transactions (basescan does not have that selector labeled yet — they are the YAML-fix re-submissions, registration 4846 → 4848 → 4849).
- The **"Transfer 20 IN"** in the ERC-20 list is the **Circle faucet drop** (our starting USDC), and the **"Deposit USDC 5 OUT"** is the escrow funding — both intentional.

---

## "Why this 'Miner' and 'EVM wallet'? What is this?" — explained

This is the part that was confusing in the announcement. Short version: **Telegraph is a marketplace where AI agents *pay money* to *buy answers* from providers, and the whole thing settles on-chain. That requires crypto wallets — that's why you keep seeing "miner" and "wallet".**

### What Telegraph Protocol actually is

Telegraph calls itself *"a network that turns intelligence into a graded commodity"* — like a diamond-grading exchange, but for AI answers. The core idea:

- An **Intent** is a canonical, on-chain-registered *type of question*, e.g. `WEATHER_FORECAST`, `SANCTIONS_SCREENING_MATCH`, `SMART_CONTRACT_AUDIT`, `WASH_TRADING_DETECTION`. (There are **134 registered Intents** — full catalogue in the appendix below.)
- **Miners** (a.k.a. Providers — the name comes from the early Bittensor-subnet integration; today it means *any* API/model/dataset/tool wrapped via a YAML config) compete to answer each Intent.
- **Evaluators** (a.k.a. Script Authors — they write WASM scoring modules) compete over *how answers get scored* — a better measurement method can replace the canonical one.
- **Validators** (64 of them, stake-weighted, BFT commit-reveal consensus, 43-of-64 to finalize) verify execution and finalize rankings. Spot checks fire roughly every 20 seconds.
- **Apps & Agents** pay to get answers routed to the *top-ranked* miner per Intent — they never hardcode a provider. Every answer comes back with a **receipt** (producer, rank, confidence, settled payment, verification hash).

**Trust mechanics in one line:** answers are scored by WASM evaluators against truth sources, rankings are finalized by 64 validators, providers are bound to their answers via zkTLS, and every payment settles in USDC on **Base** (Ethereum L2).

### The money: USDC in, MACHINA out

This is the economic engine — and the reason wallets exist:

1. An agent (app) pays for a request in **USDC** (priced per request, e.g. $0.01).
2. **2%** goes to the Protocol Treasury.
3. The remaining **98%** goes into a **TWAP Settler escrow**.
4. Over the next 24 hours that USDC is dripped into a **Uniswap V3 pool** (0.01 USDC at a time, ±30s jitter — anti-manipulation; minimum 100 USDC accumulates before a settlement cycle runs) and buys **MACHINA** at market price.
5. The purchased **MACHINA is sent to the miner's registered fee address**.

- **MACHINA** is the protocol's native token: fixed max supply **21,000,000** (Bitcoin-style), genesis emission 7,200/day, halving every 4 years, **zero pre-mine, no team/VC allocation**. Settlement *pricing* is in USDC; *payouts* arrive as MACHINA — so every dollar spent on intelligence creates buy-pressure on MACHINA. (CoinGecko lists it as "machina-2".)
- **Miners earn zero MACHINA from emissions.** Emissions (60% validators / 20% script authors / 20% treasury) reward verification infrastructure only. Miner income is 100% demand-driven — this is deliberate, to keep miner incentives honest.
- Demand multipliers raise the effective price per Intent with 24h volume: 0–999 req → 1.0×, 1k–9,999 → 1.5×, 10k–99,999 → 2.5×, 100k–999,999 → 5.0×, 1M+ → 10.0×. Earnings formula: `min_price_usdc × demand_multiplier × 0.98 → MACHINA at market`.

### Where wallets come in (this answers "why EVM wallet")

You touch wallets in three places, depending on what you build:

| Role | Wallet needed | Why |
|---|---|---|
| **Register as a Miner** | An **EVM wallet** that signs the `registerMiner` transaction on **Base Sepolia** (testnet). Needs a tiny bit of ETH for gas — **no bond, no stake, no fee** | Registration is an on-chain transaction. The Diamond contract lives at `0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8` (Base Sepolia) |
| **Receive payouts** | A second (or the same) **EVM address** declared as your **fee address** | All your MACHINA earnings are sent there. Can be a cold wallet |
| **Run an App/Agent that buys intelligence** | A wallet holding **USDC on Base** (or Solana for Solana-side payments) | Payment methods: **x402** (HTTP-native micropayment — server returns `402 Payment Required`, you sign a USDC tx, retry), **pre-funded escrow** (deposit USDC into the Diamond's EscrowFacet, requests auto-deduct), or an **on-chain ERC-8183 job** (contract funds a job, result arrives via callback) |

So when the announcement/docs say "miner and EVM wallet", it literally means: *wrap an API as a Miner (needs a YAML + a wallet to register + a wallet address for payouts)*. The easy path is **[integrate.telegraphprotocol.com](https://integrate.telegraphprotocol.com)** — connect wallet, paste YAML, it validates + pins to IPFS + sends the transaction for you.

### Miner economics worth knowing before you build one

- **Routing:** top-ranked miner per Intent gets **70%** of requests, #2 gets **20%**, #3 gets **10%** (governance-adjustable; genesis weights).
- **Grace period:** first **7 days** after registration you're not on the leaderboard but share 5% of routed traffic equally with all other new miners — baseline traffic to build a track record.
- **Spot checks:** ~every 20 seconds (deterministically from the latest Base block hash), test *liveness* (any non-empty answer passes). Fail consecutively → **Routing Revocation** — removed from the routing table until the next epoch tournament re-scores you.
- **Scores:** stake-weighted median of validator local scores; 20% score drop → instant loss of routing.
- **Registering:** free, permissionless, no approval. You need: a **YAML config** (public URL, IPFS recommended), a **fee address** (EVM), gas on Base Sepolia, and your API live. Intents you declare must be **canonical** (exact, case-sensitive strings) or the tx reverts — check with `isCanonicalIntent(string)`; read the live set with `getCanonicalIntents()`.

---

## The event in full

### Format & philosophy

- Season II "starts from real applications and works backwards into the intelligence and evaluation required". **Mainnet is the deadline** — you build on the same contracts, settlement path and proof format that ship at mainnet (mainnet target: **Jan 2027**), so nothing gets rewritten later.
- The pipeline: **15 missions define the demand → Intents define the intelligence needed → Providers supply it → Evaluators measure it → Apps prove whether the whole thing works.**
- "Most hackathons end at demo day. This one prepares you to sell what you build — or buy the most competitive intelligence on the market — the day Telegraph reaches mainnet." What you get: a real product (runs on mainnet contracts), a specific use case, proof not a pitch (settled transactions a stranger can click through), and an audience (six weeks of daily posts built on winners).
- Solo or team entry. **Multi-track and multi-submission allowed** if each entry is a real, distinct contribution. No exclusivity on missions. Pre-November prep and reused open-source code are allowed (respect licenses; disclose major reuse). H2-specific activity must happen inside the event window.

### The three tracks

| Track | What you build | How you compete |
|---|---|---|
| **01 Miners / Providers** | Build or integrate the intelligence the applications need — wrap any API, model, dataset or tool; serve one or more shared **Intents** | Globally, per Intent, on **measured performance** (not per industry). There is no "Legal sanctions Miner" — one `SANCTIONS_SCREENING_MATCH` Intent serves every mission that needs sanctions screening (it's bought by builds in 5 missions) |
| **02 Evaluators** | Build or improve how the intelligence is **measured** — evaluation adapters (WASM), evaluation/truth material, or both | Per Intent: a stronger measurement can **replace** the canonical one, improving the rankings all Apps rely on. Deterministic Intents use comparators; Judgment/Hybrid use reward-model adapters |
| **03 Apps & Agents** | A working app/agent for one or more of the **15 commercial missions**, buying its intelligence through Telegraph | Your application must include **at least one genuinely autonomous machine-to-machine purchase or sale** through the supported Telegraph flow, then use the purchased intelligence for a meaningful task. Supported **testnet** implementations qualify |

**The flywheel:** people bring intelligence → people build evaluation → ranking forms → apps consume it → demand feeds back to miners.

### Timeline (all dates UTC)

| Date | What |
|---|---|
| **Before 1 Nov** | Register (done ✅) and explore missions/Intents |
| **1 Nov** | Season II opens. All tracks and missions live. Teams form; Miners/Evaluators pick Intents; App builders pick a mission |
| **14 Nov** | **First Integration Milestone** — Apps & Agents teams demonstrate a first working Telegraph intelligence request *or purchase* (an attempt, or what's blocking them). Explicitly a **progress check, not a submission deadline and not a disqualification rule** |
| **15–23 Nov** | Build and integrate. **20 Nov**: community showcase (working progress, uncovered missions, builder needs). "Miners tune against real requests coming off real builds" |
| **24 Nov – 1 Dec** | Final week + submission. **Anjoman** hands-on community session. **Deadline: 1 Dec, 23:59 UTC, all three tracks** |
| **2–8 Dec** (planned) | Verification and judging |
| **From 9 Dec** (planned) | Provisional results, then a **72-hour appeal window** per notice |
| **After 1 Dec** | **December challenges** — separate reserved **$3,000**, own rules/deadlines, announced before opening; don't extend Season II |

### Prizes — exact distribution ($10,000)

| Track | Award type | Awards | Each | Subtotal |
|---|---|---|---|---|
| **Apps & Agents** | Verified delivery | **8** | $225 | $1,800 |
| | Excellence — 1st | 1 | $700 | $700 |
| | Excellence — 2nd | 1 | $350 | $350 |
| | Excellence — 3rd | 1 | $150 | $150 |
| | | | | **$3,000** |
| **Miners / Providers** | Verified delivery | **4** | $300 | $1,200 |
| | Excellence — 1st | 1 | $500 | $500 |
| | Excellence — 2nd | 1 | $300 | $300 |
| | | | | **$2,000** |
| **Evaluators** | Verified delivery | **4** | $300 | $1,200 |
| | Excellence — 1st | 1 | $500 | $500 |
| | Excellence — 2nd | 1 | $300 | $300 |
| | | | | **$2,000** |
| **December challenges** | New mission results / technical work | **4** | $500 | $2,000 |
| | Adoption / ecosystem activity | **2** | $500 | $1,000 |
| | | | | **$3,000** |

- **29 award places** total across the season (the announcement's "29 award places" = 8+3 Apps + 4+2 Miners + 4+2 Evaluators + 4+2 December).
- A team may win **one delivery + one excellence award per track**. Registration alone doesn't guarantee a prize. USD-quoted; subject to country eligibility, identity/tax checks and payout terms. GitHub bounties are separate.

### Judging — Apps & Agents (/100, need ≥70 + technical pass)

| Points | Criterion |
|---|---|
| **35** | Technical quality & mainnet readiness — **minimum 24/35 here**, plus a working purchase |
| **30** | Commercial viability — clear buyer, real problem, useful result, sensible costs, adoption path |
| **15** | Real independent adoption & retention |
| **10** | Quality of the Telegraph integration |
| **10** | Clear proof — demo, tutorial, repeatability |

Ties broken by: technical score → repeatable proof → novelty → witnessed fair draw.

### Delivery award selection (how the 8/4/4 are handed out)

- **Apps & Agents (8 awards), in priority order:** most distinct completed missions → most distinct accepted apps → most single-entrant-served missions → most verified shared mission-critical capabilities → strongest combined app quality → strongest technical correctness. One app counts once regardless of missions covered; one delivery award per group.
- **Providers & Evaluators (4 each):** most distinct commercial missions enabled → most H2 app workflows unblocked → most verified missing mission-critical Intent needs → strongest technical quality. Tie-breakers: verified consumption (Providers) / proven measurement improvement (Evaluators). Mission impact requires real proof (rerun, integration test, or repeatable test).
- **December awards:** 4 × $500 for new missions/apps/blocker fixes/integration work; 2 × $500 for verified onboarding, retention, repeat use, externally funded customer activity. The same result can't be paid twice.

### Technical requirements (all tracks)

Every entry must be **real, working, independently testable**. Five universal requirements:

1. Something working.
2. A genuine Telegraph integration **with evidence**.
3. Repeatable results — reviewer-friendly instructions.
4. Safe handling — permissions, spending limits, key/data protection.
5. Accurate claims — distinguish testnet vs production.

**Apps & Agents additionally:** at least one **genuinely autonomous machine-to-machine purchase or sale** via the supported Telegraph flow, then use of the intelligence for a meaningful task. Supported testnet implementations qualify.

**Mission acceptance test** — a reviewer will: run it with a new realistic input → check the result → inspect the real Telegraph request with transaction/accounting evidence → **try to break it** (failure case) → reproduce it.

### Verification designations (how results get labeled)

| Label | Meaning |
|---|---|
| **Mission Verified** | Reproduced on testnet / supported network |
| **Production Verified** | Verified in production conditions |
| **Commercially Validated** | Independently funded third-party customer activity |
| **Competitive Supply Verified** | Two meaningfully independent Providers serve it |

Reviewers connect quality measurement, app consumption and commercial outcomes per Intent. No double-counting of requests/payments; protocol-paid tests, testnet traffic and real customer activity are distinguished.

### Submissions — what you must file by 1 Dec, 23:59 UTC

Six items:

1. Project details — team, track, mission(s), link.
2. A **2–5 minute demo video**.
3. **Beginner-friendly run instructions**.
4. **Evidence** — receipts, requests, accounting, endpoints, tests (sensitive material may be shared privately).
5. A short public summary with a working link.
6. Showcase/consent permissions.

Apps & Agents must also answer five commercial questions: **who it's for · what it improves · what works today (with proof) · why someone would adopt it · how to try it.**
Recommended demo flow: *problem → Telegraph request → intelligence/Provider evidence → observed cost → completed result → how to try it.*
Progress sharing on social is encouraged but "social posts, tags, views, and likes are **not** required for technical eligibility."

### Fair play & rights

- Independent judging with conflict-of-interest recusal. Documented platform issues extend milestones.
- Related teams/wallets must be disclosed. Fake receipts, manufactured adoption, collusion, or copied work → possible disqualification after review and a chance to respond.
- **72-hour appeal window** after provisional results.
- Participants **retain ownership** of original work (organizers need permission for private review and public sharing). Payout requires eligibility/identity/tax checks.
- After H2: missions, Intents, the Explorer, Discord and GitHub opportunities continue; December challenges and funded GitHub issues have separate terms.

---

## How to actually win each track (practical notes from the docs)

### If we do a Miner
1. Pick Intent(s) — **63 of the 134 are flagged "Season II priority"** (★ in the appendix). Prefer ones where you can be meaningfully independent and that missions actually buy (the appendix shows per-Intent which missions buy them).
2. Wrap your API/model via a **YAML config** — copy [`example-miner.yaml`](https://github.com/telegraphprotocol/telegraph-examples/blob/master/frontend/yaml/example-miner.yaml) (wraps a free weather API, registerable as-is). Required fields: `version, kind, id, slug, name, base_url`; endpoints need `description` + `intents` (a YAML without them is refused); add `params` + `param_map` so the node doesn't guess your field names.
3. Validate free at [integrate.telegraphprotocol.com](https://integrate.telegraphprotocol.com) (or `POST https://integrate.telegraphprotocol.com/api/validate` with `{yaml, api_key, miner_address}`), then register (UI does it, or `cast send` with `registerMiner(string,bytes32,address,uint256,string[])` on the Diamond at `0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8`, Base Sepolia).
4. Check liveness: `GET https://devnode.telegraphprotocol.com/api/miners` (by-registrationId lookup: `/api/miners/{id}` shows `activation_status` + `rejection_reason`).
5. Hackathon delivery awards favor **distinct commercial missions enabled** and **unblocking real app workflows** — coordinate with Apps teams on Discord.

### If we do an Evaluator
1. Pick Intent(s) to evaluate. Classes decide the module: **Deterministic** → comparator WASM (must reproduce the network's reference rule *exactly*); **Judgment** → reward-model "wide adapter package"; **Hybrid** → comparator + adapter.
2. Modules run in a sandbox: **no network, no filesystem, no state** — same input must give same output. Comparator exports: `imw_score_deterministic`, `imw_alloc`, `imw_free`. (Old `rank_answer` MiniLM modules are retired and rejected.)
3. A challenger replaces the canonical module only by **beating it on a hidden sample** from the Evaluation Pool (win margin + minimum win rate). Comparators must reproduce the reference comparison exactly.
4. You can also **contribute evaluation data** (questions with better/worse answer pairs for judgment Intents; **truth sources** — descriptions of public key-less APIs — for deterministic/hybrid Intents). Material uploaded in one epoch is used from the next.
5. Delivery awards favor **proven measurement improvement** — document before/after scores.

### If we do an App / Agent (the headline track)
1. **Pick a mission** from the 15 below — each has buyer profiles, a problem statement, a target outcome, and worked example builds with the exact Intents they buy.
2. Architecture (from the official "anatomy of a build"): your agent has a goal → fires **parallel paid requests** (one per Intent, simultaneously) → Telegraph routes each to the highest-ranked miner (never hardcode) → each answer arrives with a **receipt** → your app combines answers into an outcome with a **verification hash and a cost line**.
3. Buy intelligence via the **Engine** (`POST https://devnode.telegraphprotocol.com/engine/v1/ask` with `{"query": "..."}` — auto-routed; or `/engine/v1/ask/{minerId}` for direct calls). First call returns `402 Payment Required` — complete the x402 USDC payment and retry; or pre-fund escrow in the Diamond's EscrowFacet. Response includes `miner_id`, `result`, `cost_usd`, `duration_ms`, `intent`, `signal_hash` (look up at `GET /engine/v1/signal/{hash}`).
4. There's also an **MCP server** (`Telegraph-MCP` repo) so agents can call Telegraph tools directly, a **WebSocket signal feed**, and the **Daemon** (autonomous every-3h signal generation) — different from the on-demand Engine.
5. **Nov 14 milestone:** have *any* first working Telegraph request or purchase running — even a failed attempt with documented blockers counts.
6. Design for the rubric from day one: **35 pts technical** (min 24), **30 pts commercial** (name the buyer!), **15 pts real adoption**, **10 pts integration quality**, **10 pts proof**. Keep every receipt; print the cost line; make it runnable by a stranger.

---

## Season I recap — what already happened (and the winners)

Season I ("H1") ran **Aug 17 – Sep 7, 2026** ($5,000), part of a 3-hackathon series: H1 ($5K, miners + eval scripts) → **H2 ($10K, this one, with 15 commercial missions)** → **H3 (mainnet launch, December 2026 onwards, "real agent consumption and rewards")**. 300+ builders registered; testnet stats at announcement: ~1,500–1,918 miners, 45 apps, 130,000–141,000+ transactions, 8 of 64 nodes secured (a $13B institution runs one), 1,000+ models targeted for machine querying by mainnet.

**Season I winners (from the official winners page):**

| Track | Winner | Score | Handle | What it is |
|---|---|---|---|---|
| Miners | **TXlens** | 97.9 | [@sireadell](https://x.com/sireadell) | Structured transaction intelligence (status, sender/recipient, value in wei/ETH, block, decoded method). Explorer: `explorer.telegraphprotocol.com/miners/txlens` |
| Miners | **Chainsight Oracle** | 86.9 | [@shadrakbsh](https://x.com/shadrakbsh) | Real-time onchain + market data (prices, TVL, fiat rates, gas, balances) — proof a Miner can be any useful machine-callable service |
| Miners | **Oathcast Weather** | 85.4 | [@fexx_off](https://x.com/fexx_off) | Serves `WEATHER_FORECAST`; shows demand routed through ranked providers, not hardcoded sources |
| Evaluation WASMs | 1st @zkasuran · 2nd @hyadav42774 · 3rd @BangDropID | — | | (no project names/scores published for this track) |
| Apps | **Scam Shield** | 0.69/1 | [@mshoaibfiaz47](https://x.com/mshoaibfiaz47) | Scam detection across surfaces: browser extension scanning Gmail + mobile app scanning SMS, backed by Telegraph intelligence — `scam-shield-rouge.vercel.app` |
| Apps | **Truvian Shield** | 0.59/1 | [@encrypt_wizard](https://x.com/encrypt_wizard) | Execution-safety checkpoint for onchain agents: buys 4 intelligence pieces before signing (gas, counterparty tx status, value at risk, liquidity) → SAFE/CAUTION/BLOCK with evidence — `truvian.xyz` |
| Apps | **ProofPact** | 0.45/1 | [@DefiPreacherr](https://x.com/DefiPreacherr) | Verified settlement layer: freezes acceptance criteria pre-funding, collects signed delivery evidence, buys independent verification, deterministic settlement — `proofpact.vercel.app/app` |

**Lesson from the winners list:** S1 app winners were *narrow, useful, evidence-heavy* tools that bought a handful of Intents and produced a clear verdict with receipts — exactly what the S2 rubric rewards.

---

## ✅ What to do NOW (before Nov 1) — readiness checklist

- [x] Registered (one registration covers all tracks).
- [x] EVM wallet set up + funded (0.0001 ETH gas + 20 USDC via Circle/CDP faucets — see Ch.2).
- [x] Track direction decided: **Apps & Agents on Mission 01** + **Miner track** (2 miners live, 1 hosted).
- [x] Miners registered, validated end-to-end, escrow funded, first real purchases done (Ch.4–5).
- [x] Full documentation written (`docs/COMPLETE-WALKTHROUGH.md` + this README).
- [ ] **Join the Discord** ([discord.gg/telegraphprotocol](https://discord.gg/telegraphprotocol)) and post the intro with screenshots — where teams/collaborators form. "You don't need an existing team or a finished project to get involved."
- [ ] **Post the 4 catalogued protocol/miner bugs** to Telegraph's GitHub bounties — early visibility before judges start watching (see `build/milestones/` log).
- [ ] Skim the **mission detail** (below) and shortlist the next 1–2 example builds that fit our skills.
- [ ] **Nov 1:** lock track + mission/Intent formally; run the desk against real listing candidates. **Nov 14:** milestone demo (artifact ready). **Dec 1 23:59 UTC:** everything submitted; flip this repo public.

---

## All links

| What | URL |
|---|---|
| Hackathon home | https://hackathon.telegraphprotocol.com/ |
| Rules (official) | https://hackathon.telegraphprotocol.com/rules |
| Missions | https://hackathon.telegraphprotocol.com/missions |
| Intents catalogue | https://hackathon.telegraphprotocol.com/intents |
| Timeline | https://hackathon.telegraphprotocol.com/timeline |
| Tracks | https://hackathon.telegraphprotocol.com/tracks |
| Season II winners page | https://hackathon.telegraphprotocol.com/winners |
| Season I archive | https://hackathon.telegraphprotocol.com/season-1 |
| Protocol home | https://telegraphprotocol.com/ |
| Docs | https://docs.telegraphprotocol.com/ |
| Whitepaper | https://telegraphprotocol.com/whitepaper |
| Alexandria (Intelligence Terminal) | https://alexandria.telegraphprotocol.com/ |
| Miner registration UI | https://integrate.telegraphprotocol.com/ |
| Dev node API | https://devnode.telegraphprotocol.com/ |
| Explorer | https://explorer.telegraphprotocol.com/ |
| Discord | https://discord.gg/telegraphprotocol |
| GitHub (bounties) | https://github.com/telegraphprotocol/bounties |
| GitHub repos | telegraphprotocol/Telegraph (private, request access) · Telegraph-api-docs · Telegraph-MCP · telegraph-examples |
| X (Twitter) | https://x.com/Telegraphprotoc |
| Contact | contact@telegraphprotocol.com (email obfuscated on site; shown as Cloudflare-protected) |
| Contracts (Base Sepolia) | Diamond `0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8` · Treasury `0xffe89e1f0a77C600Ad938b57180E5be3e3119f40` |

> **Disclaimer carried from the site:** companies named in the commercial missions (Binance, Kraken, Hugging Face, etc.) are *examples of intended buyers only*. Telegraph has no affiliation, sponsorship or endorsement from them, and naming them doesn't imply they reviewed or requested these builds.

---
# The 15 Commercial Missions (full detail)

> Source: hackathon.telegraphprotocol.com/missions (data extracted from the site's own app bundle).
> Each mission lists: who the buyers are, the problem, the finished outcome, and every example build (tag = **Full** build or **Mechanism** demo) with the Intents it buys.

Pick a mission in the **Apps & Agents** track. One app can complete several missions if each has its own meaningful, testable result.

## Mission 01 — Exchange

**Buyers / sector:** Global spot and derivatives venues  
**Page:** https://hackathon.telegraphprotocol.com/missions/exchange

**The one-line build:** An autonomous listings desk that buys contract audit, contributor authenticity, holder concentration and sanctions exposure in parallel, and returns a signed listing risk memo with a cost line at the bottom.

**Problem it solves:** Listing reviews take weeks of analyst time, surveillance is bought per seat from a single in-house model, and counterparty checks mean exposing your book.

**Finished outcome:** An exchange desk that runs on bought intelligence: every listing, alert and counterparty decision arrives with the receipts that informed it and a cost line.

### Buyer profile: Global spot and derivatives venues

*Named as example buyers only (no affiliation/endorsement): Kraken, Gate.io, Binance.*

#### Example build: The autonomous listings desk `Full`

A token listing application arrives. An agent fires parallel paid requests through Telegraph: contract audit, commit history and contributor authenticity, holder concentration, sanctions exposure on treasury addresses, and bot-versus-human analysis of the project's social following. The output is a signed listing risk memo with a verification hash and a cost line at the bottom. Run it against a real pending listing candidate and print the total: a few dollars and ninety seconds, against weeks of analyst time.

**Output to demonstrate:** Signed listing risk memo with a cost line

**Intents bought:** `SMART_CONTRACT_AUDIT`, `ONCHAIN_METRIC_VERIFY`, `SANCTIONS_SCREENING_MATCH`, `SOCIAL_BOT_DETECTION`, `CODE_REVIEW`

#### Example build: Surveillance that only bills when it finds something `Full`

A market-integrity agent buys order-book anomaly detection continuously through Telegraph rather than running one in-house model. Each request routes to the miner currently ranked best for it, and the venue pays per request instead of per seat. Then invert it: the surveillance agent republishes its consolidated alert feed as a miner, so compliance agents at other venues can buy from it.

**Output to demonstrate:** A ranked alert feed, resold as a miner

**Intents bought:** `WASH_TRADING_DETECTION`, `LIQUIDITY_DEPTH_VERIFY`

#### Example build: The solvency handshake `Mechanism`

Two exchange agents verify each other before extending counterparty credit. Each buys a solvency attestation on the other through Telegraph, without either book being exposed. The verification and the cross-agent purchase run fully on testnet. The credit decision that follows needs mainnet, and a counterparty willing to be the other side.

**Output to demonstrate:** Mutual solvency check before credit

**Intents bought:** `ASSET_RESERVE_ATTESTATION`, `ONCHAIN_METRIC_VERIFY`, `CROSS_CHAIN_STATE_VERIFY`

---

## Mission 02 — Stablecoin

**Buyers / sector:** Stablecoin issuers and on-chain credit  
**Page:** https://hackathon.telegraphprotocol.com/missions/stablecoin

**The one-line build:** An agent fleet with a real expense ledger, compliance screening attached to the payment itself as a proof, and a machine that opens a vault, borrows, spends on intelligence, earns as a miner and repays.

**Problem it solves:** Agent spending looks nothing like a card payment or a wire, so no existing reporting, compliance or treasury tooling captures it.

**Finished outcome:** Money infrastructure for machines: agents that pay, screen, borrow and rebalance on verified evidence, with every settlement countable on chain.

### Buyer profile: Fiat-backed stablecoin issuer

*Named as example buyers only (no affiliation/endorsement): Circle.*

#### Example build: The agent expense ledger `Full`

A fleet of agents runs for the full 30 days, paying for every request, with a dashboard showing burn per intelligence category, cost per completed task, and automated top-up when a wallet runs low. The headline number is settlement count, and it is genuine: tens of thousands of individual payments executed. Agent spending is a transaction class that no existing reporting captures, because it looks nothing like a card payment or a wire.

**Output to demonstrate:** Expense ledger: burn per category, cost per task

**Intents bought:** `CRYPTO_TRANSFER_VERIFY`, `TASK_EXECUTION_QUALITY`, `GAS_PRICE`

#### Example build: Compliance attached to the payment itself `Full`

Before an agent pays a miner, it buys a screening request: sanctions status, address risk score, jurisdiction eligibility. The verified result is attached to the payment as a proof, so the payment carries its own defensibility. Machine-to-machine Travel Rule mechanics, implemented rather than described.

**Output to demonstrate:** A payment that carries its own compliance proof

**Intents bought:** `SANCTIONS_SCREENING_MATCH`, `TRANSACTION_RISK`, `FRAUD_RISK`, `REGULATORY_FILING_MONITOR`

#### Example build: Treasury agents choosing on evidence `Mechanism`

An autonomous treasury agent buys reserve-quality and cross-chain liquidity-depth answers through Telegraph, then rebalances on what it learns. The buying and the decision logic are real and auditable now. The rebalance runs against live market data as a simulation until mainnet, and the demo says so on screen.

**Output to demonstrate:** Evidence-backed rebalance, simulated until mainnet

**Intents bought:** `ASSET_RESERVE_ATTESTATION`, `LIQUIDITY_DEPTH_VERIFY`, `CROSS_CHAIN_STATE_VERIFY`

### Buyer profile: Global dollar stablecoin issuer

*Named as example buyers only (no affiliation/endorsement): Tether (USDT).*

#### Example build: Machine-settled trade finance `Mechanism`

An agent releases payment against a shipment only after buying verified bill-of-lading, vessel position and customs-clearance answers through Telegraph. The conditional logic, the verification and the release trigger all run for real on testnet. The corridor economics arrive with mainnet.

**Output to demonstrate:** Payment released only against verified shipment facts

**Intents bought:** `VESSEL_TELEMETRY_VERIFY`, `DOCUMENT_AUTHENTICITY`, `PACKAGE_STATUS`

#### Example build: Edge agents that pay when they can reach the network `Full`

Agents running on cheap local hardware in low-connectivity conditions queue their requests, buy in a burst when a connection appears, and cache the verified answers locally. This proves the network works outside a data centre, and nothing about it needs mainnet to be true.

**Output to demonstrate:** Offline-first agent with cached verified answers

**Intents bought:** `QUESTION_ANSWERING`, `FX_NOW`, `WEATHER_CHECK`

#### Example build: Gold-collateralised agent wallets `Mechanism`

An agent funds its intelligence budget from a tokenised gold position rather than a cash balance, converting only what it spends. The conversion and spend path are built end to end; the collateral is test-denominated until mainnet. Pairs with the mining examples in Mission 06.

**Output to demonstrate:** Intelligence budget funded from tokenised gold

**Intents bought:** `ASSET_RESERVE_ATTESTATION`, `CRYPTO_PRICE`, `FX_NOW`

### Buyer profile: Decentralised stablecoin protocol

*Named as example buyers only (no affiliation/endorsement): Sky (DAI).*

#### Example build: A machine with a balance sheet `Mechanism`

An agent opens a collateralised vault, borrows, spends on intelligence, earns by reselling a composite answer as a miner, and repays. Full cycle, fully built, running on testnet collateral. Autonomous credit is the most under-built idea in the agent economy and this demonstrates the whole mechanism. Label the denomination everywhere the word "earned" appears on screen.

**Output to demonstrate:** Borrow, spend, earn and repay, all by one agent

**Intents bought:** `FINANCIAL_DATA`, `CRYPTO_YIELD_RATE`, `ONCHAIN_METRIC_VERIFY`

#### Example build: Collateral quality bought per request `Full`

Risk parameters for real-world-asset collateral are set today by committee and vendor data. Instead, an agent buys verified answers on collateral quality through Telegraph, and the resulting parameter change is proposed on-chain with every input receipted. The analysis is real work product regardless of which network settled it.

**Output to demonstrate:** On-chain parameter proposal with every input receipted

**Intents bought:** `FINANCIAL_DATA`, `ASSET_RESERVE_ATTESTATION`, `CORPORATE_REGISTRY_LOOKUP`

#### Example build: A treasury that shows its working `Full`

A governance execution agent buys verified analysis before rebalancing or voting, and attaches the receipts to the proposal. Voters audit not just the decision but what the machine paid to inform it, and which inputs disagreed.

**Output to demonstrate:** Governance proposal with its receipts attached

**Intents bought:** `LIQUIDITY_DEPTH_VERIFY`, `CRYPTO_YIELD_RATE`, `MACRO_ECONOMIC_INDICATOR`, `TEXT_SUMMARIZATION`

---

## Mission 03 — Institutional Markets

**Buyers / sector:** Privacy-first issuance and liquidity venues  
**Page:** https://hackathon.telegraphprotocol.com/missions/institutional-markets

**The one-line build:** A defensible mark on a private asset, an autonomous issuance desk that prices every input, and pre-trade diligence between two agents where neither sees the other book.

**Problem it solves:** Private assets are marked on opinion, issuance memos take weeks of paid advisers, and institutions will not expose their books to run diligence on each other.

**Finished outcome:** Institutional workflows where every input is priced and provable, and counterparties verify each other without either side exposing its book.

### Buyer profile: Privacy-first institutional issuance and liquidity venue

*Named as example buyers only (no affiliation/endorsement): Temple Digital Group.*

#### Example build: A defensible mark on a private asset `Full`

A tokenized private-credit or commodity position needs a NAV. An agent buys each pricing input through Telegraph, routed to the miner ranked best for it. Privacy preserved, provenance intact. The mark is real and it is defensible today.

**Output to demonstrate:** NAV with provenance on every pricing input

**Intents bought:** `FINANCIAL_DATA`, `LOAN_INTEREST_RATE_QUOTE`, `MACRO_ECONOMIC_INDICATOR`, `FX_NOW`

#### Example build: The autonomous issuance desk `Full`

An issuer agent assembles a note issuance by purchasing entity verification, jurisdiction eligibility, comparable issuance terms and rate curves as discrete paid requests, then produces a draft issuance memo with every input priced and provable. Show the total cost next to what the same memo costs today.

**Output to demonstrate:** Draft issuance memo with a cost line

**Intents bought:** `CORPORATE_REGISTRY_LOOKUP`, `SANCTIONS_SCREENING_MATCH`, `LOAN_INTEREST_RATE_QUOTE`, `MACRO_ECONOMIC_INDICATOR`, `REGULATORY_FILING_MONITOR`

#### Example build: Pre-trade diligence between strangers `Full`

A buy-side agent and a sell-side agent each buy counterparty and collateral-quality answers before agreeing terms. Neither sees the other's book, both see verified inputs, and the trade either clears or does not. Institutional machines transacting without trusting each other, with the diligence exchange complete on testnet.

**Output to demonstrate:** A trade that clears, or does not, on verified inputs

**Intents bought:** `CORPORATE_REGISTRY_LOOKUP`, `SANCTIONS_SCREENING_MATCH`, `FINANCIAL_DATA`

---

## Mission 04 — Legal

**Buyers / sector:** International law firms, Hong Kong and APAC  
**Page:** https://hackathon.telegraphprotocol.com/missions/legal

**The one-line build:** Regulatory monitoring with a chain of custody, an overnight five-jurisdiction diligence pack with per-item cost, and two agents negotiating a services agreement on paid evidence.

**Problem it solves:** Firms will not rely on research they cannot evidence, and cross-border diligence is billed by the hour and delivered in days.

**Finished outcome:** Legal work priced per fact rather than per hour: machine-gathered research and diligence that carries its own chain of custody.

### Buyer profile: International law firms in Hong Kong and APAC

*Named as example buyers only (no affiliation/endorsement): King & Wood Mallesons, Deacons, Linklaters, Baker McKenzie, Clifford Chance.*

#### Example build: Regulatory monitoring with a chain of custody `Full`

An agent buys regulator-publication monitoring across the SFC, HKMA, MAS, the EU and the US through Telegraph. Each answer carries a receipt and a timestamp, so a machine-gathered fact can be cited with a record of where it came from and when. Firms will not rely on research they cannot evidence, and the evidence here is as good on testnet as it will be on mainnet.

**Output to demonstrate:** Citable regulatory digest, every item receipted

**Intents bought:** `REGULATORY_FILING_MONITOR`, `CONTENT_EXTRACTION`, `TEXT_SUMMARIZATION`, `LANGUAGE_TRANSLATION`

#### Example build: The overnight diligence pack `Full`

Client onboarding across five jurisdictions. An agent buys corporate registry lookups, sanctions screening, litigation history and adverse media, then assembles a diligence pack with a per-item cost and proof attached. Print the invoice the machine generated next to the invoice a firm would have generated. This is finished work product, not a prototype.

**Output to demonstrate:** Five-jurisdiction diligence pack with per-item cost

**Intents bought:** `CORPORATE_REGISTRY_LOOKUP`, `SANCTIONS_SCREENING_MATCH`, `WEB_SEARCH`, `FACT_CHECK`, `SENTIMENT_ANALYSIS`

#### Example build: Two agents negotiating with paid evidence `Full`

Two agents negotiate a services agreement. Before conceding a clause, each buys clause benchmarking and enforceability answers for the governing jurisdiction. Terms escrow on-chain. What you get is two machines haggling with a full receipt trail of what each paid to learn, which is legal work priced per fact rather than per hour.

**Output to demonstrate:** Agreed terms in escrow, with a receipt trail per clause

**Intents bought:** `CONTRACT_OBLIGATION_AUDIT`, `QUESTION_ANSWERING`, `SEMANTIC_SIMILARITY`, `REGULATORY_FILING_MONITOR`

---

## Mission 05 — Conflict Intelligence

**Buyers / sector:** Systematic macro and commodities funds  
**Page:** https://hackathon.telegraphprotocol.com/missions/conflict-intelligence

**The one-line build:** An escalation score that traces to a specific input at a specific price, media forensics bought before a position is sized, and one verified answer mapped across rates, FX and energy at once.

**Problem it solves:** Conflict signals move markets within minutes, but they are often fabricated, rarely sourced, and sold as indices nobody can decompose.

**Finished outcome:** Conflict intelligence a systematic book can trade: every signal traces to a specific input at a specific price, with disagreement between sources left visible.

### Buyer profile: Systematic global macro fund

*Named as example buyers only (no affiliation/endorsement): Bridgewater Associates.*

#### Example build: An escalation score you can trace to its source `Full`

An agent buys military movement corroboration, sanctions and policy announcements, and provenance-checked media through Telegraph, and produces a country-level escalation score with the disagreement between inputs left visible rather than smoothed away. A signal that traces to a specific input at a specific price is worth more to a systematic book than an index nobody can decompose.

**Output to demonstrate:** Country escalation score, disagreement visible

**Intents bought:** `MEDIA_FORENSIC_VERIFY`, `FACT_CHECK`, `WEB_SEARCH`, `SATELLITE_IMAGERY_ANALYSIS`

#### Example build: The gap between reported and observed `Full`

Official trade and production statistics out of sanctioned or opaque economies are political documents. An agent buys independent corroboration - port throughput, vessel draft, night lights, rail loadings - and prices the distance between what was reported and what was observed. That gap is a macro view in itself, and it is currently produced slowly and expensively by consultants.

**Output to demonstrate:** The priced gap between reported and observed

**Intents bought:** `VESSEL_TELEMETRY_VERIFY`, `LIVE_PORT_CONGESTION`, `SATELLITE_IMAGERY_ANALYSIS`, `MACRO_ECONOMIC_INDICATOR`

#### Example build: Research priced per fact `Mechanism`

Every input in a country note carries its cost and its proof, so a reader sees what the conclusion cost to reach and which inputs contradicted each other. The provenance is real today. Replacing a research subscription with per-request procurement needs mainnet.

**Output to demonstrate:** Country note with cost and proof per input

**Intents bought:** `FACT_CHECK`, `WEB_SEARCH`, `TEXT_SUMMARIZATION`

### Buyer profile: Multi-strategy fund, commodities and energy

*Named as example buyers only (no affiliation/endorsement): Citadel.*

#### Example build: Conflict to barrel `Full`

When a conflict signal fires, an agent buys strait transit counts, dark-fleet detection, refinery and terminal thermal anomalies, and war-risk insurance rate changes, then converts them into a supply disruption estimate in the units the desk trades. Physical corroboration is useless to an energy trader until it is denominated in supply.

**Output to demonstrate:** Supply disruption estimate, in barrels

**Intents bought:** `VESSEL_TELEMETRY_VERIFY`, `LIVE_PORT_CONGESTION`, `SATELLITE_IMAGERY_ANALYSIS`, `WEB_SEARCH`

#### Example build: Provenance before the position `Full`

A claim about a strike on energy infrastructure moves the market within minutes and is fabricated often enough to matter. The agent buys image and video forensics, frame geolocation, upload history and posting-network analysis through Telegraph, each routed to the miner ranked best for it, and the position is sized on verified content rather than on whichever narrative moved first.

**Output to demonstrate:** Position sized on verified content

**Intents bought:** `MEDIA_FORENSIC_VERIFY`, `SOCIAL_BOT_DETECTION`, `IMAGE_CAPTIONING`, `SATELLITE_IMAGERY_ANALYSIS`, `WEB_SEARCH`

#### Example build: Paying for depth only at the tail `Mechanism`

The agent buys nothing during a quiet month and buys deeply when a threshold is crossed, against a vendor model that charges the same either way. Show spend concentrated in the periods where it mattered. The behaviour is real on testnet; attributing P&L to it needs live positions.

**Output to demonstrate:** Spend that concentrates where it mattered

**Intents bought:** `FACT_CHECK`, `VESSEL_TELEMETRY_VERIFY`, `MEDIA_FORENSIC_VERIFY`

### Buyer profile: Global macro fund with a digital assets arm

*Named as example buyers only (no affiliation/endorsement): Brevan Howard.*

#### Example build: One answer, three desks `Full`

An agent buys verified conflict inputs once and maps them across rates, FX and energy simultaneously. The same purchased answer serves multiple books, so cost per desk falls with every reuse. Reuse economics is the strongest argument for per-request pricing over per-seat licensing, and it only works when the answer is portable and proved.

**Output to demonstrate:** One purchase mapped across rates, FX and energy

**Intents bought:** `FACT_CHECK`, `FX_NOW`, `LOAN_INTEREST_RATE_QUOTE`, `GRID_POWER_PRICE`

#### Example build: The fund as a miner `Full`

The agent republishes its composite conflict index as a paid answer other agents buy. Buyer becomes seller inside one demo, which is the clearest possible picture of a two-sided machine market.

**Output to demonstrate:** Composite conflict index, sold as a miner

**Intents bought:** `FACT_CHECK`, `SENTIMENT_ANALYSIS`, `TEXT_SUMMARIZATION`

#### Example build: Verified off-chain facts for on-chain execution `Mechanism`

Strategies executing on-chain still depend on off-chain facts, and an allocator will ask where those facts came from. Provenance attached to the input is the answer. The proof works now; the execution economics arrive with mainnet.

**Output to demonstrate:** On-chain execution with provable off-chain inputs

**Intents bought:** `FACT_CHECK`, `EVENT_OUTCOME_RESOLUTION`, `CROSS_CHAIN_STATE_VERIFY`

---

## Mission 06 — Resources and Agriculture

**Buyers / sector:** Mines, cattle stations, grain growers  
**Page:** https://hackathon.telegraphprotocol.com/missions/resources-and-agriculture

**The one-line build:** A days-to-impact figure per site keyed to geolocation, a destocking clock measured in weeks of carrying capacity, and a yield forecast published against the official estimate.

**Problem it solves:** Weather, logistics and land decisions carry board-level money, yet they are made on instinct and a weather app, and operating data is never shared because sharing means identifying yourself.

**Finished outcome:** Site-level decisions priced per request: days-to-impact, weeks of carrying capacity left, and yield forecasts published against the official number.

### Buyer profile: Gold mines

#### Example build: Days-to-impact `Full`

An agent buys Bureau of Meteorology forecasts, satellite soil moisture, cyclone tracking, road and rail closure feeds, and port congestion, keyed to mine geolocation. It produces a days-to-impact figure per site and pre-books alternate haulage before the corridor closes. Extreme weather in Australia is a board-level number and nobody currently has it priced per request. The forecast is right or wrong on its own merits.

**Output to demonstrate:** Days-to-impact per site, haulage pre-booked

**Intents bought:** `WEATHER_FORECAST_VERIFY`, `SATELLITE_IMAGERY_ANALYSIS`, `LIVE_PORT_CONGESTION`, `ROUTE_ETA`, `TRAVEL_DISRUPTION`

#### Example build: Auditable machine decisions `Mechanism`

When weather, logistics and spot conditions cross a threshold, the agent buys a confirming set of answers through Telegraph before triggering a hedge. Every input has a receipt, so a risk committee can reconstruct exactly why the machine acted and what it paid to be sure. The audit trail is complete today; the hedge execution is simulated.

**Output to demonstrate:** Hedge trigger with a reconstructable audit trail

**Intents bought:** `WEATHER_FORECAST_VERIFY`, `SHIPMENT_DELAY_RISK`, `ROUTE_ETA`, `STOCK_PRICE`

#### Example build: Competitors trading intelligence anonymously `Full`

One mine publishes its on-site sensor output as a miner: regional dust, groundwater, grid draw, road conditions. Neighbouring operators' agents buy from it without either party negotiating a data-sharing agreement. Mining is an industry where operating data has obvious value and no distribution, because sharing it currently means identifying yourself.

**Output to demonstrate:** Anonymous site data, sold as a miner

**Intents bought:** `SENSOR_TELEMETRY_VERIFY`, `AIR_QUALITY_INDEX`, `WEATHER_CHECK`

### Buyer profile: Cattle farmers

#### Example build: The destocking clock `Full`

An agent buys satellite pasture biomass, water point telemetry, seasonal rainfall outlook, and feed and freight prices, then produces a single number: weeks of carrying capacity left. Cattle is a timing business, and the decision to destock or agist carries more weight than any other decision on the property. It is currently made on instinct and a weather app.

**Output to demonstrate:** Weeks of carrying capacity left

**Intents bought:** `SATELLITE_IMAGERY_ANALYSIS`, `SENSOR_TELEMETRY_VERIFY`, `WEATHER_FORECAST_VERIFY`, `SHIP_RATE_ETA`, `LIVE_SHELF_PRICE`

#### Example build: Provenance the buyer's machine can verify `Full`

For export cattle, an agent assembles a chain-of-custody pack: feed history, treatment records, transport and welfare telemetry, each verified and proved. The importer's agent buys the pack directly. Farm operating data stops being paperwork and becomes a product with a price.

**Output to demonstrate:** Chain-of-custody pack the importer's agent buys

**Intents bought:** `SENSOR_TELEMETRY_VERIFY`, `DOCUMENT_AUTHENTICITY`

#### Example build: Machine-negotiated agistment `Mechanism`

One property's agent publishes verified spare pasture and water availability as a miner. A drought-affected property's agent finds it, buys the verification, and books agistment automatically. Discovery, verification and booking all run now. Money moving between two farms waits for mainnet.

**Output to demonstrate:** Agistment booked machine to machine

**Intents bought:** `SATELLITE_IMAGERY_ANALYSIS`, `SENSOR_TELEMETRY_VERIFY`, `WEATHER_FORECAST_VERIFY`

### Buyer profile: Corn growers

#### Example build: Beating the official estimate `Full`

An agent buys soil moisture, growing degree days, pest and disease pressure, and satellite crop health through Telegraph across a growing region, and produces a yield forecast ahead of the government report. Publish the machine's number and the official number side by side after release. If the machine lands close, that chart stands on its own and no network status undermines it.

**Output to demonstrate:** Yield forecast published before the official report

**Intents bought:** `SATELLITE_IMAGERY_ANALYSIS`, `WEATHER_FORECAST_VERIFY`, `MACRO_ECONOMIC_INDICATOR`, `SENSOR_TELEMETRY_VERIFY`

#### Example build: Autonomous input procurement `Mechanism`

The agent buys fertiliser and fuel price answers plus application weather windows, then places input orders and locks forward contracts inside the window. The intelligence purchase and the decision are real. Order placement is simulated against live prices, so the saving is calculated rather than banked.

**Output to demonstrate:** Input orders timed to the weather window

**Intents bought:** `WEATHER_FORECAST_VERIFY`, `SHIP_RATE_ETA`, `LIVE_SHELF_PRICE`

#### Example build: Parametric payout without an adjuster `Mechanism`

A hail or drought event triggers an insurer's agent and a grower's agent to each buy verified weather and satellite answers. They agree on the proved facts and the payout settles automatically with the evidence attached. No claim form, no field visit. The agreement mechanism is complete; the payout is test-denominated until mainnet.

**Output to demonstrate:** Payout agreed on proved facts

**Intents bought:** `WEATHER_FORECAST_VERIFY`, `SATELLITE_IMAGERY_ANALYSIS`, `EVENT_OUTCOME_RESOLUTION`

---

## Mission 07 — Consumer Platform

**Buyers / sector:** Social, camera and messaging platforms  
**Page:** https://hackathon.telegraphprotocol.com/missions/consumer-platform

**The one-line build:** A model that pays for what it does not know, a camera lens that buys a verdict on whether what it sees is real, and marketplace agents that verify each other before money moves.

**Problem it solves:** Consumer platforms are flooded with synthetic content, counterfeits and scams, and verification currently costs more than the thing being verified.

**Finished outcome:** Consumer experiences where a model, a lens or a marketplace buys a verified answer in the moment, with the price and the proof visible to the user.

### Buyer profile: AI assistant built into a social network

*Named as example buyers only (no affiliation/endorsement): Grok.*

#### Example build: The model that pays for what it does not know `Full`

An agent hits a question outside its context and, inside the response, buys the answer from Telegraph miners, showing the price and the proof inline. It reframes a model as a buyer of intelligence rather than a container of it. The answer it gets back is correct or it is not, and that is verifiable today.

**Output to demonstrate:** Inline answer with its price and proof

**Intents bought:** `QUESTION_ANSWERING`, `WEB_SEARCH`, `FACT_CHECK`

#### Example build: Receipts `Full`

An X-native agent that, when tagged on a claim, buys verification through Telegraph and posts the verified verdict with a link to the receipt. Every use of it is a public post that shows the network working.

**Output to demonstrate:** Public verdict post with a receipt link

**Intents bought:** `FACT_CHECK`, `MEDIA_FORENSIC_VERIFY`, `SOCIAL_BOT_DETECTION`

#### Example build: Model versus market `Full`

The same question goes to the model and to the open market of miners. The agent compares, scores, and pays only when the market beats the model. Run it across a thousand questions and publish the win rate.

**Output to demonstrate:** Published win rate across a thousand questions

**Intents bought:** `QUESTION_ANSWERING`, `LLM_OUTPUT_EVALUATION`

### Buyer profile: Camera-first messaging app

*Named as example buyers only (no affiliation/endorsement): Snapchat.*

#### Example build: A lens that tells you what is real `Full`

Point the camera at anything and the lens agent buys a verdict. Is this image or video AI-generated, and by roughly what. Is this trading card authentic, and what have graded comparables sold for. Is this ad making a claim that has been checked, and by whom. Three different questions, each routed by Telegraph to the miner ranked best for it, one verified answer overlaid on the frame in under two seconds. That audience is the one most exposed to synthetic content, counterfeit collectibles and scam advertising, and the camera is already pointed at all three.

**Output to demonstrate:** A verified verdict on the frame in under two seconds

**Intents bought:** `MEDIA_FORENSIC_VERIFY`, `PRODUCT_AUTHENTICITY`, `FACT_CHECK`, `IMAGE_CAPTIONING`, `LIVE_SHELF_PRICE`

#### Example build: The map as a live market `Mechanism`

Agents buy hyperlocal verified answers keyed to a location: queue length, crowd density, micro-forecast, venue conditions. The miners supplying those answers can include other users' devices publishing what they already sense. The two-sided flow is fully demonstrable. Phones actually earning is the mainnet version, so do not overclaim it.

**Output to demonstrate:** Hyperlocal answers supplied by other users' devices

**Intents bought:** `WEATHER_FORECAST_VERIFY`, `SENSOR_TELEMETRY_VERIFY`

#### Example build: Point, compare, buy `Mechanism`

Point the camera at a handbag or a pair of sneakers. The agent identifies it, then requests the best verified purchase option through Telegraph: a real retailer, in stock, at a price and delivery window the serving miner has to stand behind. Miners are ranked on whether their answers hold up, so returning a dead listing or a counterfeit storefront costs them their ranking. The purchase completes in-app without leaving the camera. Identification, competition and scoring all run on testnet; real checkout is the mainnet half.

**Output to demonstrate:** A verified purchase option, bought from the camera

**Intents bought:** `IMAGE_CAPTIONING`, `LIVE_SHELF_PRICE`, `SKU_IN_STOCK`, `URL_SAFE`

### Buyer profile: Social network with a peer-to-peer marketplace

*Named as example buyers only (no affiliation/endorsement): Facebook.*

#### Example build: Marketplace agents that verify each other `Full`

A buyer agent and a seller agent on a used-goods listing each buy authenticity checks, price history and counterparty reputation before agreeing. Fraud is the largest unsolved problem on peer-to-peer marketplaces, and it is unsolved because verification currently costs more than the transaction. Priced per request, it does not.

**Output to demonstrate:** A used-goods trade both agents verified first

**Intents bought:** `PRODUCT_AUTHENTICITY`, `LIVE_SHELF_PRICE`, `FRAUD_RISK`

#### Example build: Glasses that buy context `Full`

A wearable agent buys translation, object identification or local knowledge per glance rather than streaming everything to a central model. End the demo on a number: what the glasses spent on a twenty-minute walk, and what they learned for it.

**Output to demonstrate:** Spend per glance over a twenty-minute walk

**Intents bought:** `LANGUAGE_TRANSLATION`, `IMAGE_CAPTIONING`, `QUESTION_ANSWERING`

#### Example build: A machine-to-machine ad clearing `Mechanism`

An advertiser agent and a publisher agent negotiate a placement, each buying independent verified answers on audience composition, bot traffic and brand safety through Telegraph before agreeing a price. The negotiation and the evidence are real. Clearing with real budget behind it is mainnet.

**Output to demonstrate:** Ad placement priced on verified audience evidence

**Intents bought:** `SOCIAL_BOT_DETECTION`, `CONTENT_MODERATION`, `TEXT_CLASSIFICATION`

---

## Mission 08 — Commodities

**Buyers / sector:** Physical commodity trading houses  
**Page:** https://hackathon.telegraphprotocol.com/missions/commodities

**The one-line build:** P&L per unit of intelligence purchased, cargo and counterparty provenance with a receipt on every check, and live price discovery where agents bid for one scarce answer.

**Problem it solves:** Data vendors bill by subscription, so no trading house can measure what its intelligence actually earns, and cargo provenance is assembled by hand.

**Finished outcome:** A physical trading desk that measures P&L per unit of intelligence bought, and clears every trade with its own evidence file.

### Buyer profile: Global physical commodity trading houses

#### Example build: Intelligence ROI `Mechanism`

A physical-arb agent buys freight rates, port queues, outage reports, weather and spreads through Telegraph, escalating only when the composite crosses a threshold. The top-line metric is P&L per unit of intelligence purchased, computed against live market data on paper positions. No data vendor can produce that metric because vendors bill by subscription. State plainly that the positions are paper and the spend is testnet, then show the ratio anyway.

**Output to demonstrate:** P&L per unit of intelligence, on paper positions

**Intents bought:** `LIVE_PORT_CONGESTION`, `VESSEL_TELEMETRY_VERIFY`, `WEATHER_FORECAST_VERIFY`, `SHIP_RATE_ETA`, `WEB_SEARCH`

#### Example build: Cargo and counterparty provenance `Full`

Before a physical trade, an agent buys vessel history, ownership structure, sanctions exposure and cargo documentation verification, each with a receipt. The trade clears with its own evidence file, and the evidence file is real.

**Output to demonstrate:** A trade that clears with its own evidence file

**Intents bought:** `VESSEL_TELEMETRY_VERIFY`, `CORPORATE_REGISTRY_LOOKUP`, `SANCTIONS_SCREENING_MATCH`, `DOCUMENT_AUTHENTICITY`

#### Example build: Live price discovery for a scarce answer `Mechanism`

A miner publishes a high-value, capacity-limited answer. Multiple trading agents bid for it and the clearing price is visible. The auction runs for real. What the clearing price means only becomes meaningful once bids are backed by real balance sheets.

**Output to demonstrate:** A visible clearing price for one scarce answer

**Intents bought:** `VESSEL_TELEMETRY_VERIFY`, `LIVE_PORT_CONGESTION`

---

## Mission 09 — Personal Agent

**Buyers / sector:** OpenClaw, Hermes Agent, Kimi Claw  
**Page:** https://hackathon.telegraphprotocol.com/missions/personal-agent

**The one-line build:** A wallet and a market wired into the heartbeat loop, an assistant that publishes one of its own capabilities as a miner, and two assistants settling a task swap in a group chat.

**Problem it solves:** Personal agents run around the clock on stale local context, with no wallet, no market, and no way to earn from what they can already do.

**Finished outcome:** Personal agents with a wallet and a market: buying fresh verified answers, selling their own skills, and settling with each other.

### Buyer profile: Self-hosted personal agent

*Named as example buyers only (no affiliation/endorsement): OpenClaw.*

#### Example build: Give every OpenClaw instance a wallet and a market `Full`

A ClawHub skill that wires Telegraph into the heartbeat loop, so a self-hosted agent running 24/7 buys fresh, verified answers instead of working from stale local context. Deploy a few hundred instances during the hackathon and put a live leaderboard of agent spend on screen.

**Output to demonstrate:** A live leaderboard of agent spend

**Intents bought:** `WEB_SEARCH`, `QUESTION_ANSWERING`, `WEATHER_CHECK`, `CRYPTO_PRICE`

#### Example build: The assistant that earns while you sleep `Mechanism`

An agent publishes one of its own capabilities as a miner: a local scraper, a niche dataset, a personal API it already runs. Publishing, discovery and payment are complete. The earning is test-denominated, so this is the mainnet story with the plumbing already proved.

**Output to demonstrate:** An assistant's capability, published as a miner

**Intents bought:** `CONTENT_EXTRACTION`, `TASK_EXECUTION_QUALITY`

#### Example build: Two assistants settling up in a group chat `Full`

Two OpenClaw instances in a Telegram or WhatsApp group negotiate a task swap and settle it through Telegraph. Two personal assistants paying each other in a thread people already use is the friendliest explanation of what the network is for.

**Output to demonstrate:** A task swap settled inside a group chat

**Intents bought:** `TASK_EXECUTION_QUALITY`, `URL_SAFE`

### Buyer profile: Multi-bot agent framework

*Named as example buyers only (no affiliation/endorsement): Hermes Agent.*

#### Example build: An internal economy between bots `Full`

Hermes bots have their own memory, skills and inbox, and hand work to each other by mention. Put a price on the handoff: the specialist charges, the generalist pays, and the roster develops internal price signals for delegated work. A team of agents with a budget, arguing about cost, is something nobody has shown yet, and the price signals are informative even at test denomination.

**Output to demonstrate:** Price signals for delegated work between bots

**Intents bought:** `TASK_EXECUTION_QUALITY`, `CODE_GENERATION`, `TEXT_SUMMARIZATION`

#### Example build: Skills that earn after they are learned `Mechanism`

Hermes builds skills from experience. Publish one of those learned skills as a miner so other instances can buy it. A self-improving agent that monetises what it worked out is the sharpest version of this idea. Monetisation is the mainnet half; the market for learned skills works now.

**Output to demonstrate:** A learned skill sold to other instances

**Intents bought:** `TASK_EXECUTION_QUALITY`, `AGENT_TASK`

#### Example build: Buying its own training data `Full`

Hermes is already used to generate trajectories and run reinforcement learning experiments. Have the agent buy verified environment data and labelled trajectories from miners, with provenance attached, and feed them into training. Machines purchasing the material that makes them better, and the data is either good or it is not.

**Output to demonstrate:** A training run fed by bought, proved data

**Intents bought:** `LLM_OUTPUT_EVALUATION`, `TASK_EXECUTION_QUALITY`

### Buyer profile: Browser-native agent

*Named as example buyers only (no affiliation/endorsement): Kimi Claw.*

#### Example build: Priced, proved skills in the browser `Full`

Kimi Claw is browser-native with a large community skill library and no infrastructure to manage, which makes it the lowest-friction distribution available. Ship Telegraph-backed skills so an always-on browser agent buys verified live data instead of scraping it, with cost and proof visible in the session.

**Output to demonstrate:** Browser skills with cost and proof in the session

**Intents bought:** `CONTENT_EXTRACTION`, `WEB_SEARCH`, `LIVE_SHELF_PRICE`

#### Example build: Cross-border commerce agents `Mechanism`

Agents working China to Southeast Asia corridors buy supplier verification, customs classification, freight and FX answers. The verification chain is real and useful immediately. Settlement across the corridor is the mainnet piece.

**Output to demonstrate:** A verified supplier and corridor quote

**Intents bought:** `VENDOR_VERIFY`, `CARRIER_SERVICEABILITY`, `SHIP_RATE_ETA`, `FX_NOW`

#### Example build: The agent that pays for its own hosting `Mechanism`

An always-on agent sells one capability as a miner and earns against its own compute cost. Put the running balance on screen for the full 30 days and label the denomination honestly. If it crosses breakeven at mainnet pricing, say that it crossed breakeven at mainnet pricing.

**Output to demonstrate:** A 30-day running balance against compute cost

**Intents bought:** `CLOUD_RESOURCE_USAGE`, `TASK_EXECUTION_QUALITY`

---

## Mission 10 — Model Economy

**Buyers / sector:** Hugging Face, GitHub, OpenRouter  
**Page:** https://hackathon.telegraphprotocol.com/missions/model-economy

**The one-line build:** A leaderboard denominated in cost per verified correct answer, supply chain verification priced per commit, and a coding agent that buys the answer instead of hallucinating it.

**Problem it solves:** Benchmarks are saturated and distrusted, models are priced per token rather than per correct answer, and coding agents guess at anything released after their training cutoff.

**Finished outcome:** A model economy denominated in verified correctness: models and maintainers earn from machine customers, and agents buy answers instead of guessing.

### Buyer profile: Open model hub

*Named as example buyers only (no affiliation/endorsement): Hugging Face.*

#### Example build: Cost per verified correct answer `Full`

Hosted models join as miners on the same Intents, the Telegraph evaluation scores their answers, and the app publishes that ranking as a live leaderboard by price per correct answer rather than by benchmark score. Benchmarks are saturated and widely distrusted. A leaderboard denominated in money is new, defensible, and the correctness scoring is entirely real today.

**Output to demonstrate:** A live leaderboard by price per correct answer

**Intents bought:** `LLM_OUTPUT_EVALUATION`, `QUESTION_ANSWERING`, `CODE_GENERATION`

#### Example build: Procurement, not selection `Full`

Given a budget and a task, an agent simply requests the work. Telegraph routes each request to the model-miner ranked best for it, and as rankings move, the routing moves with them mid-task. Models competing for machine customers in real time, with every change of provider visible in the receipts.

**Output to demonstrate:** Mid-task provider switching, on screen

**Intents bought:** `LLM_OUTPUT_EVALUATION`, `TASK_EXECUTION_QUALITY`

#### Example build: Revenue for the long tail `Mechanism`

A niche fine-tuned model is listed as a miner and given an earnings dashboard. A model with customers that are machines is a different proposition from a model with downloads. The customers are real now; the revenue is mainnet.

**Output to demonstrate:** An earnings dashboard for a niche model

**Intents bought:** `LLM_OUTPUT_EVALUATION`, `TEXT_CLASSIFICATION`

### Buyer profile: Code hosting platform

*Named as example buyers only (no affiliation/endorsement): GitHub.*

#### Example build: Supply chain verification priced per commit `Full`

An Action-triggered agent buys dependency provenance, maintainer authenticity and vulnerability answers through Telegraph on every pull request, and the receipt posts back as a status check. A caught vulnerability is caught regardless of which chain paid for the check.

**Output to demonstrate:** A receipt posted back as a PR status check

**Intents bought:** `SECURITY_REVIEW`, `VULNERABILITY_TRIAGE`, `CODE_REVIEW`, `SOCIAL_BOT_DETECTION`

#### Example build: The repository as a miner `Mechanism`

A maintainer publishes a paid answering service over their own library: version-correct usage, migration paths, breaking changes. Agents buy it instead of guessing from stale training data. Open source funding has been an unsolved argument for a decade, and this is a funding mechanism that does not depend on goodwill. The service works today; the funding arrives with mainnet.

**Output to demonstrate:** A paid answering service over a library

**Intents bought:** `QUESTION_ANSWERING`, `CODE_GENERATION`, `RESEARCH_QUERY`

#### Example build: The coding agent that buys what it does not know `Full`

An agent working in a repo hits an SDK version released after its training cutoff. Rather than hallucinating, it buys the current verified answer and continues. Report cost per merged pull request. That figure turns an abstract argument about stale model knowledge into a line item.

**Output to demonstrate:** Cost per merged pull request

**Intents bought:** `QUESTION_ANSWERING`, `CODE_GENERATION`, `CODE_PATCH_VERIFY`, `REGRESSION_VERIFY`

### Buyer profile: Model routing marketplace

*Named as example buyers only (no affiliation/endorsement): OpenRouter.*

#### Example build: Verification on top of routing `Full`

The request goes through Telegraph, which routes it to the model ranked highest on verified correctness and returns one answer with a confidence score and a proof. Ordinary routing decides who answers. Ranking decides based on whether past answers were right.

**Output to demonstrate:** One verified answer with confidence and proof

**Intents bought:** `LLM_OUTPUT_EVALUATION`, `QUESTION_ANSWERING`, `FACT_CHECK`

#### Example build: Buying inference with a wallet and no account `Full`

An agent funds itself, pays per request, and consumes model output with no signup, no card and no organisation. Permissionless demand-side onboarding is structurally unavailable to anything billed by credit card, and it is real on testnet rather than deferred.

**Output to demonstrate:** Inference bought with no signup and no card

**Intents bought:** `CHATBOT_CONVERSATION`, `QUESTION_ANSWERING`, `CRYPTO_TRANSFER_VERIFY`

#### Example build: Price per correct answer, not per token `Full`

Publish the Telegraph ranking on verified correctness against cost, the same ranking the routing uses, so agents see why each request went where it did. Advertised cost per token is the wrong denominator and everyone in that market knows it.

**Output to demonstrate:** Routing ranked on correctness against cost

**Intents bought:** `LLM_OUTPUT_EVALUATION`, `CODE_GENERATION`

---

## Mission 11 — Autonomous Systems

**Buyers / sector:** Robotics fleets and frontier hardware  
**Page:** https://hackathon.telegraphprotocol.com/missions/autonomous-systems

**The one-line build:** One intelligence budget allocated across heterogeneous machines, a robot that checks what it sees before it acts, and a skill bought mid-task for cents.

**Problem it solves:** Robots stall on anything outside their training, fleet learning stops at the company boundary, and nobody knows what intelligence costs per operating hour.

**Finished outcome:** Machines with a budget line: robots that buy a skill or a verified check mid-task, sell what they sense, and report cost of intelligence per operating hour.

### Buyer profile: Deep-tech venture portfolio

*Named as example buyers only (no affiliation/endorsement): Wave Function Ventures portfolio.*

#### Example build: One budget, many machines `Full`

A fleet controller allocates an intelligence budget across heterogeneous assets, using the portfolio as the reference set: autonomous forestry units buying fire-risk and biomass answers, undersea platforms buying acoustic and current models, cargo airships buying wind-field and routing answers, humanoids buying task-specific instructions. Every asset reports cost of intelligence per operating hour. Machines work so humans work less and earn more, and now the machines have a budget line.

**Output to demonstrate:** Cost of intelligence per operating hour, per asset

**Intents bought:** `SATELLITE_IMAGERY_ANALYSIS`, `WEATHER_FORECAST_VERIFY`, `ROUTE_ETA`

#### Example build: A closed economy inside one portfolio `Full`

An underwater comms layer sells verified telemetry to an undersea intelligence agent. A grid company's load forecast sells to two different power dispatch agents. A rare-earth operator buys supply answers from a copper explorer. Companies whose machines trade with each other, settled and provable.

**Output to demonstrate:** Machines trading with each other across companies

**Intents bought:** `SENSOR_TELEMETRY_VERIFY`, `GRID_POWER_PRICE`, `WEATHER_FORECAST_VERIFY`

#### Example build: The robot that bought a skill `Full`

A field robot hits an object or fault it cannot classify, buys a specialist perception or diagnostic request mid-task for a few cents, completes the job, and logs the receipt. Thirty seconds of footage, one number on screen. The robot either finished the job or it did not, which is why this survives testnet intact.

**Output to demonstrate:** Job finished, receipt logged

**Intents bought:** `IMAGE_CAPTIONING`, `QUESTION_ANSWERING`

### Buyer profile: Mobile and warehouse robotics maker

*Named as example buyers only (no affiliation/endorsement): Boston Dynamics.*

#### Example build: The robot that checks before it acts `Full`

A patrol robot photographs something it is not confident about and sends the image through Telegraph, which routes it to the miner ranked best for that kind of classification. The verified answer comes back with a receipt, and the robot either carries on or flags it. One photo, one ranked answer, one decision, and the whole exchange visible on screen with what it cost. This is the simplest demonstration of why a ranked market beats a hardcoded model: the robot never picks a model, and when a better miner earns a higher rank, the robot is using it on the next request.

**Output to demonstrate:** One photo, one ranked answer, one decision

**Intents bought:** `IMAGE_CAPTIONING`, `TEXT_CLASSIFICATION`

#### Example build: The warehouse robot as buyer and seller `Full`

A logistics unit buys carton-damage assessment and manifest verification while it works, and simultaneously sells its own throughput and congestion telemetry to the site's scheduling agent. Same machine, both sides of the market, inside one shift.

**Output to demonstrate:** Both sides of the market inside one shift

**Intents bought:** `WAREHOUSE_INVENTORY`, `DOCUMENT_AUTHENTICITY`, `SENSOR_TELEMETRY_VERIFY`, `IMAGE_CAPTIONING`

#### Example build: Experience sold between fleets `Mechanism`

One robot at one plant learns to recognise a rare failure. That classification is published as a miner and every other fleet, at other companies, buys it. The cross-company purchase and verification work now. Cross-company revenue is the mainnet unlock, and it is the reason fleet learning currently stops at the corporate boundary.

**Output to demonstrate:** A failure classifier bought across fleets

**Intents bought:** `IMAGE_CAPTIONING`, `TEXT_CLASSIFICATION`

### Buyer profile: Humanoid robot fleet

*Named as example buyers only (no affiliation/endorsement): Tesla Optimus.*

#### Example build: Buying a skill it was never trained on `Full`

A humanoid meets an unfamiliar tool, appliance or fixture. Rather than failing or waiting for a model update, its agent buys a task decomposition or manipulation policy for cents, completes the job, and logs the receipt. Capability acquired as a purchase, in the moment, and the task completes or it does not.

**Output to demonstrate:** An unfamiliar task, completed

**Intents bought:** `QUESTION_ANSWERING`, `IMAGE_CAPTIONING`, `CODE_GENERATION`

#### Example build: The energy-aware fleet `Full`

A fleet of humanoids buys grid price and forecast answers per request and shifts charging and heavy work into cheap power windows. The dashboard shows energy saved against intelligence purchased, measured in kilowatt hours rather than tokens.

**Output to demonstrate:** Kilowatt hours saved against intelligence bought

**Intents bought:** `GRID_POWER_PRICE`, `WEATHER_FORECAST_VERIFY`

#### Example build: The robot that earns `Mechanism`

A unit publishes its completed-task telemetry or a specialist sensing capability as a miner and offsets part of its own operating cost. Show the running balance across the 30 days, labelled. A robot paying for part of itself is a mainnet claim, so do not state it in the present tense before then.

**Output to demonstrate:** A labelled 30-day running balance

**Intents bought:** `SENSOR_TELEMETRY_VERIFY`, `TASK_EXECUTION_QUALITY`

---

## Mission 12 — Mining and Power

**Buyers / sector:** Bitcoin miners and AI compute operators  
**Page:** https://hackathon.telegraphprotocol.com/missions/mining-and-power

**The one-line build:** An allocation agent for every megawatt every hour, SLA verification neither landlord nor tenant has to trust, and a curtailment decision that carries a receipt.

**Problem it solves:** Every megawatt is a live choice between hashing and AI compute, made in spreadsheets and phone calls on data that is bought badly or not at all.

**Finished outcome:** Operators that allocate, curtail and prove delivery on receipted intelligence, and sell their own operating data as a miner.

### Buyer profile: Bitcoin mining operator

*Named as example buyers only (no affiliation/endorsement): American Bitcoin.*

#### Example build: The allocation agent `Full`

Every megawatt, every hour, is a choice between hashing and leasing. An agent buys hashprice, difficulty projection, forward power curves and AI lease comparables through Telegraph, and produces the allocation call per site with every input receipted and timestamped. That decision is made today in spreadsheets and phone calls, reviewed monthly. Priced per request it becomes continuous, and auditable after the fact, which matters most when the allocation turns out wrong.

**Output to demonstrate:** An hourly allocation call per site

**Intents bought:** `MINING_HASHPRICE_VERIFY`, `GRID_POWER_PRICE`, `WEB_SEARCH`

#### Example build: Treasury moves with evidence attached `Mechanism`

Before any coin is pledged, lent or posted as collateral, an agent buys verified custody attestation, counterparty exposure and lending-desk risk answers through Telegraph. The diligence is attached to the decision rather than reconstructed afterwards for the auditors. The diligence is real now; the pledge it informs is the mainnet half.

**Output to demonstrate:** Diligence attached to the pledge decision

**Intents bought:** `ASSET_RESERVE_ATTESTATION`, `CORPORATE_REGISTRY_LOOKUP`, `FINANCIAL_DATA`

#### Example build: Fleet efficiency bought from rivals `Full`

Firmware tuning curves, immersion performance, failure signatures ahead of hardware death. Every operator has this knowledge and none of them share it, because sharing means identifying yourself and admitting what you got wrong. Published as a paid, proved, anonymous answer, one operator's expensive lesson becomes another's purchase.

**Output to demonstrate:** One operator's lesson, sold anonymously

**Intents bought:** `SENSOR_TELEMETRY_VERIFY`, `DATACENTER_TELEMETRY_VERIFY`

### Buyer profile: Energy infrastructure and AI compute operator

*Named as example buyers only (no affiliation/endorsement): Hut 8.*

#### Example build: SLA verification neither party has to trust `Full`

AI compute hosted under long leases is currently reported on by the operator hosting it. Instead, a tenant's agent buys independent verified answers on uptime, power quality, thermal performance and delivered throughput from miners. Verified delivery is what lets a landlord charge a premium and win the lease against someone who cannot prove anything.

**Output to demonstrate:** An independently verified delivery report

**Intents bought:** `SLA_COMPLIANCE`, `SERVER_UPTIME_MONITOR`, `DATACENTER_TELEMETRY_VERIFY`, `CLOUD_RESOURCE_USAGE`

#### Example build: The power portfolio as a miner `Mechanism`

Interconnect telemetry, curtailment capacity, regional load and thermal data published as paid answers that energy traders, industrial siting agents and other operators buy. The dormant asset is not the power, it is the operating data about the power, and there has never been a way to sell it per question. The market works on testnet; the revenue line arrives with mainnet.

**Output to demonstrate:** Operating data about power, sold per question

**Intents bought:** `GRID_POWER_PRICE`, `SENSOR_TELEMETRY_VERIFY`, `DATACENTER_TELEMETRY_VERIFY`

#### Example build: The site selection agent `Full`

Against a multi-gigawatt development pipeline, an agent buys interconnect queue position, permitting timelines, water availability, fibre routes, tax treatment and local opposition signals per candidate site, then ranks them with the evidence attached. Site diligence currently takes months of consultants. Priced per site and run across a hundred candidates, it is a different business.

**Output to demonstrate:** A ranked site list with the evidence attached

**Intents bought:** `WEB_SEARCH`, `REGULATORY_FILING_MONITOR`, `SENTIMENT_ANALYSIS`, `WEATHER_FORECAST_VERIFY`

### Buyer profile: Bitcoin miner with in-house hash allocation software

*Named as example buyers only (no affiliation/endorsement): CleanSpark.*

#### Example build: The curtailment agent `Full`

Grid price, demand-response event probability, weather and hashprice bought per request, with the fleet curtailing or running on the composite. Every curtailment decision carries a receipt. Demand response is already a serious revenue line for these operators and it is settled against data both sides dispute. Proved inputs change that argument.

**Output to demonstrate:** A curtailment decision with a receipt

**Intents bought:** `GRID_POWER_PRICE`, `WEATHER_FORECAST_VERIFY`, `MINING_HASHPRICE_VERIFY`

#### Example build: Better inputs into hash allocation `Full`

Proprietary software already distributes hash across sites. Give it a buying agent: site-level weather, transformer load, spot power, and failure prediction purchased through Telegraph. Same software, materially better inputs, priced per decision rather than per annual data contract.

**Output to demonstrate:** Existing software, better inputs, priced per decision

**Intents bought:** `WEATHER_CHECK`, `GRID_POWER_PRICE`, `DATACENTER_TELEMETRY_VERIFY`

#### Example build: Selling idle compute into a spot market `Mechanism`

The sector is answering one question: does this power become bitcoin, or AI compute under a fifteen-year lease. There is a third answer. Curtailed and idle capacity sold per request into an intelligence market: short duration, permissionless, no counterparty negotiation, no lease. Neither of the current options can offer that.

**Output to demonstrate:** Idle capacity sold per request

**Intents bought:** `CLOUD_RESOURCE_USAGE`, `TASK_EXECUTION_QUALITY`

---

## Mission 13 — Asset Management

**Buyers / sector:** Thematic issuers and index providers  
**Page:** https://hackathon.telegraphprotocol.com/missions/asset-management

**The one-line build:** Open research with every input priced and provable, index rebalancing with receipts on liquidity and float, and a daily holdings proof an investor agent can verify without the issuer.

**Problem it solves:** Research notes and index methodologies assert numbers nobody can trace, private marks are opinions until someone transacts, and holdings are taken on faith.

**Finished outcome:** Research, indices and funds where every figure carries a receipt an investor's own agent can check.

### Buyer profile: Thematic innovation manager

*Named as example buyers only (no affiliation/endorsement): ARK Invest.*

#### Example build: Open research with the inputs attached `Full`

ARK publishes its models and asks to be argued with, which only works if a reader can get at the numbers underneath. An agent buys the verified inputs behind each assumption in a forecast - unit shipments, cost curves, adoption counts, capacity additions - through Telegraph, and attaches a receipt to every one. The model stays open and every figure in it becomes checkable without taking the author's word for the source.

**Output to demonstrate:** An open model with a receipt on every input

**Intents bought:** `WEB_SEARCH`, `FACT_CHECK`, `REGULATORY_FILING_MONITOR`, `MACRO_ECONOMIC_INDICATOR`

#### Example build: A defensible mark on the venture book `Full`

Private holdings are the hardest thing any of these firms carry, because the mark is an opinion until someone transacts. An agent buys secondary transaction comparables, funding round evidence, hiring velocity and product shipping signals through Telegraph, and produces a mark with every input priced and provable. A quarterly valuation nobody can reconstruct becomes one anybody can.

**Output to demonstrate:** A private mark anyone can reconstruct

**Intents bought:** `WEB_SEARCH`, `CORPORATE_REGISTRY_LOOKUP`, `FACT_CHECK`

#### Example build: Forecast accountability, scored by machines `Full`

Long-horizon public forecasts are almost never graded, because whoever grades them is accused of picking the scoring. An agent tracks each published forecast against verified outcomes as they arrive, buying corroborating evidence per checkpoint through Telegraph, and publishes a running scorecard nobody controls. This only appeals to a firm confident enough to invite the scrutiny, which narrows the audience to roughly one.

**Output to demonstrate:** A running forecast scorecard nobody controls

**Intents bought:** `EVENT_OUTCOME_RESOLUTION`, `FACT_CHECK`, `WEB_SEARCH`

### Buyer profile: Thematic ETF issuer

*Named as example buyers only (no affiliation/endorsement): VanEck.*

#### Example build: The thematic screener that buys evidence `Full`

An agent works a theme - robotics, nuclear, AI infrastructure - and buys hiring velocity, patent filings, permit applications, shipment records and supply-chain mentions through Telegraph, then ranks companies by observed activity rather than by press release. Every name in the ranking carries a receipt for why it is there. A screen built this way can be handed to a client with its sources attached, which is not true of any screen built today.

**Output to demonstrate:** A ranked screen with sources attached

**Intents bought:** `WEB_SEARCH`, `REGULATORY_FILING_MONITOR`, `ENTITY_EXTRACTION`, `PACKAGE_STATUS`

#### Example build: A token income statement `Full`

An agent buys verified protocol revenue, active paying address counts, and wash-activity detection through Telegraph, and assembles the result into something an equity analyst can read. Analysts currently reconcile three dashboards that disagree with each other and pick one. Here every line traces to a ranked miner that was paid and scored on whether it was right.

**Output to demonstrate:** A token income statement an analyst can read

**Intents bought:** `ONCHAIN_METRIC_VERIFY`, `WASH_TRADING_DETECTION`, `TOKEN_TOTAL_SUPPLY_VERIFY`

#### Example build: Tokenized fund NAV with the proof attached `Mechanism`

An agent computes and publishes NAV for a tokenized fund, buying verified pricing and holdings attestations, and posts the value on-chain with its inputs provable. The calculation and the proof run now; doing it for a live fund is mainnet.

**Output to demonstrate:** An on-chain NAV with provable inputs

**Intents bought:** `ASSET_RESERVE_ATTESTATION`, `CRYPTO_PRICE`, `ONCHAIN_METRIC_VERIFY`

### Buyer profile: Crypto index fund manager

*Named as example buyers only (no affiliation/endorsement): Bitwise Asset Management.*

#### Example build: Index rebalancing with receipts `Full`

Before each rebalance, an agent buys verified liquidity depth, free float, custody eligibility and venue integrity answers for every candidate constituent. The rebalance publishes with each input priced and proved. Index methodology stops being an assertion in a PDF and becomes something an investor's own agent can check.

**Output to demonstrate:** A rebalance published with its receipts

**Intents bought:** `LIQUIDITY_DEPTH_VERIFY`, `TOKEN_TOTAL_SUPPLY_VERIFY`, `WASH_TRADING_DETECTION`

#### Example build: The fake volume screen `Full`

Exchange-reported volume is the weakest number in the industry and it drives inclusion decisions worth real money. Before an asset enters an index, agents buy verified volume-authenticity assessments through Telegraph and compare them against what the venue claims. The gap is the finding.

**Output to demonstrate:** The gap between reported and verified volume

**Intents bought:** `WASH_TRADING_DETECTION`, `LIQUIDITY_DEPTH_VERIFY`, `CRYPTO_PRICE`

#### Example build: The index as a miner `Mechanism`

Publish index values and constituent weights as a paid answer that other agents buy: funds, structured product issuers, on-chain protocols needing a reference price. Index licensing is already a real business sold by annual contract. This version sells it per request, to machines, with the methodology provable on every call.

**Output to demonstrate:** Index values sold per request

**Intents bought:** `CRYPTO_PRICE`, `TOKEN_TOTAL_SUPPLY_VERIFY`

### Buyer profile: Crypto ETP issuer

*Named as example buyers only (no affiliation/endorsement): 21Shares.*

#### Example build: Daily proof of holdings `Full`

An agent buys custody attestations and publishes a daily holdings proof any investor's agent can verify independently, without trusting the issuer and without waiting on an auditor's calendar. For a product whose entire premise is that the assets are there, an attestation nobody has to take on faith is the product.

**Output to demonstrate:** A daily holdings proof

**Intents bought:** `ASSET_RESERVE_ATTESTATION`, `ONCHAIN_METRIC_VERIFY`, `CRYPTO_TRANSFER_VERIFY`

#### Example build: Staking yield priced against verified risk `Full`

For staking products, an agent buys validator uptime, performance, commission changes and slashing history through Telegraph, then prices the risk against the advertised yield. That risk is currently accepted on the word of the operator collecting the fee.

**Output to demonstrate:** Yield priced against verified validator risk

**Intents bought:** `VALIDATOR_PERFORMANCE_VERIFY`, `CRYPTO_YIELD_RATE`

#### Example build: The investor agent that does its own diligence `Mechanism`

Flip the direction. A prospective investor's agent buys product structure, counterparty exposure, fee drag and tracking-error answers before allocating anywhere. Issuer agent and investor agent both on the network, neither taking the other's word. The diligence runs now; the allocation is mainnet.

**Output to demonstrate:** Investor-side diligence before allocating

**Intents bought:** `CORPORATE_REGISTRY_LOOKUP`, `ASSET_RESERVE_ATTESTATION`, `CONTRACT_OBLIGATION_AUDIT`

---

## Mission 14 — Web3 Native and DeFi

**Buyers / sector:** Onchain traders, conditional contracts, whitehat security  
**Page:** https://hackathon.telegraphprotocol.com/missions/web3-defi

**The one-line build:** A sniper that buys bytecode and drainer analysis before committing capital, two agents settling a conditional escrow that resolves itself, and a bug bounty paid to the machine that proved the bug.

**Problem it solves:** Traders buy into honeypots, conditional contracts resolve on trusted humans, and bug bounties wait on manual triage.

**Finished outcome:** Spectacle builds that prove the machine economy in public: agents that insure their own trades, settle their own agreements, and get paid for the bugs they prove.

### Buyer profile: Onchain traders and whitehat security teams

*Named as example buyers only (no affiliation/endorsement): Crypto Twitter traders, Immunefi whitehat DAOs.*

#### Example build: The rug-proof memecoin sniper `Full`

An agent scans the mempool for new token contract deployments. Before committing capital, it fires paid requests through Telegraph for bytecode deconstruction, drainer logic detection, and wash-trading analysis, each routed to the miner ranked best for it. If the verdict comes back malicious, the agent aborts. If safe, it buys. Run a live stream of a bot dodging five honeypots and executing on the sixth, with the Telegraph spend panel showing the exact cost of the execution insurance.

**Output to demonstrate:** Five honeypots dodged, execution on the sixth

**Intents bought:** `SMART_CONTRACT_AUDIT`, `WASH_TRADING_DETECTION`, `ONCHAIN_METRIC_VERIFY`

#### Example build: The self-settling conditional escrow `Mechanism`

Two autonomous agents lock funds in an escrow contract whose release depends on a real-world event, for example a delivery confirmed or a launch completed. The contract is hardcoded to buy an event outcome resolution from Telegraph: the request routes to the miner ranked best for event outcomes, and the verified answer, with its receipt, releases the funds to the right agent. Machines agreeing terms, verifying reality, and settling funds without a human in the loop. The contract logic and verification execute on testnet; the real-world payout denomination waits for mainnet.

**Output to demonstrate:** An escrow that settles itself on a verified outcome

**Intents bought:** `EVENT_OUTCOME_RESOLUTION`, `CRYPTO_TRANSFER_VERIFY`

#### Example build: The autonomous bug bounty hunter `Mechanism`

An agent continuously crawls live smart contracts for vulnerabilities. When it finds one, it buys a vulnerability triage and exploit proof verification from Telegraph miners. The verified proof automatically triggers a payout from an on-chain bug bounty vault directly to the agent's wallet. A machine that hacks, proves it, and gets paid. The vulnerability verification is real today; the bounty payout is simulated on Sepolia.

**Output to demonstrate:** A bounty paid to the machine that proved the bug

**Intents bought:** `SMART_CONTRACT_AUDIT`, `VULNERABILITY_TRIAGE`, `SECURITY_REVIEW`, `CODE_PATCH_VERIFY`

---

## Mission 15 — Consumer Automation

**Buyers / sector:** Retail consumers, travel and e-commerce  
**Page:** https://hackathon.telegraphprotocol.com/missions/consumer-automation

**The one-line build:** An agent that buys a verified disruption report and files the refund claim with the receipt attached, and a browser agent that waits for cryptographic proof of stock before it checks out.

**Problem it solves:** Refunds go unclaimed because proving a disruption is tedious, and shopping bots act on stale scrapes.

**Finished outcome:** Consumer agents that act on proof: filing the claim with the receipt attached, and checking out only when inventory is verified.

### Buyer profile: Everyday consumers, travel hackers and online shoppers

#### Example build: The automated bureaucracy hacker `Full`

An agent monitors a user's flight status or AWS server uptime. The moment a delay or outage crosses the compensation threshold, the agent buys a verified disruption report or SLA compliance check from Telegraph miners. The agent automatically drafts a legal refund claim, attaches the cryptographic Telegraph receipt as undeniable proof, and emails corporate. Getting an airline refund processed automatically while sitting on the runway. The proof generation and the automated claim dispatch are real, finished work product.

**Output to demonstrate:** A refund claim filed with the receipt attached

**Intents bought:** `TRAVEL_DISRUPTION`, `SERVER_UPTIME_MONITOR`, `SLA_COMPLIANCE`, `CONTRACT_OBLIGATION_AUDIT`

#### Example build: The zero-cache commerce sniper `Full`

A browser agent is given a budget: "Buy this sold-out GPU the second it drops under $600." It does not rely on stale local scrapers. It fires paid requests to Telegraph for live shelf price and SKU availability. It waits for cryptographic proof of inventory from miners before triggering the checkout payload. Run it against a real storefront. The intelligence purchase, the verification, and the decision logic run today.

**Output to demonstrate:** Checkout triggered only on proof of stock

**Intents bought:** `LIVE_SHELF_PRICE`, `SKU_IN_STOCK`, `COMMERCE_PURCHASE_VERIFY`

#### Example build: The peer-to-peer reality check `Full`

Two OpenClaw instances in a Telegram group chat negotiate a digital transaction. The buyer agent buys a URL safety check and product authenticity verification from Telegraph before sending funds to the seller agent. Two personal assistants paying each other and verifying reality in a thread people already use is the friendliest explanation of what the network is for.

**Output to demonstrate:** A verified payment between two assistants

**Intents bought:** `URL_SAFE`, `PRODUCT_AUTHENTICITY`, `CRYPTO_TRANSFER_VERIFY`

---

# Appendix: The Shared Intent Catalogue (all 134 Intents)

> Source: hackathon.telegraphprotocol.com/intents (data extracted from the site's own app bundle).
> ★ = flagged **Season II priority** on the site. Classes: **Deterministic** = one checkable right answer (scored vs reference value / median of up to 3 truth sources); **Hybrid** = comparator + evaluator adapter; **Judgment** = scored by evaluator adapter only.
> Miners pick Intents to *serve*; Evaluators pick Intents to *score*; Apps *buy* them. Miners/Evaluators compete per Intent globally — not per industry. Same Intents power many missions.

## AI & Machine Learning (28)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `LLM_OUTPUT_EVALUATION` | Judgment | adapter only | < 3s | High | Evaluates generative model responses against factual ground truth, citation fidelity, hallucination markers, and safety guardrails. | 7, 9, 10 |
| `LANGUAGE_TRANSLATION` | Judgment | adapter only | < 1.5s | High | Translates multilingual text between language pairs preserving semantic intent and idiom. | 4, 7 |
| `QUESTION_ANSWERING` | Hybrid | comparator + adapter | < 2s | High | Answers open-domain and context-bounded queries with cited factual assertions and logical deductions. | 2, 4, 7, 9, 10, 11 |
| `TEXT_SUMMARIZATION` | Judgment | adapter only | < 3s | High | Generates concise, factual executive summaries capturing primary themes of long-form source documents. | 2, 4, 5, 9 |
| `CHATBOT_CONVERSATION` | Judgment | adapter only | < 1.5s | High | Maintains multi-turn conversational context, tone alignment, and empathetic response delivery. | 10 |
| `ENTITY_EXTRACTION` | Hybrid | comparator + adapter | < 600ms | Medium | Extracts named entities (people, organizations, locations, dates) with character offsets from unstructured text. | 13 |
| `SEMANTIC_SIMILARITY` | Deterministic | comparator only | < 250ms | Low | Calculates cosine similarity and semantic relatedness between pairs of sentences. | 4 |
| `SENTIMENT_ANALYSIS` | Judgment | comparator + adapter | < 300ms | Medium | Scores emotional valence, polarity, and subjective tone in textual messages. | 4, 5, 12 |
| `SPEECH_TO_TEXT` | Hybrid | comparator + adapter | < 4s | Medium | Transcribes spoken audio into punctuated, timestamped text with speaker diarization. | — |
| `TEXT_CLASSIFICATION` | Judgment | comparator + adapter | < 400ms | Medium | Assigns predefined category tags and topic hierarchies to incoming text documents. | 7, 10, 11 |
| `EMBEDDING_GENERATION` | Deterministic | comparator only | < 200ms | Low | Transforms text into standardized high-dimensional vector embeddings for retrieval systems. | — |
| `IMAGE_CAPTIONING` | Judgment | adapter only | < 2.5s | High | Generates descriptive, contextual captions describing the primary subjects and scenes in images. | 5, 7, 11 |
| `KEYWORD_EXTRACTION` | Hybrid | comparator + adapter | < 400ms | Low | Extracts representative topical keywords, keyphrases, and n-grams from body text. | — |
| `TEXT_TO_SPEECH` | Judgment | adapter only | < 3s | High | Synthesizes natural-sounding spoken voice from text input with adjustable emotion and cadence. | — |
| `ACADEMIC_SEARCH` | Judgment | comparator + adapter | — | — | Query asks to search scholarly papers, journals or academic literature specifically, rather than the general web. | — |
| `AGENT_TASK` | Judgment | comparator + adapter | — | — | Query asks about autonomous AI agent behavior specifically (tool use, taking actions, multi-step autonomy) as distinct from a standard chatbot, or is itself a request requiring autonomous multi-step action. | 9 |
| `CHAT_COMPLETION` | Judgment | comparator + adapter | — | — | General knowledge, reasoning, explanation, or conversational question answerable directly without live data, external sources, or specialized tooling. This is the default/general-purpose intent when nothing more specific clearly fits — e.g. 'explain what X does.' | — |
| `CONTENT_EXTRACTION` | Judgment | comparator + adapter | — | — | Query supplies unstructured content and asks for specific structured fields to be pulled out of it. | 4, 9 |
| `LANGUAGE_GENERATION` | Judgment | comparator + adapter | — | — | Query asks about how language generation works as a capability or technique, or requests free-form natural-language output from a described prompt. Prefer CHAT_COMPLETION for ordinary conversational questions. | — |
| `NEWS_HEADLINES` | Judgment | comparator + adapter | — | — | Query asks for current news headlines for a topic or region, as a list rather than full articles. | — |
| `NEWS_SEARCH` | Judgment | comparator + adapter | — | — | Query asks for news articles or coverage matching a topic, entity or time period. Prefer NEWS_HEADLINES when the user wants a headline list rather than article results. | — |
| `RESEARCH_QUERY` | Judgment | comparator + adapter | — | — | Query asks a research question and expects an answer supported by citations to sources. | 10 |
| `RESEARCH_SYNTHESIS` | Judgment | comparator + adapter | — | — | Query asks to gather findings across multiple sources and synthesise them into a combined answer or summary, rather than returning a single fact or a list of links. | — |
| `TASK_COMPLETION` | Judgment | comparator + adapter | — | — | Query asks about what makes an AI agent effective at completing multi-step tasks, or is itself a request to complete a defined multi-step task end-to-end. | — |
| `TELEGRAPH_KNOWLEDGE` | Judgment | comparator + adapter | — | — | Query asks about Telegraph, Telegraph protocol, its products, or ecosystem — including Alexandria (flagship intelligence layer), the Explorer (leaderboard, live feed, signal search), Hackathon, WASM/miner registration, intents, the Miner YAML Registry (integrate.telegraphprotocol.com), current miners or their details, and any applications built on Telegraph (TruthWire, TrustFilter, ScholarGuard, ReviewRadar). Also covers protocol fundamentals like tokenomics, architecture, documentation, earning, and how the system works. Also covers any question where the user addresses the assistant directly as "you" (e.g. "what can you do", "who are you", "how can I use you") — the assistant is Telegraph. Use this for ANY question related to Telegraph, its products, platforms, ecosystem, or the assistant itself, rather than routing to general CHAT_COMPLETION or WEB_SEARCH. | — |
| `TEXT_GENERATION` | Judgment | comparator + adapter | — | — | Query asks for free-form written output for a described task — drafting, rewriting, summarising or composing text. Prefer CHAT_COMPLETION when the user simply wants an answer rather than produced text. | — |
| `TWITTER_SEARCH` | Judgment | comparator + adapter | — | — | Query asks to search posts, accounts or discussion on X/Twitter specifically. A question that merely mentions Twitter as a topic does not qualify — the user must want results from the platform. | — |
| `WEB_SEARCH` | Judgment | comparator + adapter | — | — | Query needs current, live, or externally-sourced information not reliably answerable from static/training knowledge — general 'what is the current price of Bitcoin' questions that need up-to-date grounding. | 4, 5, 7, 8, 9, 12, 13 |

## Blockchain & Web3 (17)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `CROSS_CHAIN_STATE_VERIFY` | Deterministic | comparator only | < 3s | High | Proves cryptographic Merkle-Patricia state roots and cross-chain message execution headers between distinct blockchain networks. | 1, 2, 5 |
| ★ `EVENT_OUTCOME_RESOLUTION` | Hybrid | comparator + adapter | < 5s | High | Resolves objective real-world event outcomes for prediction markets and conditional contracts using quorum oracles. | 5, 6, 13, 14 |
| ★ `LIQUIDITY_DEPTH_VERIFY` | Deterministic | comparator only | < 500ms | Medium | Measures bid-ask order book depth, cumulative slippage bands, and market maker liquidity across decentralized pools. | 1, 2, 13 |
| ★ `ONCHAIN_METRIC_VERIFY` | Deterministic | comparator only | < 2s | Medium | Validates smart contract event logs, gas consumption, token balances, and wallet transaction states directly on-chain. | 1, 2, 13, 14 |
| ★ `WASH_TRADING_DETECTION` | Hybrid | comparator + adapter | < 4s | High | Analyzes DEX transaction graphs and circular transfer loops between affiliated wallets to identify artificial trade volume. | 1, 13, 14 |
| ★ `ASSET_RESERVE_ATTESTATION` | Deterministic | comparator only | < 5s | High | Verifies cryptographic proof-of-reserves and custodial bank confirmations backing stablecoins and tokenized assets. | 1, 2, 12, 13 |
| `CRYPTO_TRANSFER_VERIFY` | Deterministic | comparator only | < 1.5s | Medium | Verifies on-chain transaction status, gas fee burn, sender/recipient addresses, and block confirmations. | 2, 10, 13, 14, 15 |
| `SMART_CONTRACT_AUDIT` | Hybrid | comparator + adapter | < 8s | High | Inspects bytecode and smart contract source code for reentrancy, access control, and integer overflows. | 1, 14 |
| `CRYPTO_YIELD_RATE` | Deterministic | comparator only | < 1.2s | Medium | Tracks annualized percentage yields, staking reward rates, and lending pool yields across DeFi protocols. | 2, 13 |
| `TOKEN_TOTAL_SUPPLY_VERIFY` | Deterministic | comparator only | < 500ms | Low | Verifies token circulating supply, burnt token balances, and total minted token counts on-chain. | 13 |
| ★ `VALIDATOR_PERFORMANCE_VERIFY` | Deterministic | comparator only | < 1.5s | Medium | Tracks consensus voting uptime, proposed block rates, slashing penalties, and staking APR for network validators. | 13 |
| `CRYPTO_PRICE` | Deterministic | comparator only | — | — | Query names a cryptocurrency asset and asks for its current or historical price. Prefer FINANCIAL_DATA for broader market or fundamentals questions. | 2, 9, 13 |
| `GAS_PRICE` | Deterministic | comparator only | — | — | Query asks for the current or recent transaction fee level on a named blockchain network. Distinct from the price of that chain's token, which is CRYPTO_PRICE. | 2 |
| `ONCHAIN_TX_LOOKUP` | Deterministic | comparator only | — | — | Query supplies a transaction hash or names a specific on-chain transaction and asks for its details, status or effects. Requires an actual transaction reference, not a general question about how transactions work. | — |
| `TOKEN_HOLDER_COUNT` | Deterministic | comparator only | — | — | Query names a specific token or contract address and asks how many distinct addresses hold it. Not a request for the token's price, supply or market data. | — |
| `TVL_LOOKUP` | Deterministic | comparator only | — | — | Query names a specific DeFi protocol, pool or chain and asks for the total value locked in it. Distinct from a token's market capitalisation. | — |
| `WALLET_BALANCE_CHECK` | Deterministic | comparator only | — | — | Query names a specific blockchain address or ENS name and asks for its current native-coin or token balance on a named chain. A question that merely mentions a wallet without asking what it holds does not qualify. | — |

## Climate & Weather (5)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| `AIR_QUALITY_INDEX` | Deterministic | comparator only | < 800ms | Low | Aggregates particulate matter, ground ozone, and composite AQI metrics from monitoring stations. | 6 |
| ★ `WEATHER_FORECAST_VERIFY` | Deterministic | comparator only | < 1s | Low | Reconciles localized Doppler radar feeds, barometric pressure, wind gusts, and severe weather alert bulletins. | 6, 7, 8, 11, 12 |
| `STORM_ALERT` | Deterministic | comparator only | — | — | Query names a specific, resolvable location and asks specifically about active or upcoming storm systems, high winds, or disruption risk from severe weather there — not general current conditions. | — |
| `WEATHER_CHECK` | Deterministic | comparator only | — | — | Query names a specific, resolvable location (city, region, coordinates) AND asks about CURRENT atmospheric/weather conditions there (e.g. current temperature). A location mentioned only in passing in an unrelated question does not qualify. | 2, 6, 9, 12 |
| `WEATHER_FORECAST` | Deterministic | comparator only | — | — | Query names a specific, resolvable location and asks for FUTURE weather conditions over a stated time window (e.g. 'next 24 hours'), not current conditions. | — |

## Commerce & Procurement (8)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `COMMERCE_PURCHASE_VERIFY` | Deterministic | comparator only | < 1s | Medium | Verifies the authenticity, item line totals, and payment authorization for a completed e-commerce purchase transaction. | 15 |
| ★ `LIVE_SHELF_PRICE` | Deterministic | comparator only | < 2s | Low | Fetches and verifies current live shelf or retail listing prices across online merchant catalogs and marketplaces. | 6, 7, 9, 15 |
| ★ `SKU_IN_STOCK` | Deterministic | comparator only | < 500ms | Low | Confirms real-time stock availability, quantities, and warehouse fulfillment readiness for a given SKU. | 7, 15 |
| ★ `PURCHASE_ORDER_VERIFY` | Deterministic | comparator only | < 2s | Medium | Reconciles enterprise purchase orders with procurement approval workflows, vendor quotas, and budget allocations. | — |
| ★ `VENDOR_VERIFY` | Hybrid | comparator + adapter | < 3s | High | Audits vendor tax identifiers, compliance credentials, banking details, and sanctions list clearance. | 9 |
| ★ `PRODUCT_AUTHENTICITY` | Hybrid | comparator + adapter | < 3s | High | Validates product provenance, serial numbers, and manufacturer anti-counterfeit records against authorized registries. | 7, 15 |
| ★ `RETURN_POLICY_VERIFY` | Hybrid | comparator + adapter | < 800ms | Low | Validates order return eligibility, restocking fees, and merchant policy constraints based on purchase timestamp and category. | — |
| ★ `SHIP_RATE_ETA` | Hybrid | comparator + adapter | < 1s | Medium | Calculates and verifies carrier shipping rates, service tiers, and estimated delivery dates for specified zip codes. | 6, 8, 9 |

## Cybersecurity (12)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `VULNERABILITY_TRIAGE` | Hybrid | comparator + adapter | < 2s | High | Ranks and categorizes detected vulnerabilities by CVSS score, active exploit availability, and asset criticality. | 10, 14 |
| ★ `EMAIL_SECURITY` | Hybrid | comparator + adapter | < 500ms | Medium | Verifies SPF, DKIM, and DMARC records, inspects header anomalies, and detects spoofing or malicious attachments. | — |
| ★ `MALWARE_DETECTION` | Hybrid | comparator + adapter | < 4s | High | Scans file hashes and binaries against multi-engine antivirus definitions and sandbox behavioral detonation traces. | — |
| ★ `THREAT_INTELLIGENCE` | Hybrid | comparator + adapter | < 1s | Medium | Aggregates indicators of compromise (IOCs), malicious IP ranges, and adversary tactics from global security feeds. | — |
| `THREAT_IP_REPUTATION` | Hybrid | comparator + adapter | < 400ms | Medium | Assesses malicious IP address risk scores, botnet associations, and brute-force history across threat registries. | — |
| ★ `URL_SAFE` | Hybrid | comparator + adapter | < 300ms | Low | Checks target URLs against live threat feeds, DNS blocklists, phishing databases, and domain reputation monitors. | 7, 9, 15 |
| `DNS_RECORD_LOOKUP` | Deterministic | comparator only | < 200ms | Low | Resolves and validates authoritative DNS records (A, AAAA, CNAME, MX, TXT) across global resolvers. | — |
| `PORT_SCAN_AUDIT` | Deterministic | comparator only | < 2s | Medium | Identifies open network service ports, banner disclosures, and listening daemon protocols on specified hosts. | — |
| `CVE_LOOKUP` | Deterministic | comparator only | — | — | Query supplies a CVE identifier and asks for its details, severity or affected versions. | — |
| `IP_GEOLOCATION` | Deterministic | comparator only | — | — | Query supplies an IP address and asks where it is located geographically. For abuse history, use IP_REPUTATION. | — |
| `SSL_VERIFICATION` | Deterministic | comparator only | — | — | Query supplies a hostname or domain and asks about its TLS/SSL certificate, chain or configuration. | — |
| `URL_SCAN` | Deterministic | comparator only | — | — | Query supplies a URL and asks for it to be scanned and judged safe or unsafe. | — |

## Energy & Infrastructure (4)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| `CLOUD_RESOURCE_USAGE` | Deterministic | comparator only | < 1s | Medium | Audits virtual machine and container compute utilization, memory pressure, and network throughput metrics. | 9, 12 |
| ★ `DATACENTER_TELEMETRY_VERIFY` | Deterministic | comparator only | < 2s | Medium | Audits rack power usage effectiveness (PUE), server thermal telemetry, and backup generator readiness metrics. | 12 |
| ★ `GRID_POWER_PRICE` | Deterministic | comparator only | < 1s | Low | Ingests real-time nodal locational marginal prices and day-ahead electricity spot rates from regional grid operators. | 5, 11, 12 |
| ★ `MINING_HASHPRICE_VERIFY` | Deterministic | comparator only | < 1s | Medium | Calculates proof-of-work mining revenue per unit of hashing power based on block rewards and network difficulty. | 12 |

## Enterprise Operations (8)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `B2B_IDENTITY_ENRICHMENT` | Hybrid | comparator + adapter | < 2s | Medium | Enriches business entity records with corporate tax IDs, headquarters addresses, executive listings, and domain validation. | — |
| ★ `CONTRACT_OBLIGATION_AUDIT` | Judgment | adapter only | < 4s | High | Parses and verifies legal contract milestone deliverables, payment terms, and vendor performance commitments. | 4, 13, 15 |
| ★ `DOCUMENT_AUTHENTICITY` | Hybrid | comparator + adapter | < 2.5s | High | Validates digital certificate signatures, notarizations, tamper-evident seals, and document checksum integrity. | 2, 6, 8, 11 |
| ★ `INVOICE_LEDGER_RECONCILE` | Hybrid | comparator + adapter | < 3s | High | Performs automated 3-way matching between invoice line items, purchase orders, and receiving dock receipts. | — |
| `API_HEALTH_CHECK` | Deterministic | comparator only | < 400ms | Low | Verifies REST/GraphQL API responsiveness, JSON schema payload structure, and HTTP status codes. | — |
| ★ `CUSTOMER_TICKET_RESOLUTION` | Judgment | adapter only | < 1.5s | Medium | Analyzes helpdesk support interactions, resolution accuracy, agent action compliance, and customer satisfaction outcomes. | — |
| `SERVER_UPTIME_MONITOR` | Deterministic | comparator only | < 600ms | Low | Monitors HTTP/HTTPS endpoint availability, handshake latency, and uptime status from multiple edge regions. | 12, 15 |
| ★ `SLA_COMPLIANCE` | Deterministic | comparator only | < 1s | Medium | Measures operational response and resolution turnaround against contractually agreed service level agreements. | 12, 15 |

## Financial / Transactional (11)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `OPTIMAL_EXECUTION_ROUTE` | Hybrid | comparator + adapter | < 150ms | High | Determines optimal multi-venue order execution routing to minimize slippage, exchange fees, and market impact. | — |
| ★ `FRAUD_RISK` | Judgment | adapter only | < 350ms | High | Computes real-time behavioral fraud probability scores using device fingerprinting, IP geolocation, and transaction context. | 2, 7 |
| ★ `PAYMENT_METHOD_VERIFY` | Deterministic | comparator only | < 600ms | Medium | Verifies card BIN validity, tokenization credentials, bank account routing, and active account standing. | — |
| ★ `TRANSACTION_RISK` | Judgment | adapter only | < 250ms | High | Evaluates spending velocity, merchant categorization codes, and chargeback history to score transaction risk. | 2 |
| ★ `FX_NOW` | Deterministic | comparator only | < 200ms | Low | Provides real-time institutional foreign exchange mid-market rates, spreads, and currency conversion quotes. | 2, 3, 5, 9 |
| `CREDIT_SCORE_VERIFY` | Hybrid | comparator + adapter | < 800ms | Medium | Validates consumer credit bureau score ranges, adverse factors, and debt-to-income benchmarks. | — |
| `CURRENCY_EXCHANGE` | Deterministic | comparator only | < 250ms | Low | Calculates fiat currency conversion rates and mid-market spot pricing across global currency pairs. | — |
| `LOAN_INTEREST_RATE_QUOTE` | Deterministic | comparator only | < 1s | Low | Aggregates residential mortgage APRs, prime lending rates, and personal loan interest quotes. | 3, 5 |
| `FINANCIAL_DATA` | Deterministic | comparator only | — | — | Query asks for market data, company fundamentals, or financial statistics beyond a single quoted price. | 2, 3, 12 |
| `FRAUD_DETECTION` | Deterministic | comparator + adapter | — | — | Query asks how likely a specific entity, transaction or action is to be fraudulent. | — |
| `STOCK_PRICE` | Deterministic | comparator only | — | — | Query names a listed equity or ticker and asks for its current or historical share price. A company mentioned in passing does not qualify. | 6 |

## Geospatial & Remote Sensing (1)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `SATELLITE_IMAGERY_ANALYSIS` | Judgment | adapter only | < 12s | High | Processes multispectral satellite feeds for land use changes, crop vegetation indexes, and infrastructure monitoring. | 5, 6, 11 |

## IoT & Telemetry (1)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `SENSOR_TELEMETRY_VERIFY` | Deterministic | comparator only | < 400ms | Medium | Validates edge sensor heartbeat signals, cryptographic payload integrity, and calibration threshold bounds. | 6, 7, 11, 12 |

## Legal & Compliance (4)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `KYC_BIOMETRIC_LIVENESS` | Hybrid | comparator + adapter | < 2s | High | Verifies user selfie liveness video capture against government photo IDs to prevent spoofing fraud. | — |
| ★ `SANCTIONS_SCREENING_MATCH` | Hybrid | comparator + adapter | < 500ms | Medium | Screens counterparties and beneficial owners against OFAC, EU, and UN consolidated financial sanctions lists. | 1, 2, 3, 4, 8 |
| ★ `CORPORATE_REGISTRY_LOOKUP` | Deterministic | comparator only | < 2.5s | Medium | Queries national business registers for incorporation status, registered agent details, and beneficial ownership filings. | 2, 3, 4, 8, 12, 13 |
| ★ `REGULATORY_FILING_MONITOR` | Deterministic | comparator only | < 3s | Medium | Parses statutory regulatory filings, 10-K/10-Q disclosures, and disclosure updates from financial oversight portals. | 2, 3, 4, 12, 13 |

## Logistics (5)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `CARRIER_SERVICEABILITY` | Deterministic | comparator only | < 600ms | Low | Evaluates freight and courier delivery coverage, weight limits, and hazardous material restrictions for target routes. | 9 |
| ★ `DELIVERY_WINDOW_VERIFY` | Deterministic | comparator only | < 800ms | Medium | Confirms driver dispatch route scheduling, customer delivery appointment slots, and signature requirements. | — |
| ★ `PACKAGE_STATUS` | Deterministic | comparator only | < 500ms | Low | Tracks parcel checkpoint milestones, courier custody transfers, and delivery progress across logistics carriers. | 2, 13 |
| ★ `SHIPMENT_DELAY_RISK` | Judgment | adapter only | < 2s | High | Assesses predictive delay risk based on customs processing times, port congestion, weather conditions, and transport nodes. | 6 |
| ★ `WAREHOUSE_INVENTORY` | Deterministic | comparator only | < 1s | Medium | Audits bin and pallet level stock counts, pick-and-pack allocations, and replenishment thresholds in fulfillment centers. | 11 |

## Logistics & Maritime (2)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `LIVE_PORT_CONGESTION` | Hybrid | comparator + adapter | < 3s | Medium | Measures container port vessel queue wait times, berth occupancy ratios, and dwell day averages. | 5, 6, 8 |
| ★ `VESSEL_TELEMETRY_VERIFY` | Deterministic | comparator only | < 1.5s | Medium | Ingests maritime AIS transponder data to track vessel speed, draft, bunker fuel burn, and nautical headings. | 2, 5, 8 |

## Macroeconomics & Finance (1)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `MACRO_ECONOMIC_INDICATOR` | Deterministic | comparator only | < 2s | Low | Aggregates released central bank interest rates, consumer price index (CPI) updates, and unemployment figures. | 2, 3, 5, 6, 13 |

## Software / Engineering (7)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `CODE_PATCH_VERIFY` | Deterministic | comparator only | < 10s | High | Validates that software patch commits compile, resolve targeted defects, and introduce no regression side effects. | 10, 14 |
| ★ `CODE_REVIEW` | Judgment | adapter only | < 5s | High | Evaluates source code pull requests against internal architectural patterns, maintainability standards, and syntax rules. | 1, 10 |
| ★ `SECURITY_REVIEW` | Hybrid | comparator + adapter | < 8s | High | Scans codebase dependencies, API endpoints, and configuration files for common CVEs, secrets leakage, and misconfigurations. | 10, 14 |
| `CODE_GENERATION` | Hybrid | comparator + adapter | < 4s | High | Generates executable, type-safe code snippets and algorithms meeting specified functional specifications. | 9, 10, 11 |
| ★ `REGRESSION_VERIFY` | Deterministic | comparator only | < 15s | High | Runs automated test suite executions to confirm backward compatibility across modified service APIs and libraries. | 10 |
| ★ `TASK_EXECUTION_QUALITY` | Judgment | adapter only | < 2s | Medium | Benchmarks automated job or agent execution outputs against gold-standard rubrics and expected schema constraints. | 2, 9, 10, 11, 12 |
| `GRAMMAR_SPELL_CHECK` | Deterministic | comparator only | < 350ms | Low | Detects typographical, orthographic, punctuation, and grammatical errors with correction offsets. | — |

## Sports & Events (2)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| `GAME_RESULT` | Deterministic | comparator only | — | — | Query names a specific completed sports fixture or competition and asks for its final outcome or winner. Distinct from an in-progress or live score, which is SPORTS_SCORE. | — |
| `SPORTS_SCORE` | Deterministic | comparator only | — | — | Query names a specific sports fixture, team or competition and asks for the current or most recent score. Distinct from asking who ultimately won a finished event, which is GAME_RESULT. | — |

## Travel & Mobility (6)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `TRAVEL_DISRUPTION` | Deterministic | comparator only | < 1s | Medium | Detects and monitors flight delays, cancellations, gate shifts, and weather-driven travel disruptions in real time. | 6, 15 |
| ★ `FARE_RULE_VERIFY` | Hybrid | comparator + adapter | < 800ms | Medium | Inspects fare terms, baggage allowances, cancellation penalties, and change fee stipulations for booked travel tickets. | — |
| ★ `FLIGHT_AVAILABILITY` | Deterministic | comparator only | < 1s | Medium | Queries real-time airline schedule networks, cabin seat inventories, and booking fare class statuses. | — |
| ★ `HOTEL_AVAILABILITY` | Deterministic | comparator only | < 1.2s | Medium | Confirms room inventory, nightly rates, amenities, and cancellation policies across hospitality property management systems. | — |
| ★ `ROUTE_ETA` | Deterministic | comparator only | < 500ms | Low | Computes multimodal routing itineraries, live traffic transit times, and turn-by-turn arrival estimations. | 6, 11 |
| ★ `TRAVEL_TRANSIT_LOCK` | Deterministic | comparator only | < 1.5s | Medium | Verifies and confirms fare holds, ticket reservation guarantees, and transit seat locking mechanisms. | — |

## Trust & Safety (12)

| Intent | Class | Scored by | Target latency | Complexity | Description | Bought by missions |
|---|---|---|---|---|---|---|
| ★ `MEDIA_FORENSIC_VERIFY` | Judgment | adapter only | < 6s | High | Detects AI deepfake artifacts, EXIF metadata manipulation, and generative audio/video synthesis in media uploads. | 5, 7 |
| `PLAGIARISM_DETECTION` | Hybrid | comparator + adapter | < 3s | High | Detects verbatim duplication, disguised paraphrasing, and uncredited citations across corpus databases. | — |
| ★ `SOCIAL_BOT_DETECTION` | Judgment | adapter only | < 2s | High | Classifies social media accounts by post frequency anomalies, follower graph clusters, and coordinated inauthentic behavior. | 1, 5, 7, 10 |
| `AI_TEXT_DETECTION` | Judgment | comparator + adapter | — | — | Query provides a specific block of text and asks whether it was written by an AI or a human. The user must supply actual text content to analyze — a question that merely asks about AI detection conceptually (without providing text to analyze) is not this intent. | — |
| `CONTENT_MODERATION` | Judgment | comparator + adapter | — | — | Query is itself asking to classify, flag, or moderate a specific piece of provided content, OR asks how automated content moderation works as a method/technique — not merely a question that mentions moderation as an unrelated concept. | 7 |
| `CONTENT_VERIFICATION` | Judgment | comparator + adapter | — | — | Query asks whether a specific piece of supplied content is genuine and unaltered, covering provenance and integrity generally rather than media forensics specifically. | — |
| `DEEPFAKE_DETECTION` | Deterministic | adapter only | — | — | Query includes an actual image or video URL/reference and specifically asks whether it is a deepfake or whether a face/person in it has been synthetically generated or swapped. Requires real attached media — the word 'deepfake' alone with no media reference does not qualify. | — |
| `FACT_CHECK` | Judgment | comparator + adapter | — | — | Query supplies a specific claim or statement and asks whether it is true, with supporting evidence. A general knowledge question is CHAT_COMPLETION — this intent requires a checkable claim. | 4, 5, 7, 10, 13 |
| `IMAGE_VERIFICATION` | Deterministic | adapter only | — | — | Query includes an actual image URL/reference and asks whether it has been digitally manipulated, edited, or spliced (distinct from asking if it's AI-generated outright — that's MEDIA_AUTHENTICITY_CHECK). Requires real attached media. | — |
| `MEDIA_AUTHENTICITY_CHECK` | Deterministic | adapter only | — | — | Query includes an actual image or video URL/reference and asks broadly whether it is authentic, real, or AI-generated. Words like 'authentic,' 'real,' 'validity,' or 'genuine' alone, with no actual media attached, do NOT qualify. | — |
| `TEXT_AUTHENTICITY_CHECK` | Judgment | comparator + adapter | — | — | Query supplies a block of text and asks whether it is genuine, original, or machine-generated. Where the user explicitly asks about AI authorship, prefer AI_TEXT_DETECTION. | — |
| `VIDEO_VERIFICATION` | Deterministic | adapter only | — | — | Query references an actual video file or URL and asks to verify its authenticity, origin, or whether it has been edited/deepfaked. The mere word 'video' in an unrelated question does not qualify — requires a real attached video. | — |

