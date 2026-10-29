# 🚨 MIGRATION RUNBOOK — Telegraph moved chains (Base Sepolia → Ethereum Sepolia)

> Discovered 27 Oct while debugging the 0.0000 score: the 0.0000 wasn't (only) the label bug —
> **the whole platform migrated to a new deployment on a new chain**, which is why the node
> dropped 50 miners, the dispatcher lost our registrations, and Anjoman rejected our Intents
> as non-canonical. Everything below is from the CURRENT official docs
> (docs.telegraphprotocol.com/docs/miners/miner-registration + protocol/addresses-and-params).

## Old vs New

| | OLD (dead for us) | NEW (current) |
|---|---|---|
| Chain | Base Sepolia (84532) | **Ethereum Sepolia (11155111)** |
| Diamond | 0x5a2324aA…7ff8 | **0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b** |
| MACHINA token | (old address) | **0xd68305cA83C7AF42A4F720144E7416fB53F8AaF4** |
| Test USDC | 0x036CbD53… (Base Sepolia) | **0xcc194e1a843B658526D0D5C431f670028582Ae17** — **permissionless `mint()`!** |
| Registration | free | **bonded**: $1 first intent, $0.10 per further intent (≤9), $0.07 after — paid in MACHINA, **returned on deregister** (2-day delay) |
| Intents | plain names (`ONCHAIN_METRIC_VERIFY`) | **`_GENERAL` names + per-currency FX** (`FX_NOW_EUR/CAD/SEK`); prefixes (`FX_NOW`) revert |
| Our stranded assets | 0.000086 ETH + 15 USDC on Base Sepolia (written off — testnet) | — |

**Already have on the NEW chain:** 0.05 ETH gas (the mystery faucet drop — that was Ethereum Sepolia all along ✅).

## What we keep

- ✅ YAMLs (hosted, hashes verified): onchain `0xeedac315…` · weather `0x57c879fc…` · fx `0x2f2cd939…` — all with the `_GENERAL` intents
- ✅ All the knowledge: builder patterns, label_field lesson, retry/caps code (the Engine/x402 flow is the same node, now at ethereum-sepolia RPC)

## Migration steps (in order)

```bash
# 0. Point the environment at the NEW chain
export RPC=https://ethereum-sepolia-rpc.publicnode.com
export DIAMOND=0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b
export MACHINA=0xd68305cA83C7AF42A4F720144E7416fB53F8AaF4
export USDC=0xcc194e1a843B658526D0D5C431f670028582Ae17
# gas: the 0.05 ETH already in the wallet on Ethereum Sepolia ✅

# 1. Mint free test USDC (permissionless, 10 USDC)
cast send $USDC "mint(address,uint256)" $FEE_ADDRESS 10000000 --rpc-url $RPC --private-key $KEY

# 2. Swap 4 USDC → ~5.2 MACHINA (bonds need ~$3.30 total for 3 miners)
cast send $USDC "approve(address,uint256)" 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E 4000000 --rpc-url $RPC --private-key $KEY
cast send 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E \
  "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" \
  "($USDC,$MACHINA,3000,$FEE_ADDRESS,4000000,0,0)" --rpc-url $RPC --private-key $KEY

# 3. Register the three miners (bond taken at pool price)
#    onchain:  1 intent  → $1 bond
#    weather:  2 intents → $1.10
#    fx:       3 intents → $1.20
cast send $DIAMOND "registerMiner(string,bytes32,address,uint256,string[])" \
  "$YAML_URL" "$YAML_HASH" "$FEE_ADDRESS" 10000 '["ONCHAIN_METRIC_VERIFY_GENERAL"]' \
  --rpc-url $RPC --private-key $KEY
# (repeat for weather + fx with their hashes/intents)

# 4. Verify: nodes detect the events and list you in the catalogue
curl -s https://devnode.telegraphprotocol.com/api/miners | grep publicnode
```

## Escrow for the desk (app side)

Same flow, new chain: `approve` + `depositUSDC` on the NEW Diamond with the NEW USDC. The old $5 on Base Sepolia is stranded (testnet write-off). The desk's x402 client is unchanged — the Engine base URL stays `devnode.telegraphprotocol.com/engine`.

## Anjoman

Anjoman reads the NEW deployment — which is why it rejected our Intents as non-canonical. Once the miners are re-registered here (with the `_GENERAL` names), they satisfy Anjoman's check too. Its registry mirror showed exactly the old-chain state (1,872 = pre-migration count).

## ✅ Status (27 Oct ~00:15)

Steps 1–3 executed and confirmed on-chain (mint, swap, bonds approved, 3 registrations: 4848/4849/4850). Node activation: pending — check `node build/check-leaderboard.mjs` in the morning; if still pending after several hours, report in Telegraph Discord (node-side re-index backlog).
