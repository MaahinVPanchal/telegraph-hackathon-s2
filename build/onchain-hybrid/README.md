# onchain-hybrid local patch

The worker patch and companion YAML proposal are committed in public GitHub repositories, but are not
deployed or registered. The YAML still uses `http://localhost:8787`; it is not a production endpoint.
No paid calls, wallet signatures, or rank claims are part of this work. The separate `upload/` snapshot
remains unchanged.

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

An explicit `chain` or `chain_id` is required; omitting both returns `CHAIN_REQUIRED`. There is no
Ethereum compatibility default or question parser: the untouched canonical `address` + `block` request
is expected to fail until Engine declares/supplies a chain or a separately approved adapter is defined.
A `question` parameter is rejected
as `QUESTION_UNSUPPORTED`; there is no LLM or heuristic question parser. Generic `gas` is deliberately
unsupported: a receipt exposes gas used, effective gas price, and fee as separate fields. Token supply
means only ERC-20 `totalSupply()`, not circulating supply.

## Chain, block, cache, and provenance behavior

- State metrics resolve `latest` to the selected chain's head or use the exact requested numbered block.
  Historical reads are never replaced with latest state or clamped to head.
- The future-block check fetches the selected chain's current `eth_blockNumber` for every request and
  rejects only a block above that fresh head.
- Responses include requested and resolved chain/block, chain ID, source label(s), units, and exact
  integer strings where applicable. A decimal-scaled amount is never substituted for its raw integer.
- Head values are not cached. Numbered state reads, logs, and receipts are not result-cached because a
  reorg can change their canonical evidence. Latest state results alone have a one-second
  chain- and argument-partitioned cache.
- Receipt success requires matching requested/returned transaction hashes and matching mined
  transaction/receipt block numbers and hashes. The verified mined `block_hash` is returned.
- Logs are checked against the requested address, topics, and block range; malformed or removed entries
  fail instead of being relabeled as valid evidence.
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
npm test
npm run test:multichain-live
npm run test:performance
```

`test:unit` uses clearly labeled synthetic fixtures for cache/reorg, future-head, receipt identity, log
filter, and operation behavior. These are logic tests, not live-chain evidence. `test:live` covers
Ethereum-only direct-worker requests and explicitly adds `chain=ethereum` in its test harness. The
`evaluator shape` check is not an Engine E2E test: the untouched canonical `address` + `block` request
returns `CHAIN_REQUIRED`. No Ethereum default adapter is implemented.

`test:multichain-live` performs read-only, same-block balance comparisons on each supported chain. It
reports PASS/FAIL/SKIP separately, including source hosts, chain ID, block, exact wei, and fresh-read
latency. Provider 403s or unavailable archive reads are SKIPs, never PASS. `test:performance` reports
cold/warm p50/p95 for every operation/chain using synthetic fetch fixtures; it measures local service
overhead and cache policy, not production RPC latency or a mission response-time SLA. The mock
failure-budget suite remains separate.

## Required review before any deployment or registration

1. Engine acceptance of `chain`/`chain_id` and the proposed operation inputs remains unconfirmed. Keep
   deployment blocked until a sanctioned Engine test establishes the accepted contract.
2. Confirm route validation and supported parameter shapes for each operation; the live intent currently
   scores only `balance_gwei`.
3. Confirm whether transaction, receipt, log, gas, and total-supply outputs have any declared scored
   fields. Until then, they are local evidence outputs only.
4. Confirm the production fallback/archive policy and live RPC availability for each selected chain.
5. After separate approval, acceptance must exercise Engine → updated YAML → deployed Worker → matching
   chain-ID-verified RPC → correct scored output. No rank improvement is implied.
