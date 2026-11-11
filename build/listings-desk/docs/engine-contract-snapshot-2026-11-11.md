# Engine contract snapshot for the Listings Desk

The live API schema GETs below were captured at **2026-11-11T20:32:53+05:30**. The official documentation pages were retrieved on **2026-11-11**; the web retrieval tool did not expose their exact retrieval time. No paid request was sent.

## Sources

- `GET https://devnode.telegraphprotocol.com/engine/v1/intents` — 136 intents reported.
- `GET https://devnode.telegraphprotocol.com/engine/v1/intents/SMART_CONTRACT_AUDIT`
- `GET https://devnode.telegraphprotocol.com/engine/v1/intents/ONCHAIN_METRIC_VERIFY`
- `GET https://devnode.telegraphprotocol.com/engine/v1/intents/SANCTIONS_SCREENING_MATCH`
- `GET https://devnode.telegraphprotocol.com/engine/v1/intents/SOCIAL_BOT_DETECTION`
- `GET https://devnode.telegraphprotocol.com/engine/v1/intents/CODE_REVIEW`
- [Make a Request](https://anjoman.ai/docs/using/engine-ask) (page reports Updated November 10, 2026).
- [Pay from Escrow](https://anjoman.ai/docs/using/escrow-inference) (page reports Updated November 1, 2026).

## Listing-check contract comparison

| Listing check | Published request | Published response | Desk disposition |
|---|---|---|---|
| `SMART_CONTRACT_AUDIT` | No request schema | No response format; endpoint reports no active miner | Unsupported; mandatory |
| `ONCHAIN_METRIC_VERIFY` | `address` string and `block` integer, 0–1,000,000,000,000. `chain` is not a request param. | `balance_gwei` number, range 0–100,000,000,000,000,000,000; address/block/chain metadata. | Does not establish holder concentration, liquidity or age; unsupported for this policy; mandatory |
| `SANCTIONS_SCREENING_MATCH` | `name` string | `name`, `matched` bool, `matches` list, `lists` list, `match_score` number 0–1 | Schema-supported only for explicit entity names and matching shaped output; endpoint reports `miner_count: 0`, so provider availability is unverified |
| `SOCIAL_BOT_DETECTION` | `account` string | `account`, `verdict` enum (`bot`, `likely_bot`, `inconclusive`, `likely_human`, `human`), `bot_score` number 0–1, `signals` list | Schema-supported only for explicitly provided accounts; endpoint reports `miner_count: 0`, so provider availability is unverified. The 0.25 decision threshold is application policy, not an Engine guarantee |
| `CODE_REVIEW` | `code` string | `verdict` enum (`Approve`, `Request changes`, `Comment`), `findings` list, `summary` string | Does not establish repository history or contributor authenticity; unsupported for this policy; mandatory |

The listed response-field values are from each intent's `response.fields` contract. The Engine ask docs say shaped responses use `result_shape: "intent"` and `field_status` values `ok`, `missing`, `rejected`, or `unavailable`; `result_shape: "raw"` may still be HTTP 200 and paid. This desk has no specifically validated raw-result adapter, so raw output is not decision evidence.

## Escrow contract notes

The official escrow guide documents an `escrow` challenge entry with `network`, `payTo`, `extra.resource`, and `extra.message`. The message includes `Network`, `Pay To`, `Amount: <integer> uUSDC`, and `Resource` lines plus `{from}`, `{nonce}`, `{validAfter}`, and `{validBefore}` placeholders. The guide's testnet example uses `eip155:11155111`, a Sepolia Diamond, and resource `/v1/ask`; these are documentation examples, not implicit trusted application defaults.

The documented receipt has `receipt_hash`, `rail`, `payer`, `miner`, `intent`, `amount_uusdc`, `epoch_id`, `settlement: "epoch"`, `chain: "telegraph"`, and `timestamp`. It has no per-request `tx_hash`; the epoch is not treated as finalized merely because the request receipt is present.

The app therefore requires explicit expected network, payee, origin and resource configuration; it rejects a missing/ambiguous amount or template disagreement before calling a signing method. Confirm the current challenge against trusted deployment configuration before enabling real mode.

## Resulting limitation

The existing five-check Mission 01 policy remains mandatory. Three checks do not have a supported matching response contract; two can be requested only with explicit entity/account inputs and do not resolve missing candidate identities. A complete five-check safe fixture cannot be derived from these published response shapes without inventing fields. Until the Engine publishes compatible contracts and accepts the required candidate inputs, this app returns REVIEW/UNKNOWN (or NO-GO for a validated sanctions match), not GO.
