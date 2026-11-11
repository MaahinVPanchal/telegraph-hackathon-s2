# Engine contract snapshot for the Listings Desk

Category-level schemas were captured at **2026-11-11T20:32:53+05:30**. The concrete leaf-intent schemas and miner counts below were retrieved at **2026-11-11T21:25:46+05:30**. Official documentation pages were retrieved on **2026-11-11**; the web retrieval tool did not expose their exact retrieval time. No paid request was sent.

## Sources

- `GET https://devnode.telegraphprotocol.com/engine/v1/intents` — 136 intents reported.
- Category entries:
  - `GET https://devnode.telegraphprotocol.com/engine/v1/intents/SMART_CONTRACT_AUDIT`
  - `GET https://devnode.telegraphprotocol.com/engine/v1/intents/ONCHAIN_METRIC_VERIFY`
  - `GET https://devnode.telegraphprotocol.com/engine/v1/intents/SANCTIONS_SCREENING_MATCH`
  - `GET https://devnode.telegraphprotocol.com/engine/v1/intents/SOCIAL_BOT_DETECTION`
  - `GET https://devnode.telegraphprotocol.com/engine/v1/intents/CODE_REVIEW`
- Concrete leaves:
  - `GET https://devnode.telegraphprotocol.com/engine/v1/intents/SMART_CONTRACT_AUDIT_GENERAL`
  - `GET https://devnode.telegraphprotocol.com/engine/v1/intents/ONCHAIN_METRIC_VERIFY_GENERAL`
  - `GET https://devnode.telegraphprotocol.com/engine/v1/intents/SANCTIONS_SCREENING_MATCH_GENERAL`
  - `GET https://devnode.telegraphprotocol.com/engine/v1/intents/SOCIAL_BOT_DETECTION_GENERAL`
  - `GET https://devnode.telegraphprotocol.com/engine/v1/intents/CODE_REVIEW_GENERAL`
- [Intent catalog](https://anjoman.ai/docs/using/intents)
- [Make a Request](https://anjoman.ai/docs/using/engine-ask) (page reports Updated November 10, 2026).
- [Pay from Escrow](https://anjoman.ai/docs/using/escrow-inference) (page reports Updated November 1, 2026).

## Internal checks and concrete Engine intents

The desk's mandatory policy keys are internal check names, not requestable Engine IDs. Requests, response `intent`, and escrow receipt `intent` use the corresponding concrete leaf IDs.

| Internal check | Concrete Engine intent | Listed miners | Published request / response | Desk disposition |
|---|---|---:|---|---|
| `SMART_CONTRACT_AUDIT` | `SMART_CONTRACT_AUDIT_GENERAL` | 17 | No request schema or response format | Unsupported; mandatory |
| `ONCHAIN_METRIC_VERIFY` | `ONCHAIN_METRIC_VERIFY_GENERAL` | 42 | Request: `address` string and `block` integer (0–1,000,000,000,000); response: `balance_gwei` plus address/block/chain metadata | Balance does not establish holder concentration, liquidity or age; unsupported for this policy; mandatory |
| `SANCTIONS_SCREENING_MATCH` | `SANCTIONS_SCREENING_MATCH_GENERAL` | 19 | Request: `name` string; response: `name`, `matched`, `matches`, `lists`, `match_score` | Schema-supported only for explicit entity names and matching shaped output |
| `SOCIAL_BOT_DETECTION` | `SOCIAL_BOT_DETECTION_GENERAL` | 16 | Request: `account` string; response: `account`, `verdict` (`bot`, `likely_bot`, `inconclusive`, `likely_human`, `human`), `bot_score` 0–1, `signals` | Schema-supported only for explicitly supplied accounts. The 0.25 decision threshold is application policy, not an Engine guarantee |
| `CODE_REVIEW` | `CODE_REVIEW_GENERAL` | 17 | Request: `code` string; response: `verdict` (`Approve`, `Request changes`, `Comment`), `findings`, `summary` | Does not establish repository history or contributor authenticity; unsupported for this policy; mandatory |

These are miner counts listed for the concrete leaf endpoints at retrieval time. They establish neither current operational availability nor successful, accurate, or paid responses. In particular, the `SANCTIONS_SCREENING_MATCH` category entry reported zero category-level miners while its concrete `SANCTIONS_SCREENING_MATCH_GENERAL` child listed 19. A category/prefix and its concrete child intents are distinct catalog entries; a zero prefix count does not mean there are no listed leaf miners.

The listed response-field values come from each leaf's `response.fields` contract. The Engine ask docs say shaped responses use `result_shape: "intent"` and `field_status` values `ok`, `missing`, `rejected`, or `unavailable`; `result_shape: "raw"` may still be HTTP 200 and paid. This desk has no specifically validated raw-result adapter, so raw output is not decision evidence.

## Escrow contract notes

The official escrow guide documents an `escrow` challenge entry with `network`, `payTo`, `extra.resource`, and `extra.message`. The message includes `Network`, `Pay To`, `Amount: <integer> uUSDC`, and `Resource` lines plus `{from}`, `{nonce}`, `{validAfter}`, and `{validBefore}` placeholders. The app checks each placeholder is bound to its designated template line before calling a signing method. The guide's testnet example uses `eip155:11155111`, a Sepolia Diamond, and resource `/v1/ask`; these are documentation examples, not implicit trusted application defaults.

The documented receipt has `receipt_hash`, `rail`, `payer`, `miner`, `intent`, `amount_uusdc`, `epoch_id`, `settlement: "epoch"`, `chain: "telegraph"`, and `timestamp`. It has no per-request `tx_hash`; the epoch is not treated as finalized merely because the request receipt is present.

The app therefore requires explicit expected network, payee, origin and resource configuration; it rejects a missing/ambiguous amount or template disagreement before calling a signing method. Confirm the current challenge against trusted deployment configuration before enabling real mode.

## Resulting limitation

The existing five-check Mission 01 policy remains mandatory. Three checks do not have a supported matching response contract; two can be requested only with explicit entity/account inputs and do not resolve missing candidate identities. A complete five-check safe fixture cannot be derived from these published response shapes without inventing fields. Until the Engine publishes compatible contracts and accepts the required candidate inputs, this app returns REVIEW/UNKNOWN (or NO-GO for a validated sanctions match), not GO.
