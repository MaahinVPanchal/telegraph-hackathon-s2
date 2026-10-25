#!/usr/bin/env bash
# register.sh — on-chain miner registration on Base Sepolia (DOES NOT RUN AUTOMATICALLY).
#
# Read through it, fill .env (copy .env.example), run check-intents.sh first,
# then run this script for ONE yaml at a time:
#
#   YAML_FILE=miners/fx-now-frankfurter.yaml ./register.sh
#
# Costs: gas only (a few cents of Base Sepolia ETH). No bond, no stake.
# Docs: https://docs.telegraphprotocol.com/docs/miners/miner-registration

set -euo pipefail

: "${MINER_PRIVATE_KEY:?set MINER_PRIVATE_KEY in .env (wallet that will own the registration)}"
: "${FEE_ADDRESS:?set FEE_ADDRESS in .env (EVM address that receives MACHINA payouts)}"
: "${RPC_URL:?set RPC_URL in .env (Base Sepolia RPC, e.g. https://base-sepolia.g.alchemy.com/v2/<key>)}"
: "${YAML_FILE:?usage: YAML_FILE=miners/fx-now-frankfurter.yaml ./register.sh}"

DIAMOND="${DIAMOND:-0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8}"
MIN_PRICE="${MIN_PRICE:-10000}"   # 0.01 USDC in 6-decimal units — the minimum allowed

command -v cast >/dev/null || { echo "cast not found — install Foundry: https://getfoundry.sh"; exit 1; }

echo "== register: $YAML_FILE =="
echo "   wallet:      $(cast wallet address --private-key "$MINER_PRIVATE_KEY" 2>/dev/null || echo '(could not derive — check key)')"
echo "   fee address: $FEE_ADDRESS"
echo "   diamond:     $DIAMOND (Base Sepolia)"
echo

# 1. Hash the EXACT bytes you will host (sha256 — NOT keccak; the node verifies sha256)
YAML_URL="${YAML_URL:?set YAML_URL to the public IPFS/HTTPS url of this exact file (pin first!)}"
YAML_HASH="0x$(sha256sum "$YAML_FILE" | awk '{print $1}')"
echo "   yaml hash:  $YAML_HASH"
echo "   yaml url:   $YAML_URL"

# 2. Extract supported intents from the YAML's semantics.supported_intents block
INTENTS=$(awk '/supported_intents:/{f=1;next} f&&/^[[:space:]]+-[[:space:]]/{gsub(/^[[:space:]]+-[[:space:]]*/,"");print;next} f&&/^[^[:space:]]/{exit}' "$YAML_FILE")
if [ -z "$INTENTS" ]; then echo "no supported_intents found in $YAML_FILE"; exit 1; fi
echo "   intents:    $INTENTS"

# 3. Sanity-check each intent is canonical (exact, case-sensitive) before spending gas
INTENT_JSON="["
first=1
while IFS= read -r i; do
  i=$(echo "$i" | tr -d '[:space:]"')
  [ -z "$i" ] && continue
  OK=$(cast call "$DIAMOND" "isCanonicalIntent(string)(bool)" "$i" --rpc-url "$RPC_URL")
  echo "   isCanonicalIntent($i) = $OK"
  if [ "$OK" != "true" ]; then echo "   ABORT: $i is not canonical — registration would revert"; exit 1; fi
  [ $first -eq 1 ] && first=0 || INTENT_JSON="$INTENT_JSON,"
  INTENT_JSON="$INTENT_JSON\"$i\""
done <<< "$INTENTS"
INTENT_JSON="$INTENT_JSON]"

echo
read -r -p "Send registerMiner transaction? [y/N] " CONFIRM
[ "$CONFIRM" = "y" ] || { echo "aborted (nothing sent)"; exit 0; }

cast send "$DIAMOND" \
  "registerMiner(string,bytes32,address,uint256,string[])" \
  "$YAML_URL" \
  "$YAML_HASH" \
  "$FEE_ADDRESS" \
  "$MIN_PRICE" \
  "$INTENT_JSON" \
  --rpc-url "$RPC_URL" \
  --private-key "$MINER_PRIVATE_KEY"

echo
echo "Sent. Get your registrationId from the receipt, then check activation:"
echo "  curl -s https://devnode.telegraphprotocol.com/api/miners/<registrationId> | jq '.miner | {activation_status, rejection_reason}'"
echo "Note: nodes fetch $YAML_URL and verify it hashes to $YAML_HASH — host the EXACT same bytes (watch trailing newlines)."
