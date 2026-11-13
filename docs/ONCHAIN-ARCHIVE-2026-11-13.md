# Arbitrum archive incident and recovery check - 13 November 2026

Status: a representative historical nonce request now succeeds through the configured per-chain archive route. Recovery of the failed scored request and a new scored improvement are not yet proven. Times below are IST (UTC+05:30) unless marked otherwise.

## What failed

The published score history contains two distinct archive failures, not one repeated input:

| Epoch | Recorded time | Rank / score | Recorded failure |
| --- | --- | --- | --- |
| 2072 | 12 Nov 13:46:22 | 39 / 0 | HTTP 504, `NO_ARCHIVE_SOURCE`; `eth_call` failed on `arbitrum.drpc.org=http_4xx` and `arbitrum.publicnode.com=http_4xx` |
| 2074 | 12 Nov 20:11:41 | 11 / 0.8186 | No failure reason recorded |
| 2076 | 13 Nov 02:00:24 | 39 / 0 | HTTP 504, `NO_ARCHIVE_SOURCE`; `eth_getTransactionCount` failed on PublicNode, dRPC and arb1, all categorized `no_archive` |

The 2072 record names `eth_call`; it does not expose enough input to prove which contract operation was requested. The 2076 record explicitly identifies the historical nonce method. Neither public score record exposes the failed address and block. Do not turn a representative test into a replay of either evaluation.

The exact 2076 message was:

```text
every RPC failed eth_getTransactionCount: arbitrum.publicnode.com=no_archive, arbitrum.drpc.org=no_archive, arb1.arbitrum.io=no_archive
```

Source: https://anjoman.ai/api/explorer/scores?miner=onchain-metric-publicnode

## What changed, and what the tests taught us

- `0aeec41`: added arb1 to the Arbitrum fallback list, classified archive errors in non-2xx JSON responses, and added `ARCHIVE_RPC_URL_ARBITRUM_ONE` ahead of public providers for that chain only. The global `ARCHIVE_RPC_URL` is not the same scope.
- `82edeba`: expanded regression coverage. One delayed mock ignored abort signals, so a simulated late success did not establish that real fetches could survive the 2.5-second attempt timeout.
- `cf57688`: repaired delays to respect cancellation. The shared request budget is 8 seconds, with 2.5 seconds per attempt and two-way hedging. A provider must answer within the real attempt budget; adding providers does not create historical state they do not retain.
- `2f807ee`: test-only follow-up accepts either honest error label at the exact deadline boundary. That label race was not evidence of fabricated data, and accepting both labels does not prove deterministic scheduling.

These changes improved failover behavior and test fidelity, but the later 2076 failure showed the three public providers still did not supply the requested nonce state. Keep the requested chain and numbered block. Never silently substitute `latest`, return zero after an upstream error, or confuse account nonce with total transaction activity.

## Free archive configuration and bounded live check

On 13 November the owner reported adding Alchemy's free Arbitrum archive access. The endpoint URL/key is intentionally absent from this record. Provider identity comes from that setup report; the response exposes only a safe configuration label, not its hostname.

A single authorized GET to the deployed Worker at 08:17:33 returned HTTP 200 in 0.495 seconds. There were no client retries or direct-provider probes. The Worker's internal RPC call count was not observed.

Representative input, selected from existing repository test fixtures:

```text
chain=arbitrum-one
metric=tx_count
address=0xd8da6bf26964af9d7eed9e03e53415d37aa96045
block_number=23599000
```

The address is a public test-fixture address, not an attribution to the owner. The block is the failover fixture's 23600000 head minus 1000. No independently established expected nonce was available.

Relevant live response:

```json
{
  "ok": true,
  "metric": "tx_count",
  "chain": "arbitrum-one",
  "requested_chain": "arbitrum-one",
  "chain_id": 42161,
  "requested_block": "23599000",
  "block": 23599000,
  "block_tag": "number",
  "value": "1",
  "nonce": "1",
  "unit": "nonce",
  "source": "ARCHIVE_RPC_URL_ARBITRUM_ONE#1",
  "sources": ["ARCHIVE_RPC_URL_ARBITRUM_ONE#1"],
  "as_of": "2026-11-13T02:47:33.066Z"
}
```

Request ID: `a59a73cd4dadacc8`. This proves that the deployed historical nonce path returned a result through the first per-chain archive endpoint while preserving the requested chain and block. It does not independently verify the nonce against another provider, prove all history is covered, or prove the exact failed evaluation is fixed.

## Earlier edge logs remain unresolved

The owner also supplied two 200 responses around 08:08 and six 504 responses at 08:12:18-45, all before the successful 08:17:33 check. Earlier overnight logs showed three 504s at 01:46:44-46. These supplied rows contain path/status but no query parameters or response bodies. Their callers, metrics, chains, blocks, error causes and configuration versions are not established by those rows. Same IP or timing alone does not prove Engine evaluation traffic or retries. IP addresses are omitted because they are unnecessary to the diagnosis.

If retained, the original request URL/query string and Worker error log can identify a failing input without issuing more requests. If those fields were not retained, do not pretend they can be reconstructed from `/query` and status alone.

## What remains

1. Leave configuration stable and inspect the next published onchain score after the expected 09:15 IST boundary. A boundary is not a score-publication guarantee.
2. Compare its epoch, rank, score, failure reason and recorded time with 2076. A new result may use a different question and is not by itself proof of the exact old input's recovery.
3. If a new failure occurs, recover its existing input/error evidence before choosing another change. Do not run burst retries or buy a plan based on this one check.
4. Keep wallet work, MetaMask classification and app UI work separate. This record changes documentation only, not Worker code, secrets, deployment settings, registrations or wallets.

Provider documentation used to choose a free-first candidate:

- https://www.alchemy.com/docs/reference/compute-unit-costs.md
- https://www.alchemy.com/docs/chains/arbitrum/arbitrum-api-endpoints/eth-get-transaction-count.md
- https://www.alchemy.com/pricing
- https://docs.arbitrum.io/run-a-node/more-types/run-archive-node

Alchemy advertises free archive access and documents the nonce method with a block parameter. Those claims are a reason to try the free option, not a latency or universal-coverage guarantee. Arbitrum Classic historical state before block 22207817 can require a separate backend; the failed evaluation's unknown block means Classic involvement is not established here.
