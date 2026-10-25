# 📣 SHOWCASE POST — copy-paste for Discord #showcase

> Where: Discord → **#showcase** → "Create a post"
> Tags: pick **Apps & Agents** + **Miners & Providers** (both apply; if only one allowed, choose Apps & Agents)
> Attachments: the memo screenshot + the basescan screenshot (order below)

---

## Title (Discord forum titles cap ~100 chars — this fits)

```
🟢 LIVE: Listings Desk (Mission 01) + 2 miners serving onchain & weather Intents
```

Shorter alternates:
```
🟢 Mission 01: Listings Desk + 2 live miners — receipts included
🟢 Listings Desk is live: 5 bought Intents → risk memo with receipts
```

## Body (compact version — fits Discord's 2000-char message limit)

> The original long body is below for channels without limits.

```
Hi all 👋 building for **Mission 01 (Exchange)** — an autonomous **listings desk** that buys
verified intelligence through Telegraph and returns a signed risk memo with receipts and a
cost line. In minutes and $0.05, instead of weeks of analyst time.

**How it works (demand side):**
A token candidate arrives → the desk fires **5 parallel paid Intents** through the Engine
(SMART_CONTRACT_AUDIT · ONCHAIN_METRIC_VERIFY · SANCTIONS_SCREENING_MATCH ·
SOCIAL_BOT_DETECTION · CODE_REVIEW) → each answer arrives with a receipt
(miner, cost, latency, signal_hash) → memo with verdict + verification hash + cost line.

**Supply side (Miner track):** two miners registered on-chain and **ACTIVE** in the routing pool:
🪨 `onchain-metric-publicnode` (ID 9602) — ONCHAIN_METRIC_VERIFY, served from a full Ethereum node
🌤️ `weather-verify-openmeteo` (ID 9603) — WEATHER_FORECAST + _VERIFY, Open-Meteo ICON model

**Receipts, not promises:**
✅ 4 real purchases settled (incl. buying from our own miners — full loop working)
✅ Escrow payment client built (x402 escrow scheme, personal_sign, settlement proofs captured)
✅ Nov 14 milestone artifact already done
✅ Spending caps enforced; failed requests never billed

**Looking for:** builders who need ONCHAIN_METRIC_VERIFY or weather verification for their
missions — our miners are live and cheap ($0.01 floor). Also happy to share what we learned
registering (the node schema and CDN cache have some sharp edges 😅).

Proof in the attachments: live risk memo with receipts · on-chain tx history · miners in the
network catalogue. Repo link on request (going public at submission).
```

---

## Attachments (in this order)

1. **Memo screenshot** — open `build/milestones/real-run-memos/…20-25-44.html` in the browser, show the receipts table + cost line
2. **Basescan wallet** — https://sepolia.basescan.org/address/0x5549286a1C71893816899BbEF8F4CE4d91f87821 (7 txs + 15 USDC in the Token dropdown)
3. **Compact live proof** (screenshot of this text, or the API page with Ctrl+F):
   ```
   {"id":"9602","slug":"onchain-metric-publicnode","status":"active","intents":["ONCHAIN_METRIC_VERIFY"],"requests":2}
   {"id":"9603","slug":"weather-verify-openmeteo","status":"active","intents":["WEATHER_FORECAST","WEATHER_FORECAST_VERIFY"],"requests":1}
   ```
4. *(optional)* Leaderboard output — `node build/check-leaderboard.mjs` — shows the weak incumbents we're challenging

---

## After posting

- Watch for replies; answer questions fast (you have the IDENTITY-CARD.md crib).
- Repost-worthy moments later: first leaderboard placement (~Nov 2–3), rank 1 taken, build #2 shipped.
- Cross-post a shorter version on X, tag @Telegraphprotoc.
