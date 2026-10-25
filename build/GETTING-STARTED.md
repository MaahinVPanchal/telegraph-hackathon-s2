# Getting Started — create your test accounts, then watch the project run

> Everything here is verified against the live testnet on 26 Oct 2026 (RPCs, faucets, contract
> addresses come from Telegraph's own docs). Total cost: **$0** — testnet tokens are free.

## Part 1 — The three "accounts" you need

Telegraph has no signup form. Your **wallet is your account** — you'll use the same wallet as
the miner owner, the escrow funder, and the desk's payer. Create a **fresh** one for this project.

### Step 1 — Create a fresh wallet (5 min)

1. Install **MetaMask** (metamask.io — browser extension; mobile works but desktop is easier).
2. "Create a new wallet" → set a password → **write the 12-word seed phrase on paper**, never in a
   screenshot/cloud note/commit. This wallet holds testnet money only, but treat it as practice
   for real hygiene.
3. MetaMask gives you an address like `0x…` — that's your **EVM account**. One wallet can hold
   many accounts ("accounts" inside MetaMask are just more addresses from the same seed).
   The first one is fine for everything.

### Step 2 — Add the Base Sepolia network (2 min)

MetaMask → Add network → Add manually:

| Field | Value |
|---|---|
| Network name | Base Sepolia (testnet) |
| RPC URL | `https://sepolia.base.org` (official) or `https://base-sepolia-rpc.publicnode.com` |
| Chain ID | `84532` |
| Currency symbol | `ETH` |
| Explorer | `https://sepolia.basescan.org` |

Both RPCs verified live (chainId responds `0x14a34` = 84532).

### Step 3 — Faucet free testnet money (10 min)

You need two tokens: **ETH** (pays gas) and **USDC** (pays for intelligence).

- **ETH** → [faucet.quicknode.com/base/sepolia](https://faucet.quicknode.com/base/sepolia) — sign in
  with GitHub, paste your wallet address, receive testnet ETH. (Alternative: Alchemy's faucet after
  creating a free Alchemy account.)
- **USDC** → [faucet.circle.com](https://faucet.circle.com) — sign in with GitHub, choose Base
  Sepolia, paste the same address. This is the official Circle (USDC issuer) faucet. Get ~$5 worth.

On-chain USDC contract on Base Sepolia (from Telegraph's docs): `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
You can check your balances at sepolia.basescan.org by pasting your address.

### Step 4 — Install Foundry (gives you `cast`, the signing tool) (5 min)

In **Git Bash**: `curl -L https://foundry.paradigm.xyz | bash`, then open a **new** terminal and run
`foundryup`. Verify with `cast --version`. `cast` signs messages and sends transactions from the
command line — our register script and the desk's real-mode payments both drive it.

## Part 2 — How our project actually runs

The clever bit: **you play both sides of the market**, which is exactly what the hackathon rewards
(our app proves our miner "enabled a mission" — a delivery-award tiebreaker for both tracks).

```
        THE TWO HATS YOU WEAR

  SUPPLY SIDE (miner-kit/)              DEMAND SIDE (listings-desk/)
  ─────────────────────────             ─────────────────────────────
  YAML describes your API      ──┐      Desk needs 5 kinds of answers
  registerMiner on-chain         │      Fires 5 parallel paid requests
  nodes fetch + validate YAML    │            │
  you enter the routing pool     │            ▼
         │                       │      Telegraph routes each request
         ▼                       │      to the TOP-RANKED miner
  Agents' questions arrive ◄─────┼────── (that's why rank matters:
  you answer them                │       #1 gets 70% of traffic)
  you EARN MACHINA               │            │
  (fee address)                  │            ▼
                                 │      Answer + receipt (miner, cost,
                                 └────► signal_hash, settlement proof)
                                        Desk combines into a risk memo
                                        with a COST LINE
```

**The money path** (one request): desk pays `0.01 USDC` → 2% to Treasury → 98% sits in a TWAP
escrow that drips into Uniswap over 24h, buys MACHINA → MACHINA lands at the **miner's fee
address**. Pricing is USDC; payouts arrive as MACHINA.

**Mock vs real** (`listings-desk`):

- `npm run demo` (mock): the desk's brain runs identically — 5 parallel "purchases", receipts,
  risk memo, cost line — but `makeMockAsk()` in `src/engine.mjs` fakes the miners. No wallet, no
  money. Use this to build/verify logic.
- `--mode real` (`src/x402.mjs`): the Engine answers the first call with `402` + payment options.
  The desk picks the **escrow** scheme, fills the message template (lowercased address, fresh
  nonce, validity window), signs it with `cast wallet sign`, retries with the `X-PAYMENT` header,
  and captures the settlement proof from `X-PAYMENT-RESPONSE`. Failed requests are never billed.

## Part 3 — The test plan, in order

```bash
# 0. Prove the app brain works (no wallet needed — already passing)
cd listings-desk && npm test && npm run demo

# 1. Prove the miner request contracts hit real APIs (no wallet needed)
cd ../miner-kit && node smoke/run-smoke.mjs

# 2. After Steps 1–4 above (wallet + faucets + Foundry), set up .env
cd miner-kit && cp .env.example .env
#    Fill: MINER_PRIVATE_KEY (wallet), FEE_ADDRESS (same wallet), RPC_URL
#    (e.g. https://base-sepolia-rpc.publicnode.com — works without an account)

# 3. Confirm the Intents we target are still canonical on-chain (free read)
source .env && ./check-intents.sh ONCHAIN_METRIC_VERIFY

# 4. Host the YAML (Pinata/web3.storage free tier → IPFS URL, or any HTTPS URL),
#    then validate + register:
node validate.mjs miners/onchain-metric-publicnode.yaml   # or paste YAML in integrate.telegraphprotocol.com
YAML_FILE=miners/onchain-metric-publicnode.yaml YAML_URL=ipfs://… ./register.sh

# 5. Watch yourself come alive (~1 min; then check the catalogue)
curl -s https://devnode.telegraphprotocol.com/api/miners | grep onchain-metric-publicnode

# 6. Fund the desk's escrow ONCE (approve USDC, then deposit $5 = 5_000_000 μUSDC)
export USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
export DIAMOND=0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8
cast send $USDC   "approve(address,uint256)" $DIAMOND 5000000 --rpc-url $RPC_URL --private-key $MINER_PRIVATE_KEY
cast send $DIAMOND "depositUSDC(uint256)"            5000000 --rpc-url $RPC_URL --private-key $MINER_PRIVATE_KEY

# 7. The full loop — your desk buys intelligence (possibly from your own miner once it ranks):
cd ../listings-desk && node src/cli.mjs 0xA0b8…eB48 --mode real
#    → memos/<token>-<date>.html is your first REAL artifact for the Nov 14 milestone.
```

**What success looks like:** your miner slug appears in `/api/miners` (`activation_status: active`);
a real desk run prints a memo whose receipts show real miner names, real costs, and
`signal_hash` values you can look up at `GET /engine/v1/signal/{hash}`.

## Safety rails (already built into the project)

- Spending caps: `MAX_USD_PER_RUN=0.10`, `MAX_USD_PER_INTENT=0.02` — enforced before dispatch
  and re-checked after every purchase; a cap breach aborts the run.
- `register.sh` verifies every Intent is canonical on-chain **before** sending anything, and asks
  for a y/N confirmation.
- Keys live only in `.env` (git-ignored). Mock mode is labelled on every receipt, so nobody can
  mistake simulated results for purchased ones.
