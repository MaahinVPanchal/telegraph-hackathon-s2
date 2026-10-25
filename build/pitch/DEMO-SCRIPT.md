# 🎬 Demo Video Script — 3 minutes, word-for-word

> **How to record:** Xbox Game Bar (`Win + G`) or OBS Studio (free). Record **browser + terminal**.
> Read the **SAY** lines, do the **SHOW** actions at the same time. Total ≈ 3:00. The submission
> needs 2–5 minutes — this lands at 3.

---

## SHOT 1 — Hook (0:00 – 0:20)

**SHOW:** the finished memo open in your browser (`build/milestones/real-run-memos/…html`) — scroll slowly from verdict to receipts to the cost line.

**SAY:**
> "This is a listing risk memo produced by our app, the Listings Desk, for Telegraph Hackathon Season Two. Every line of it was **bought with real money** from the Telegraph network — five pieces of intelligence, parallel, ninety seconds, and the total cost printed at the bottom. Let me show you how."

---

## SHOT 2 — The problem (0:20 – 0:50)

**SHOW:** the Mission 01 brief on `hackathon.telegraphprotocol.com/missions/exchange` — highlight the "problem" paragraph.

**SAY:**
> "When an exchange reviews a token listing, it needs contract audits, on-chain metrics, sanctions screening, social authenticity, and code review. Today that's weeks of analyst time, per-seat surveillance licensing, and counterparty checks that mean exposing your book. Agents can't trust raw APIs either — there's no receipt, no track record, no accountability."

---

## SHOT 3 — The app in action (0:50 – 1:40)

**SHOW:** terminal. Type `node src/cli.mjs <token> --mode real` and let it run. The memo prints. (If it's slow, cut the wait in editing — or pre-run and show the saved memo being written.)

**SAY:**
> "Here's the app running live. We fire **five parallel paid requests** through the Telegraph Engine — contract audit, on-chain metrics, sanctions screening, social bot detection, and code review. We never choose who answers: the Engine routes each request to the **best-ranked miner** on the network for that Intent. Each answer comes back with a receipt — which miner served it, what it cost, how long it took, and a signal hash we can verify later. Failed requests are never billed, and the desk retries them automatically."

---

## SHOT 4 — The supply side: our own miners (1:40 – 2:20)

**SHOW:** two tabs fast:
1. `https://devnode.telegraphprotocol.com/api/miners` → Ctrl+F `openmeteo` → highlight our miner.
2. `https://sepolia.basescan.org/address/0x5549286a1C71893816899BbEF8F4CE4d91f87821` → the 7 transactions.

**SAY:**
> "We don't just consume this network — we supply it. We registered two miners on-chain: an on-chain metrics reader and a weather verification service, both live in the routing pool today — you can see them in the network's own catalogue, and our wallet's registration transactions on Base Sepolia. Miners earn from real demand: ninety-eight percent of every payment is converted to MACHINA and paid to the miner's fee address. In our test runs, our own desk bought from our own miners — the full supply-and-demand loop, working."

---

## SHOT 5 — The numbers (2:20 – 2:45)

**SHOW:** the memo's cost line, then the leaderboards (`node build/check-leaderboard.mjs`).

**SAY:**
> "The economics: one request costs one cent. A full listing review costs five cents and runs in under two minutes — against weeks of analyst time. And because rankings are public, quality is transparent: our Intents have incumbents scoring zero-point-three to zero-point-six, and our validators-verified answers are built to beat them."

---

## SHOT 6 — Try it (2:45 – 3:00)

**SHOW:** the repo README on GitHub, and the "How to reproduce" block of the memo.

**SAY:**
> "Everything is open: the app, the miner configs, the run instructions, and every receipt. Clone it, run `npm run demo` — no wallet needed — and you'll produce the same memo. This is our Mission One submission for Telegraph Hackathon Season Two. Thank you."

---

## 📱 Discord intro post (copy-paste)

> Hi all 👋 We're **building for Mission 01 (Exchange)**: an **autonomous listings desk** that buys verified intelligence through Telegraph — 5 parallel paid Intents (contract audit, on-chain metrics, sanctions, bot detection, code review) → a signed listing risk memo with receipts and a **cost line**.
>
> We're also on the **Miner track**: two live miners (`ONCHAIN_METRIC_VERIFY` + `WEATHER_FORECAST(_VERIFY)`) already serving routed traffic on testnet. Real purchases done ✅ with settlement receipts — Nov 14 milestone artifact ready.
>
> Looking for: app builders who need `ONCHAIN_METRIC_VERIFY` or weather verification, and feedback on our memo format. Repo + receipts: <link — paste when repo goes public or share in DM>

---

## 🎙️ If asked to speak live (30-second version)

> "We built a listings desk for Mission One: it buys five kinds of verified intelligence — contract audit, on-chain metrics, sanctions, bot detection, code review — in parallel through Telegraph, and returns a risk memo with receipts and a cost line, in about ninety seconds for five cents. We also run two live miners on the network supplying that intelligence. Everything is on-chain, receipted, and reproducible — repo and receipts in the thread."
