# onchain-hybrid local patch

This directory is a local proposal for `onchain-metric-publicnode`. Nothing in this patch is deployed,
published, registered, paid for, or signed. The remote Worker revision was not inspected; do not assume
it matches this checkout. The associated public YAML staging copy is intentionally unchanged.

## Supported-operation matrix

| Metric | Required inputs | Output and limits |
|---|---|---|
| `eth_balance` | `chain`, `address`, optional `block_number` | Exact raw wei and decimal native amount; `balance_gwei` is emitted for ETH-native chains, not Polygon POL |
| `tx_count` | `chain`, `address`, optional `block_number` | Account nonce only; it is not total transaction activity |
| `code` | `chain`, `address`, optional `block_number` | `has_code` and byte count; bytecode is not returned |
| `erc20_balance` | `chain`, holder `address`, `token`, optional `block_number` | Exact raw token units; decimal token value only when `decimals()` is readable |
| `tx_receipt` | `chain`, `tx_hash` | Pending or mined state, receipt status, `gas_used`, `effective_gas_price_wei`, and exact fee when available; missing transaction is HTTP 404 |
| `logs` | `chain`, `from_block`, `to_block`, plus contract `address` and/or `topic0`–`topic3` | Filtered logs over at most 2,001 inclusive blocks; at most 100 records and 4,096 serialized bytes |
| `total_supply` | `chain`, token contract, numbered `block_number` | ERC-20 `totalSupply`, raw and decimal-scaled when decimals are readable; never circulating supply |

Supported explicit chains are Ethereum mainnet (1), Polygon PoS (137, native POL; see
[Polygon network details](https://docs.polygon.technology/pos/reference/rpc-endpoints/)), and Arbitrum One
(42161, native ETH; see [Arbitrum chain info](https://docs.arbitrum.io/chain-info)). Each RPC provider must
return the expected `eth_chainId` before its result is trusted. Caller-supplied RPC URLs are rejected.
`ARCHIVE_RPC_URL`, when configured by an operator, is not a request parameter and is still chain-ID checked.

An explicit `chain` or `chain_id` is required; omitting both returns `CHAIN_REQUIRED`. This intentionally
avoids silently selecting a network, but requires Engine-contract review before any publication. A
`question` parameter is rejected
as `QUESTION_UNSUPPORTED`; there is no LLM or heuristic question parser. Generic `gas` is deliberately
unsupported: a receipt exposes gas used, effective gas price, and fee as separate fields. Token supply
means only ERC-20 `totalSupply()`, not circulating supply.

## Chain, block, cache, and provenance behavior

- State metrics resolve `latest` to the selected chain's head or use the exact requested numbered block.
  Historical reads are never replaced with latest state or clamped to head.
- The future-block check uses the selected chain's `eth_blockNumber` and rejects any requested block
  above that exact head.
- Responses include requested and resolved chain/block, chain ID, source label(s), units, and exact
  integer strings where applicable. A decimal-scaled amount is never substituted for its raw integer.
- Head cache keys include chain. Result keys include canonical chain, operation, every relevant argument,
  and requested block; fallback results share the same chain/argument partitioning.
- Ethplorer is an Ethereum-only fallback for `eth_balance` at `latest`. It cannot answer Polygon or
  Arbitrum requests, historical requests, or other operations.
- JSON-RPC attempts have per-attempt and total deadlines. Upstream bodies are bounded; answers over
  4,096 bytes and log sets over 100 entries fail with HTTP 413, without truncation.
- Failures use real HTTP status codes and `ok:false`; there are no success-shaped fallback values.

## Engine and mission contract caveat

Mission 14 describes logs, gas consumption, token balances, and wallet transaction states as use cases:
[Web3 Native and DeFi mission](https://hackathon.telegraphprotocol.com/missions/web3-defi). That mission
description is not an input/output schema.

The live [`ONCHAIN_METRIC_VERIFY_GENERAL` intent](https://devnode.telegraphprotocol.com/engine/v1/intents/ONCHAIN_METRIC_VERIFY_GENERAL)
was re-fetched for this patch. Its request declares `address` and `block`; its scored response is
`balance_gwei`. `chain` appears only as off-chain response evidence, not as a declared request parameter.
It does not declare `metric`, `tx_hash`, log filters, or token-contract inputs. This local descriptor
documents proposed worker inputs only; neither its `input_schema` nor YAML parameter descriptions prove
the Engine router accepts those inputs. No extra operation is claimed as scored, and none is mapped into
`balance_gwei`.

The [miner YAML guide](https://anjoman.ai/docs/miners/yaml-config) describes `input_schema` as top-level
metadata surfaced to callers; it does not establish that it performs router validation. This patch uses
actual HTTP failures rather than HTTP 200 failures, so no `errors.status_path`/`success_values` mapping is
used to disguise errors.

## Local run and tests

Node.js >= 19; no added package dependencies.

```powershell
npm start
npm run test:unit
npm run test:mock
npm run test:live
npm run test:contract
```

`test:unit` includes synthetic chain-ID, chain/cache isolation, future-block, input-validation, transaction,
log-size, token-decimal, timeout, and response-provenance cases. Synthetic fixtures are not live-chain
evidence. The latest local validation passed 83 deterministic checks, 14 mock failover/deadline checks,
15 live checks, and 22 strict contract checks. The measured worst-case mock request was 8,009 ms against
the configured 8,000 ms deadline (the test allows 500 ms for timer scheduling overhead).

Read-only same-block comparisons also matched exact wei values across independent providers: Ethereum at
block 21,000,000 (`ethereum-mainnet.gateway.tatum.io` and `eth.drpc.org`); Polygon at block 97,130,176
(`polygon.publicnode.com` and `1rpc.io`); and Arbitrum One at block 523,279,362
(`arbitrum.publicnode.com` and `arbitrum.drpc.org`). The Polygon and Arbitrum probes verified chain IDs
137 and 42161 respectively. These samples verify only those provider responses at those blocks; they do
not establish continuous availability or production provider suitability.

## Required review before any deployment or registration

1. Decide whether the Engine will supply a chain despite the live request schema omitting it, or whether a
   documented Ethereum-only compatibility policy is required.
2. Confirm route validation and supported parameter shapes for each operation; the live intent currently
   scores only `balance_gwei`.
3. Confirm whether transaction, receipt, log, gas, and total-supply outputs have any declared scored
   fields. Until then, they are local evidence outputs only.
4. Confirm the production fallback/archive policy and live RPC availability for each selected chain.
5. After separate approval, acceptance must exercise Engine → updated YAML → deployed Worker → matching
   chain-ID-verified RPC → correct scored output. No rank improvement is implied.
