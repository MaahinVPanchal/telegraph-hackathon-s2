# 🛠️ ANJOMAN BUILDER GUIDE — exact values for all 5 sections, all 3 miners

> Source of truth: the Grok-iterated YAMLs in `telegraph-miner-yaml` (pulled 27 Oct).
> The Anjoman builder fields map 1:1 to these YAML blocks. Fill miner by miner —
> all 5 sections, then Register, then start the next miner.

---

# 🪨 MINER 1 — OnChain Metric Verify (the hybrid worker)

## Section 1 · Basics

| Field | Value |
|---|---|
| Schema version | `1` |
| Integration ID | `9602` (if taken on Anjoman, try `9602` + a digit, e.g. `96021`) |
| Kind | **miner** |
| Protocol | **generic** |
| Slug | `onchain-metric-publicnode` |
| Name | `OnChain Metric Verify (Hybrid archive + Ethplorer)` |
| Description | Reads Ethereum mainnet state at a stated block height or latest and returns one small JSON answer (under 4 KB). ETH balance, transaction count (nonce), contract-code presence and ERC-20 token balance of an address, read via archive JSON-RPC at any historical block or at latest (latest ETH balance falls back to Ethplorer if every RPC fails). Answers "at block 18000000, what was the ETH balance of 0x...", "how many transactions had 0x... sent by block N", "did 0x... have contract code at block N", "what was the USDC balance of 0x... at block N". |
| Website / Documentation | `https://github.com/MaahinVPanchal/telegraph-miner-yaml` (both) |

## Section 2 · Connection

| Field | Value |
|---|---|
| base_url | `https://onchain-hybrid.panchalmaahin.workers.dev` |
| Auth | **none** — no API key (keyless worker) |

## Section 3 · Endpoints

One endpoint:

| Field | Value |
|---|---|
| path | `/query` |
| external_path | `/query` |
| method | `GET` |
| intents | `ONCHAIN_METRIC_VERIFY` |

**description** (paste — it's the engine's routing context):

```
One on-chain value for intent ONCHAIN_METRIC_VERIFY, read at the block the question states. Send address, block_number and metric. The response is compact JSON with ok, metric, address, block (always an integer block number - for latest it is the chain head the value was read at), block_tag (latest or number), value, unit and source; for eth_balance it also has balance_wei (exact integer string) and balance_eth (exact decimal string, ETH units). Answer with value in the stated unit - balance_eth when the question asks for ETH, balance_wei when it asks for wei. For historical blocks the value is the state AT that block, never the current state. A response with ok false and an error code means the question could not be answered; it never contains a guessed value.
```

**params → query → required:**

| name | type | description |
|---|---|---|
| `address` | string | Ethereum mainnet address, 0x followed by exactly 40 hex characters (42 characters total), e.g. 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045. Not an ENS name. For erc20_balance this is the holder, not the token. |

**params → query → optional:**

| name | type | description |
|---|---|---|
| `block_number` | string | Block height the question is anchored at: an integer such as 18000000 (hex such as 0x112a880 is also accepted) or the literal string latest. Defaults to latest when the question names no block. The response block field is always the integer block that was read. |
| `metric` | string | Which value to read. Send exactly one of: eth_balance (native ETH balance, the default), tx_count (number of transactions sent, i.e. the nonce), code (whether the address had contract code; value true or false), erc20_balance (balance of the ERC-20 token named in token). Nothing else is valid. |
| `token` | string | Only for metric erc20_balance: the ERC-20 token contract address, 0x followed by exactly 40 hex characters, e.g. USDC 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48. |

## Section 4 · Semantics

| Field | Value |
|---|---|
| signal_mapping label_field | `value` |
| supported intents | `ONCHAIN_METRIC_VERIFY` |

⚠️ **If Anjoman rejects `ONCHAIN_METRIC_VERIFY` as non-canonical here too** — check the intent dropdown/options this screen offers. Pick the closest Anjoman-canonical on-chain intent if one exists; otherwise this miner waits for the intent-proposal flow (docs: "Proposing a new intent").

## Section 5 · Advanced

- input_schema: required `[address]`, address = string with default `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`
- cache_ttl_sec: `2` · rate_limit_per_sec: `10`

## Registration params

| Field | Value |
|---|---|
| Fee address | `0x5549286a1C71893816899BbEF8F4CE4d91f87821` |
| Floor price (USDC) | `0.01` |

---

# 🌤️ MINER 2 — Weather Forecast Verify (Open-Meteo)

## Section 1 · Basics

| Field | Value |
|---|---|
| Schema version | `1` |
| Integration ID | `9603` |
| Kind | **miner** |
| Protocol | **generic** |
| Slug | `weather-verify-openmeteo` |
| Name | `Weather Forecast Verify (Open-Meteo)` |
| Description | Point weather forecasts and recent observed weather from the Open-Meteo API (default best_match model blend). Answers "what will the temperature/wind/precipitation be at latitude X longitude Y over the next N days" (WEATHER_FORECAST) and "did a forecast for latitude X longitude Y over the past N days verify against what was observed" (WEATHER_FORECAST_VERIFY) with hourly and daily values in metric units. |
| Website / Documentation | `https://open-meteo.com` (both) |

## Section 2 · Connection

| Field | Value |
|---|---|
| base_url | `https://api.open-meteo.com` |
| Auth | **none** |

## Section 3 · Endpoints

One endpoint:

| Field | Value |
|---|---|
| path | `/v1/forecast` |
| external_path | `/v1/forecast` |
| method | `GET` |
| intents | `WEATHER_FORECAST`, `WEATHER_FORECAST_VERIFY` |

**description** (paste):

```
Weather for a single point. Always send latitude, longitude and hourly; the response has no weather values at all unless hourly (or daily) is sent. Returns hourly and optionally daily time series in metric units - hourly.temperature_2m (degrees Celsius), hourly.precipitation (mm), hourly.precipitation_probability (percent), hourly.wind_speed_10m (km/h); daily.temperature_2m_max, daily.temperature_2m_min, daily.precipitation_sum (mm), daily.wind_speed_10m_max (km/h) - each aligned with the time array in the same block. For WEATHER_FORECAST questions set forecast_days to the window asked (1 to 7) and past_days to 0. For WEATHER_FORECAST_VERIFY questions set past_days to cover the past window being verified (1 to 7); values for past hours are the observed/analysed values to compare the issued forecast against.
```

**params → query → required:**

| name | type | description |
|---|---|---|
| `latitude` | number | Latitude in decimal degrees, -90 to 90, e.g. 51.5. |
| `longitude` | number | Longitude in decimal degrees, -180 to 180, e.g. -0.12. |
| `hourly` | string | Hourly variables. Send exactly one of these four values, character for character, and nothing else: (1) temperature_2m,precipitation,precipitation_probability,wind_speed_10m - temperature, precipitation amount, precipitation probability and wind speed; use this unless the question is only about one quantity. (2) temperature_2m - temperature only. (3) precipitation,precipitation_probability - rain/precipitation only. (4) wind_speed_10m - wind only. No other variable names are valid. |

**params → query → optional:**

| name | type | description |
|---|---|---|
| `daily` | string | Daily variables. If sent, send exactly temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max (daily max/min temperature, precipitation total and max wind) and nothing else. No other variable names are valid. |
| `forecast_days` | integer | Days ahead to forecast, integer 1 to 7 only (never more than 7). Defaults to 7. |
| `past_days` | integer | Days of past observed data to prepend, integer 0 to 7 only (never more than 7). Use 0 for WEATHER_FORECAST, 1 to 7 for WEATHER_FORECAST_VERIFY. |
| `models` | string | Weather model. Usually omit it. If sent, the only allowed value is best_match (Open-Meteo's default blend of the best models for the location). |

**param_map:** latitude→latitude, longitude→longitude, hourly→hourly, daily→daily, forecast_days→forecast_days, past_days→past_days, models→models (all identity)

## Section 4 · Semantics

| Field | Value |
|---|---|
| signal_mapping label_field | `hourly` |
| supported intents | `WEATHER_FORECAST`, `WEATHER_FORECAST_VERIFY` |

## Section 5 · Advanced

- input_schema: required `[latitude, longitude, hourly]`; latitude/longitude numbers with min/max; hourly enum of the four accepted lists; forecast_days 1–7; past_days 0–7; models enum `[best_match]`
- output_schema: latitude, longitude, hourly (object), daily (object), hourly_units, daily_units
- limitations: MAX_PARAM_COUNT ≤ 50 — "Open-Meteo accepts at most ~50 variables per call; keep hourly and daily lists short."
- cache_ttl_sec: `900` · rate_limit_per_sec: `10`

## Registration params

| Field | Value |
|---|---|
| Fee address | `0x5549286a1C71893816899BbEF8F4CE4d91f87821` |
| Floor price (USDC) | `0.01` |

---

# 💱 MINER 3 — FX Now (Frankfurter ECB)

## Section 1 · Basics

| Field | Value |
|---|---|
| Schema version | `1` |
| Integration ID | `9601` |
| Kind | **miner** |
| Protocol | **generic** |
| Slug | `fx-now-frankfurter` |
| Name | `FX Now (Frankfurter ECB)` |
| Description | Latest ECB-referenced mid-market FX rates for any fiat currency pair, refreshed daily. Answers "what is 1 USD in EUR right now" style questions with an exact numeric mid-market rate. |
| Website / Documentation | `https://frankfurter.dev` (both) |

## Section 2 · Connection

| Field | Value |
|---|---|
| base_url | `https://api.frankfurter.dev` |
| Auth | **none** |

## Section 3 · Endpoints

One endpoint:

| Field | Value |
|---|---|
| path | `/v1/latest` |
| external_path | `/v1/latest` |
| method | `GET` |
| intents | `FX_NOW` |

**description** (paste):

```
Latest ECB-referenced mid-market FX rate. Returns {"amount", "base", "date", "rates"} where rates maps each requested quote currency to the amount of that currency per 1 unit of the base currency. Call with base set to the 3-letter ISO currency code you are selling (e.g. USD) and symbols set to the 3-letter ISO code you are buying (e.g. EUR). The answer value for FX_NOW is the number at rates.<quote>, e.g. 0.89342 means 1 USD = 0.89342 EUR.
```

**params → query → required:**

| name | type | description |
|---|---|---|
| `base` | string | Base currency, exactly 3 uppercase ISO 4217 letters, e.g. USD, EUR, GBP. This is the currency being converted FROM. |
| `symbols` | string | Quote currency, exactly 3 uppercase ISO 4217 letters, e.g. EUR, JPY, CHF. This is the currency being converted TO. One code only, no commas. |

## Section 4 · Semantics

| Field | Value |
|---|---|
| signal_mapping label_field | `rates` (the numeric answer lives at rates.<quote>) |
| supported intents | `FX_NOW` |

## Section 5 · Advanced

- output_schema: amount (number), base (string), date (string), rates (object of quote→number)
- limitations: MAX_PARAM_VALUE length eq 3 on base — "Currency codes must be 3 uppercase ISO 4217 letters; unsupported codes return HTTP 404." · RATE_LIMIT 5/s — "Public instance is rate-limited; keep under ~5 requests per second per client."
- cache_ttl_sec: `300` · rate_limit_per_sec: `5`

## Registration params

| Field | Value |
|---|---|
| Fee address | `0x5549286a1C71893816899BbEF8F4CE4d91f87821` |
| Floor price (USDC) | `0.01` |

---

# ⚠️ The two things to watch while filling

1. **Integration ID collisions:** 9601/9602/9603 are free on Telegraph, but Anjoman's registry is separate — if the builder rejects an ID, use `96021/96022/96023` (keeps the family recognizable).
2. **The intent list in Section 4 (Semantics)** is where the earlier canonical rejection came from. If `ONCHAIN_METRIC_VERIFY` isn't offered/accepted, screenshot the available options — that list IS Anjoman's supported set, and we'll map our miners to it (or use their "Proposing a new intent" flow, documented on their docs page).
