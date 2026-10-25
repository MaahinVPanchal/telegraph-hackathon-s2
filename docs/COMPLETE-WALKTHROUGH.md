# Complete Walkthrough — from absolute zero to live miner & real purchases

> **Who this is for:** someone completely new to crypto, Telegraph, and hackathons.
> **What it covers:** every decision, every command, every failure and fix from our 26 Oct 2026
> session, explained from first principles and mapped to how the hackathon judges it.
> Companion files: `../README.md` (hackathon reference) · `../milestones/MILESTONES-2026-10-26.md` (evidence log).

---

## Part 1 — Primer: what Telegraph actually is (5 minutes)

**The one-sentence version:** Telegraph is a marketplace where software agents *pay money* to *buy verified answers*, and it settles those payments on a blockchain.

The moving parts, in the order a request flows:

| Piece | What it is | Our role |
|---|---|---|
| **Intent** | A canonical, on-chain-registered *type of question* — e.g. `ONCHAIN_METRIC_VERIFY` = "read a value from a blockchain at a block height". 134 exist; 63 are flagged ★ Season II priority | We serve 3 Intents via 2 miners and buy 5 via our app |
| **Miner** | Anyone who wraps an API/model so it can answer an Intent. Declared in a **YAML file**, registered with one transaction. No approval, no stake — only gas | **We registered 2 miners** (onchain-metric, weather) |
| **Evaluator** | A WASM program that scores how good miners' answers are. Better measurement can *replace* the incumbent scoring | Not yet (optional third track for us) |
| **Validator** | One of 64 nodes that verify answers and finalize rankings (BFT consensus, 43-of-64) | Not us (needs stake) |
| **App / Agent** | Software that *buys* Intents through the Engine and uses the answers | **Our listings-desk** (Mission 01) |
| **Engine** | The HTTP endpoint agents call: `POST /engine/v1/ask` — it classifies the question to an Intent and routes it to the **top-ranked** miner | What our app talks to |
| **Receipt** | Every answer carries: which miner, cost, latency, `signal_hash`, settlement proof | Our evidence trail |

**Why rank matters so much:** per Intent, the #1-ranked miner receives **70%** of routed requests, #2 gets 20%, #3 gets 10%. That's why our strategy targeted Intents where the incumbent #1 was weak (0.364 and 0.001) — a correct miner can take the top slot.

**The money path (one request costs $0.01):**
```
Agent pays 0.01 USDC → 2% to Treasury → 98% into a TWAP escrow
→ dripped into Uniswap over 24h → buys MACHINA at market
→ MACHINA sent to the miner's fee address
```
Pricing is always in USDC; payouts arrive as **MACHINA** (the protocol token: 21M max supply, Bitcoin-style halvings, zero pre-mine). Miners earn **zero** MACHINA from emissions — only from real demand. That's deliberate: it keeps miner incentives tied to usefulness.

---

## Part 2 — The 15 commercial missions & our progress

### What the missions are

The 15 missions are the **demand side** of Season II. Each is a real industry with a problem "solved slowly, expensively, or not at all", a target outcome, and 2–12 worked example builds specifying exactly which Intents to buy. Only the **Apps & Agents** track picks a mission; Miners and Evaluators compete per Intent and thereby serve *every* mission that needs their Intent.

The flow (from the official rules): **15 missions define the demand → Intents define the intelligence needed → Providers supply it → Evaluators measure it → Apps prove whether the whole thing works.**

The full mission list with every example build is in this repo's `README.md` (appendix "The 15 Commercial Missions"). The short names:

01 Exchange · 02 Stablecoin · 03 Institutional Markets · 04 Legal · 05 Conflict Intelligence · 06 Resources & Agriculture · 07 Consumer Platform · 08 Commodities · 09 Personal Agent · 10 Model Economy · 11 Autonomous Systems · 12 Mining & Power · 13 Asset Management · 14 Web3 Native & DeFi · 15 Consumer Automation

### Our progress, mapped to missions and Intents

| Track | Entry | Mission / Intent | Status |
|---|---|---|---|
| **Apps & Agents** | listings-desk | **Mission 01 — Exchange** (autonomous listings desk) | 🟢 Built, tested, **3/5 Intents purchased live** ($0.03/run); Nov 14 milestone already satisfied |
| | (planned) | Mission 01 build #2 — "surveillance that only bills when it finds something" (`WASH_TRADING_DETECTION` + `LIQUIDITY_DEPTH_VERIFY`) | ⚪ Nov 1 |
| **Miners** | onchain-metric-publicnode | `ONCHAIN_METRIC_VERIFY` (priority 10 — bought by missions **01, 02, 05, 07**) | 🟢 **ACTIVE** (id 9602, registration 4848); grace period until ~2 Nov, then leaderboard |
| | weather-verify-openmeteo | `WEATHER_FORECAST` + `WEATHER_FORECAST_VERIFY` (priority 5 — bought by missions **05, 06, 13, 14**) | 🟢 **ACTIVE** (id 9603, registration 4847) |
| | fx-now-frankfurter | `FX_NOW` (missions 02, 03, 08, 10) | 🟡 YAML fixed & hosted; not registered yet (an `fx-frankfurter` incumbent exists — register when we differentiate) |
| **Evaluators** | (optional) | Truth-source contributions for deterministic Intents | ⚪ Optional, cheap, counts as a qualifying contribution |

**The multiplier effect:** one Intent serves many missions. Our `WEATHER_FORECAST_VERIFY` miner is bought by example builds in 4 different missions; `ONCHAIN_METRIC_VERIFY` in 4. Delivery awards for Miners are selected by "most distinct commercial missions enabled" — every App that buys our Intents increases our award standing, which is why we also built an App that buys Intents.

---

## Part 3 — Setup, from zero (every command and why)

### 3.1 Wallet = account

Telegraph has no signup. An EVM wallet **is** the account: the address (`0x5549…7821`) is the public identity; the private key signs everything. We created a **fresh MetaMask wallet** for testing — never mix with a wallet holding real funds.

Key concept that confused us initially: **one account = one address on every network.** MetaMask's "Show private key" picker lists the same account once per network — any row exports the same key. And a private key belongs to an *account*, not to a chain.

### 3.2 Networks — and the one we use

| Network | Chain ID | Our use |
|---|---|---|
| **Base Sepolia** | **84532** | ✅ everything: contracts, miners, payments |
| Ethereum Sepolia | 11155111 | ⚪ a faucet sent us 0.05 testnet ETH here by mistake/option — harmless, unused |
| Base mainnet / Ethereum mainnet | 8453 / 1 | ❌ real money — never touched |

MetaMask → Add network manually: RPC `https://sepolia.base.org` (or `https://base-sepolia-rpc.publicnode.com`), Chain ID `84532`, symbol `ETH`, explorer `https://sepolia.basescan.org`. **The Chain ID field is the guarantee you're on the right network.**

### 3.3 Faucets — what worked and what didn't

| Attempt | Result | Lesson |
|---|---|---|
| QuickNode faucet | ❌ Blocked: "need small mainnet balance" | Anti-abuse gates exclude fresh wallets |
| Alchemy faucet | ❌ Same gate | — |
| **Circle faucet** (faucet.circle.com) | ✅ **20 testnet USDC** on Base Sepolia | The faucet Telegraph's docs recommend; GitHub sign-in; **watch the Network dropdown — it defaults to Arc Testnet** |
| **Coinbase CDP faucet** (portal.cdp.coinbase.com) | ✅ **0.0001 testnet ETH** on Base Sepolia | Free account, no mainnet gate. Later a **0.05 ETH** drop arrived on *Ethereum Sepolia* (tx `0xa4a2554c…ca810`) — traced and harmless |

**Seeing tokens in MetaMask:** testnet USDC is invisible until you *Import tokens* → paste `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. The chain always has the true balance — MetaMask just hides unknown tokens.

### 3.4 Tooling

- **Foundry** (`curl -L https://foundry.paradigm.xyz | bash` then `foundryup`) → `cast` signs and sends transactions from the CLI. `cast 1.8.6` installed.
- **Node 22+** — the whole app is dependency-free ESM JavaScript.

### 3.5 The `.env` (and its two pitfalls)

`build/miner-kit/.env` holds `MINER_PRIVATE_KEY`, `FEE_ADDRESS` (same wallet), `RPC_URL`. Pitfalls we hit:
1. **Notepad saved `.env.txt`** — fix: save with the filename in quotes, type = All Files.
2. **MetaMask exports keys without the `0x` prefix** — cast tolerates it, but we normalized.
3. Verification without exposure: `cast wallet address --private-key "$MINER_PRIVATE_KEY"` must print `0x5549…7821`. The key is never echoed, never pasted in chat, never committed.

---

## Part 4 — Building and hosting the miners

### 4.1 YAML anatomy (the miner's whole existence)

A miner is a **declarative YAML** — no code. Required top level: `version, kind, id, slug, name, base_url`. Each endpoint needs `description` + `intents` (or registration is refused), and the request contract lives in `params` (grouped by `query`/`body`/…). **Every block is a closed set** — unknown keys are rejected.

Our three: onchain (PublicNode JSON-RPC passthrough), weather (Open-Meteo pinned to ICON), fx (Frankfurter ECB). Full files in the public repo [`MaahinVPanchal/telegraph-miner-yaml`](https://github.com/MaahinVPanchal/telegraph-miner-yaml).

### 4.2 The hosting rule that bit us

The on-chain registration commits **sha256 of the exact hosted bytes**. Nodes fetch the URL and re-hash. Two consequences:
1. The YAML must live at a **publicly fetchable URL** — our main repo is private, so the YAMLs live in a dedicated public repo. (GitHub raw serves the committed blob verbatim.)
2. **GitHub raw caches ~5 minutes.** We once registered a new hash while the CDN still served old bytes → `YAML hash mismatch` rejection. Rule: **fetch the URL, hash what it serves, only submit when the served hash equals the intended hash.**

### 4.3 Registration — what actually happened (three attempts)

| # | Tx | Result | Cause | Fix |
|---|---|---|---|---|
| 1 | `0x398d523c…6a6df` | ❌ rejected | `external_path is required` — deployed schema is stricter than the docs | Added `external_path` to every endpoint (checked against live miners' YAMLs) |
| 2 | `0x3f0ae5c4…d55` (updateMiner → 4846) | ❌ rejected | `YAML hash mismatch` — stale CDN bytes | Waited out the CDN, verified served hash first |
| 3 | `0x3f75bdf8…3ca2` (updateMiner → 4848) | ✅ **ACTIVE** | — | — |

Weather miner registered clean on the first fixed attempt (4847). Every rejection came back with a precise machine-readable `rejection_reason` via `GET /api/miners/{registrationId}` — the debug loop is fast and cheap (rejections cost only dust gas, and `updateMiner` never loses your slug).

**Always verify before spending gas:** `isCanonicalIntent(string)` = true for each Intent (exact, case-sensitive), hosted hash matches, `cast estimate` to preview cost.

---

## Part 5 — Payments: escrow, x402, and tracing

### 5.1 Why escrow

The Engine's 402 challenge offers three rails: x402 `exact` (per-request USDC transfer, needs a full x402 client + facilitator), Solana, and **`escrow`** — fund once via `EscrowFacet.depositUSDC(amount)`, then each request is authorized with a plain `personal_sign` signature. No facilitator, no per-request on-chain tx. We chose escrow and funded $5.

### 5.2 The payment envelope (exactly what our client sends)

```
1. POST /engine/v1/ask (no payment)          → 402 + accepts[]
2. pick scheme "escrow", fill the template:
   {from} lowercased  {nonce} random UUID  {validAfter}/{validBefore} unix seconds
3. sign the filled message with personal_sign (cast wallet sign)
4. retry with header:
   X-PAYMENT: base64(JSON: {x402Version:2, scheme:"escrow", network:"eip155:84532",
                            payload:{signature, authorization{from,to,value,validAfter,validBefore,nonce}}})
5. success carries X-PAYMENT-RESPONSE (base64 JSON settlement proof)
```

**Bugs we hit and fixed (all three are reusable lessons):**
- Authorization window: server refused 11 minutes — **max window is 2 minutes**. Now 110s.
- Parallel bursts: the Engine's LLM router 429s — our desk now retries failures sequentially with backoff.
- LLM-backed intents are slow: 30s timeouts aborted valid requests — now 120s.

**Failed requests are never billed** — the protocol only settles on a served answer. That made all our debugging free.

### 5.3 Tracing transactions (case study: `0xa4a2554c…ca810`)

The question: "a new transaction for 0.05 appeared — what is it?" Method, reusable for any hash:

1. **`eth_getTransactionReceipt`** on the chain you *think* it's on. `result: null` = it's not there — check other chains.
2. We probed 5 networks; found it on **Ethereum Sepolia**: incoming, SUCCESS, block 11,993,163.
3. Decoded the log: topic0 `0xddf252ad…` = ERC-20 `Transfer`, token contract `0xffff…fffe` = the canonical "native ETH" placeholder faucets use, amount `0.05 ETH`, from a faucet dispenser **to our wallet**.

**Verdict:** a faucet sent us 0.05 *testnet* ETH on *Ethereum Sepolia* — the wrong network for our project, zero real value, zero cost, no action needed. Tools: `build/trace-tx.mjs <hash>` (searches 5 chains, decodes Transfers) and `build/check-wallet.mjs <address>` (balances on Base Sepolia). Explorer equivalents: `sepolia.basescan.org` (Base Sepolia), `sepolia.etherscan.io` (Ethereum Sepolia).

---

## Part 6 — How all of this maps to the hackathon rubric

| Judging criterion (Apps & Agents) | Points | Our current standing |
|---|---|---|
| Technical quality & mainnet readiness (min 24/35) | 35 | Built on testnet contracts that ship at mainnet; graceful degradation (memo renders with partial failures); spending caps enforced twice |
| Commercial viability | 30 | Named buyer (exchange listings desk), per-item cost line, "days → 90 seconds" pitch |
| Real independent adoption & retention | 15 | The desk is a callable library + HTTP endpoint — designed for other agents to consume |
| Quality of Telegraph integration | 10 | Parallel intent buys, receipts with `signal_hash`, settlement proofs captured |
| Clear proof, demo, repeatability | 10 | `npm run demo` (offline) and `--mode real` (live) — both produce memos with a "How to reproduce" block |

**Delivery awards** (the "you don't have to be 1st" path): 8 Apps awards for verified deliveries; 4 Miner awards selected by *most distinct commercial missions enabled* — our two miners touch 8 mission slots combined, and our own app buying from them demonstrates enablement from both sides.

**Dates:** Nov 1 season opens (milestone artifact already in hand for Nov 14) → Dec 1, 23:59 UTC deadline → Dec 2–8 judging → Dec 9 provisional results + 72h appeals. December challenges hold a separate $3,000.

---

## Part 7 — What lives in which repo (private vs public)

**Private: [`telegraph-hackathon-s2`](https://github.com/MaahinVPanchal/telegraph-hackathon-s2)** (flips public at submission)
- The hackathon reference README, extracted catalogues, strategy research (which incumbents are weak — our competitive edge until submissions)
- All code: miner-kit, listings-desk, evidence/milestones
- **Never in git:** `.env` (private key) — git-ignored; keys exist only on this machine

**Public: [`telegraph-miner-yaml`](https://github.com/MaahinVPanchal/telegraph-miner-yaml)** (public from day one)
- Only the three YAMLs + their integrity hashes. YAMLs are public by design — every registered miner's config is publicly readable on the network anyway. Contains no addresses, no keys, no strategy.

**Rule of thumb:** contract addresses, YAMLs, tx hashes, registration IDs = public facts. Private keys, seed phrases, `.env` = never leave the machine. Research/strategy = private until submission.

## Part 8 — Monitoring cheat sheet

```bash
# Leaderboard — our ranks vs the field, per Intent
node build/check-leaderboard.mjs
# browser: https://explorer.telegraphprotocol.com/miners and /intents

# Wallet balances (Base Sepolia)
node build/check-wallet.mjs 0x5549…7821
# Trace any tx across 5 chains
node build/trace-tx.mjs 0x<hash>
# Live miner catalogue (Ctrl+F your slug)
curl -s https://devnode.telegraphprotocol.com/api/miners | grep your-slug
# Registration status incl. rejection reasons
curl -s https://devnode.telegraphprotocol.com/api/miners/<registrationId>
# Everything one wallet ever registered
curl -s https://devnode.telegraphprotocol.com/miner-dispatcher/miners/address/0x5549…7821/yamls
# Look up a purchased answer by its signal hash
curl -s https://devnode.telegraphprotocol.com/engine/v1/signal/<signal_hash>
# Canonical intents (live, from the Diamond)
cast call 0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8 "getCanonicalIntents()(string[])" --rpc-url $RPC_URL
```

## Part 9 — Glossary (every word, plain language)

### Blockchain basics
- **Wallet** — a keychain, not a purse. The **address** (0x…) is public like an email; the **private key** is the only thing that can spend.
- **Seed phrase** — the 12-word master key that generates all accounts. Never leaves paper.
- **Gas** — postage fee paid to the network for every transaction. Testnet gas is free-ish.
- **Testnet / mainnet** — rehearsal stage vs the real stage. Testnet tokens are free and worth $0.
- **Faucet** — a free dispenser of testnet tokens.
- **Transaction hash (tx hash)** — the tracking number of a transaction.
- **Block** — a batch of transactions; the block number is the ledger's page count.
- **Explorer** (basescan/etherscan) — the chain's public search engine.
- **ERC-20** — the token standard USDC uses. Tokens move via  events; **decimals** define counting (USDC: 1000000 = $1).
- **approve** — giving a contract permission to pull tokens from you (required before depositUSDC).
- **Contract / Diamond** — code living on-chain; the Diamond is Telegraph's main contract (diamond = a contract pattern with swappable modules called facets).
- **Signature (personal_sign, EIP-191)** — proving you authorized a message with your key, without sending a transaction. **EIP-712** = the fancier typed-data version (used by the x402 "exact" rail).
- **Nonce** — a one-time number preventing replay attacks.
- **Escrow** — money parked in a contract, spent per rules.
- **TWAP** — drip-buying: 98% of each payment enters Uniswap over 24h to buy MACHINA.
- **MACHINA** — the protocol token. Miners are paid in it; 21M max, halvings, zero pre-mine.
- **Epoch** — one scoring round (~7.5h on testnet). Scores finalize per epoch.
- **Validators / BFT / commit-reveal** — the 64-referee committee scoring miners; 43-of-64 must agree; scores are committed secretly then revealed to prevent copying.
- **zkTLS** — cryptographic proof binding a miner to the answer it gave.

### Telegraph's own vocabulary
- **Intent** — a registered *type of question* (job category). 134 exist; 63 are ★ priority.
- **Miner** — anyone whose API answers Intents. Declared in **YAML** (a config file), registered in one transaction.
- **slug** — the miner's username. **canonical intent** — an officially registered Intent; you may only declare those.
- **external_path** — the upstream path the node must call (required by the deployed schema even though docs said optional).
- **updateMiner** — the edit button; issues a NEW registrationId each time.
- **Engine** — the API agents call: POST /engine/v1/ask.
- **Receipt / signal_hash** — purchase proof + the pointer to that exact answer.
- **Grace period** — a miner's first 7 days: 5% of traffic shared equally, no leaderboard.
- **Routing 70/20/10** — traffic split by rank. **Spot check** — ~20s liveness test; fail → revoked until next epoch.
- **Mission** — an industry use-case (the demand side). Only Apps & Agents pick one.

### Code words used in our project
- **API / endpoint** — a URL a program calls. **JSON** — the data format; **JSON-RPC** — the blockchain call format.
- **HTTP status codes** — 200 ok · 402 payment required · 404 not found · 429 too many requests · 500 server error · 504 gateway timeout.
- **Header (X-PAYMENT)** — metadata attached to an HTTP request (carries our signed payment). **base64** — the text encoding for that envelope.
- **sha256** — a file's fingerprint; proves the hosted YAML equals the registered bytes.
- **Verification hash** — our run's fingerprint: same token in → same hash out.
- **Mock vs real mode** — simulated purchases vs real ones.
- **Parallel (Promise.allSettled)** — fire all 5 requests at once; failures don't cancel the others.
- **Retry with backoff** — re-try failures one-by-one with growing waits (3s, 6s).
- **Spending caps** — MAX_USD_PER_RUN / PER_INTENT, enforced before and after dispatch.
- **Confidence gate** — verdict capped at REVIEW when fewer than 4 of 5 Intents answer.
- **CLI / .env / git commit+push** — command-line app / local secrets file / save + upload versions.
- **Unit test** — automated checks (node --test). Ours: 8/8.

