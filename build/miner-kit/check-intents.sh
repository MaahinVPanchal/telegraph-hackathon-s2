#!/usr/bin/env bash
# check-intents.sh — read the LIVE canonical intent set from the Diamond contract.
# The canonical set changes over time; always read it, never copy from a doc.
#
#   ./check-intents.sh                 # list all canonical intents
#   ./check-intents.sh FX_NOW          # check one intent (exact, case-sensitive)

set -euo pipefail
: "${RPC_URL:?set RPC_URL in .env (Base Sepolia RPC)}"
DIAMOND="${DIAMOND:-0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8}"

if [ $# -ge 1 ]; then
  cast call "$DIAMOND" "isCanonicalIntent(string)(bool)" "$1" --rpc-url "$RPC_URL"
else
  echo "Live canonical intents on-chain:"
  cast call "$DIAMOND" "getCanonicalIntents()(string[])" --rpc-url "$RPC_URL" | tr ',' '\n'
fi
