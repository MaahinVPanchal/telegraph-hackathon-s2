# Miner Kit — ready-to-register Telegraph Miners

Three YAML miners, each targeting a ★ Season II priority Intent where the live testnet's
**#1-ranked miner is beatable** (scores measured 26 Oct 2026 from `GET devnode.telegraphprotocol.com/api/miners`,
1,919 active miners):

| YAML | Intent | Why this one | Incumbent #1 score |
|---|---|---|---|
| `miners/onchain-metric-publicnode.yaml` | `ONCHAIN_METRIC_VERIFY` (4 missions, priority 10) | Active registration 4856 uses Ethplorer; `ETH.balance` returns the native balance in ETH units. `ocm-ethplorer-addr` scored **0.3967** in epoch 443; our new registration's score is pending. | 0.3967 |
| `miners/weather-verify-openmeteo.yaml` | `WEATHER_FORECAST` + `WEATHER_FORECAST_VERIFY` (5 missions, priority 5) | Free keyless Open-Meteo, default `best_match` model (ICON pin removed 27 Oct), `hourly` required from a fixed list, `past_days` 0-7 / `forecast_days` 1-7 so answers stay ~13 KB worst case. Current `WEATHER_FORECAST` #1 scores **0.001**. | 0.001 / 0.632 |
| `miners/fx-now-frankfurter.yaml` | `FX_NOW` (4 missions, priority 8) | Frankfurter (ECB) is literally named a hub Intent in the catalogue. Great *learning* miner; note an `fx-frankfurter` miner already exists, so for competition add independence (different upstream or join FX data). | 0.791 |

**Why it matters:** routing is 70 / 20 / 10 by leaderboard rank per Intent. Taking #1 on a
4–5-mission priority Intent is worth far more than being #7 somewhere popular. Full numbers in
`../reports/network-snapshot-2026-10-26.md`.

## Morning runbook (in order)

```bash
cd miner-kit

# 0. One-time: install Foundry (gives you `cast`)  https://getfoundry.sh
#    Get Base Sepolia ETH from a faucet (you only need gas money, nothing else costs anything).

# 1. Prove the request contracts work against the real upstream APIs (free, no wallet):
node smoke/run-smoke.mjs

# 2. Host each YAML publicly and note the URL.
#    IPFS via web3.storage/Pinata, or any HTTPS URL. The node fetches this URL and
#    verifies its sha256 against the on-chain hash — host the EXACT file bytes.

# 3. Validate for free (no wallet). NOTE: as of 26 Oct the documented public
#    endpoint /api/validate 404s (console moved it behind its UI) — if so, paste
#    the YAML into the register flow at https://integrate.telegraphprotocol.com ;
#    it runs the identical checks and returns the same error strings.
node validate.mjs miners/onchain-metric-publicnode.yaml

# 4. Fill .env (copy from .env.example), then confirm intents are still canonical:
source .env 2>/dev/null || export $(grep -v '^#' .env | xargs)
./check-intents.sh                    # or: ./check-intents.sh ONCHAIN_METRIC_VERIFY

# 5. Register one miner (asks for confirmation before spending gas):
YAML_FILE=miners/onchain-metric-publicnode.yaml YAML_URL=ipfs://... ./register.sh

# 6. Watch activation (usually < 1 minute after the tx):
curl -s https://devnode.telegraphprotocol.com/api/miners | jq '[.[] | select(.slug=="onchain-metric-publicnode")]'
#    Rejected? Look up by registrationId for the reason:
curl -s https://devnode.telegraphprotocol.com/api/miners/<registrationId> | jq '.miner | {activation_status, rejection_reason}'
```

## What happens after registration

- **Grace period (7 days):** not on the leaderboard, but you share 5% of routed traffic
  equally with all other grace-period miners — that's your track record building.
- **After 7 days:** your grace-period score seeds your leaderboard rank; then the
  70/20/10 routing by rank applies. Spot checks (~every 20 s) test liveness only —
  any non-empty answer passes; fail consecutively and you're revoked until the next epoch.
- **Update later:** `updateMiner` (see register.sh pattern) swaps YAML/price/fee address atomically;
  you get a NEW registrationId and intentId.
- **API keys:** if your upstream needs a key, install it *after* registration via
  integrate.telegraphprotocol.com (bound to the wallet that owns the slug). All three
  upstreams here are keyless, so nothing to do.

## Honest notes / upgrade paths

- `ONCHAIN_METRIC_VERIFY`: the YAML calls Ethplorer's `/getAddressInfo/{address}` with constant
  `token=0x000…0&showETHTotals=false`, which suppresses the token list (2.42 MB → 446 B for
  vitalik.eth; epoch 444 failed with `miner_answer too large (223176 > 131072 bytes)`). Ethplorer
  tolerates the `block_number` the node forwards (Blockscout 422'd on it in epoch 443) but serves
  **latest state only** — historical-block questions get the current balance. The real fix is the
  hybrid service (JSON-RPC archive for historical heights). `node smoke/run-smoke.mjs` now replays
  each upstream with `block_number` added and fails any answer over 131072 bytes.
- `FX_NOW`: fine to learn with; for the delivery-award angle ("distinct commercial missions
  enabled"), independence from `fx-frankfurter` matters — e.g. blend two sources or serve a
  related thin Intent instead.
- IDs 9601–9603 and all slugs were free as of 26 Oct 2026; the register tx reverts harmlessly
  if someone took them overnight, and `updateMiner`/re-register never loses your slug when
  *you* re-register your own slug.
