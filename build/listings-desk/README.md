# Telegraph Listings Desk

**Mission 01 (Exchange)** — the autonomous listings desk: a token-listing application arrives, an agent has ninety seconds to decide if the venue should touch it. This desk fires **five parallel paid requests** through the Telegraph Engine, collects **receipts** for every purchase, and returns a **signed listing risk memo with a cost line**.

```
Intents bought per run (all in parallel, routed by rank — we never pick miners):
  SMART_CONTRACT_AUDIT · ONCHAIN_METRIC_VERIFY · SANCTIONS_SCREENING_MATCH
  SOCIAL_BOT_DETECTION · CODE_REVIEW
```

## Quickstart (no wallet needed)

```bash
npm run demo        # full pipeline in mock mode: 5 "purchases", receipts, memo, cost line
npm run web         # or point a browser at http://localhost:7788 and click Run
npm test            # 8 unit tests, engine fully mocked
node src/cli.mjs PEPE --mode mock --cap 0.10
```

Outputs land in `memos/`: `.md` (readable), `.html` (the demo artifact), `.json` (raw receipts for reviewers). Every memo carries a **verification hash** over the canonical receipt set — same token in, same hash out (mock mode is deterministic).

Mock mode is labelled on every receipt; nothing is purchased, nothing touches the chain.

## Going real (real mode)

Real mode is implemented against the **live testnet Engine** and its actual 402 challenge (captured 26 Oct 2026, see `../reports/engine-402-challenge.json`):

```bash
# 1. One-time: fund the escrow so payments settle without per-request on-chain calls.
#    EscrowFacet.depositUSDC(amount) on the Diamond (Base Sepolia):
#    0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8   — e.g. deposit 1 USDC = 1_000_000 (6 decimals)
#    Needs: a wallet with testnet USDC on Base Sepolia + a little ETH for gas.

# 2. Configure (copy .env.example → .env):
#    WALLET_PRIVATE_KEY=0x...     (the desk signs escrow authorizations with it)
#    MAX_USD_PER_RUN=0.10         (hard spending cap, enforced twice: before dispatch and after)
#    MAX_USD_PER_INTENT=0.02

# 3. Run:
node src/cli.mjs 0xTokenAddress --mode real
```

**What happens under the hood** (`src/x402.mjs`, `src/engine.mjs`):

1. First call gets `HTTP 402` with `accepts[]`. We use the **`escrow` scheme** (the docs recommend it over per-call x402 settlement): no facilitator round trip, no per-request chain tx.
2. The desk fills the challenge's message template — `{from}` **lowercased** (the node rejects checksummed addresses), fresh `nonce`, `validAfter`/`validBefore` unix seconds — and signs it with `personal_sign` via Foundry `cast` (`cast wallet sign`).
3. Retry with `X-PAYMENT: base64(JSON envelope)` — `{x402Version:2, scheme:"escrow", network:"eip155:84532", payload:{signature, authorization}}`.
4. Success carries `X-PAYMENT-RESPONSE` (base64 JSON settlement proof) — folded into each receipt as `receipt.settlement`.
5. A failed request is **never billed** (docs guarantee; 402/4xx = no charge). Retries always use a fresh nonce.

The x402 `exact` scheme (EIP-3009 over USDC, facilitator-verified) is intentionally *not* hand-rolled — the docs recommend the `@x402/fetch` client for that; escrow is simpler and sufficient.

## Design notes (why this matches the rubric)

- **Technical (35 pts):** one goal, five Intents bought *while running*, parallel dispatch via `Promise.allSettled`, per-intent failure isolation — the app degrades to 4/5 intelligence pieces and says so in the memo.
- **Commercial (30 pts):** the output is the exchange's own artifact: a risk memo a listings committee can act on, with per-item cost — "a few dollars and ninety seconds, against weeks of analyst time."
- **Adoption (15 pts):** the desk is a callable library (`runDesk()` in `src/desk.mjs`) — a second agent can drive it; the `serve.mjs` endpoint exposes it over HTTP.
- **Integration quality (10 pts):** receipts carry miner id, cost, latency and `signal_hash` (look up at `GET /engine/v1/signal/{hash}`); settlement proofs kept for audit.
- **Proof (10 pts):** `npm run demo` is the repeatable demo; memos include a "How to reproduce" block with the exact command.
- **Safe handling:** hard spending caps (run + per-intent, reconciled against each other in `config.mjs`), keys only via env, no key material ever written to memos/logs.

## Layout

```
src/config.mjs   intents + spending caps (the "what intelligence do we need" layer)
src/engine.mjs   Engine client: ask() real, makeMockAsk() deterministic offline sim
src/x402.mjs     escrow payment adapter (402 → personal_sign via cast → X-PAYMENT retry)
src/desk.mjs     orchestration: parallel buys, cap enforcement, risk assessment, hash
src/memo.mjs     markdown + html rendering (the cost line is the last line, always)
src/cli.mjs      command line entry        src/serve.mjs  local web UI
test/            node:test suite, network-free
```

## Next steps for the hackathon (Nov 1+)

1. Swap mock → real after funding; run against 2–3 real pending-listing candidates and keep every receipt.
2. Add the second Mission 01 example build ("surveillance that only bills when it finds something" — continuous `WASH_TRADING_DETECTION` buys) for the multi-mission delivery-award path.
3. At the **Nov 14 milestone**, show this memo with real receipts — that's the "first working Telegraph purchase" the milestone asks for.
