# 📣 COMPLETE SHOWCASE POST — final merged version (title + body)

> **Title field** (~90 chars, fits the limit):

```
🟢 LIVE: Listings Desk (Mission 01) + 3 miners — onchain, weather & FX Intents
```

> **Tags:** **Apps & Agents** + **Miners & Providers**
> **Body** (paste as-is, ~1,850 chars):

```
Hi all 👋 building for **Mission 01 (Exchange)** — an autonomous **listings desk** that buys verified intelligence through Telegraph and returns a signed risk memo with receipts and a cost line. Minutes and $0.05, instead of weeks of analyst time.

**Demand side:** a token candidate arrives → 5 parallel paid Intents through the Engine (SMART_CONTRACT_AUDIT · ONCHAIN_METRIC_VERIFY · SANCTIONS_SCREENING_MATCH · SOCIAL_BOT_DETECTION · CODE_REVIEW) → each answer arrives with a receipt (miner, cost, latency, signal_hash) → memo with verdict + verification hash + cost line. 4 real purchases settled ✅

**Supply side — 3 miners registered on-chain and ACTIVE:**
🪨 `onchain-metric-publicnode` — ONCHAIN_METRIC_VERIFY (full-node reads via Blockscout, decimal outputs)
🌤️ `weather-verify-openmeteo` — WEATHER_FORECAST + _VERIFY (Open-Meteo ICON)
💱 `fx-now-frankfurter` — FX_NOW (ECB reference rates)

**Honest build-log 🧵:** our onchain miner debuted at **rank 35 with a 0.0000 score** — despite answering correctly when tested by hand. Root cause: we served HEX from a raw JSON-RPC node and never mapped `signal_mapping.label_field` to an answer field. The parser needs a clean decimal label — correctness alone doesn't score if the parser can't find the value. Fixed (Blockscout decimal + label mapping), re-registered, next epoch re-scores us. PSA: if your score is 0.0000 but your API works by hand — check those two things first.

**Receipts, not promises:** escrow payment client built (x402 escrow, personal_sign, settlement proofs) · spending caps enforced · failed requests never billed · Nov 14 milestone artifact ready.

**Looking for:** builders who need ONCHAIN_METRIC_VERIFY, weather verification or FX rates — all three miners live at $0.01. Feedback on the memo format welcome too!

Proof in attachments: live memo with receipts · on-chain tx history · miners in the network catalogue. Repo public at submission.
```

> **Attachments in order:**
> 1. Memo screenshot (GO + receipts + cost line)
> 2. Explorer screenshot — our miner Active (or the ONCHAIN METRIC VERIFY leaderboard showing the field we're climbing)
> 3. Basescan wallet page (7+ txs)
> 4. Compact live proof:

```
{"id":"9602","slug":"onchain-metric-publicnode","status":"active"}
{"id":"9603","slug":"weather-verify-openmeteo","status":"active"}
{"id":"9601","slug":"fx-now-frankfurter","status":"active"}
```
