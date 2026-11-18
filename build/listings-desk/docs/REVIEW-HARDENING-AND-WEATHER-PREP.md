# Review hardening and weather proxy preparation

## Leaderlight payment state

The per-wallet lock covers ledger reads, request, challenge validation, signature, retry, receipt validation, and ledger writes. Browsers without `navigator.locks` fail closed. A Run click is ignored while that page has a run in flight. There is one serialized source of payment attempts; history and wallet/run indexes are reconstructed from it. Storage parse, read, write, verification, or quota errors prevent authorization.

| Saved state for the same request | Fresh single-use New assessment token | Same or different run ID | Result |
|---|---|---|---|
| No authorization / answered without payment | absent or present | either | Allow; any token is consumed if present |
| `authorization_pending` or `unknown` for any request by this wallet | absent or present | either | Refuse; reconcile first |
| `protocol_receipt` for these inputs | absent | either | Refuse with New assessment guidance |
| `protocol_receipt` for these inputs | present and matches | either | Allow once; token is consumed while holding wallet lock |
| Different inputs, no unresolved wallet attempt | absent or present | either | Allow, subject to the assessment run budget |
| `definitive_unpaid` or `signature_rejected` | absent or present | either | Allow; no unresolved authorization remains |

Concurrent same-input calls serialize under `lock:escrow:<wallet>`. The first may sign; the next observes pending/unknown or a receipt and refuses unless it has a fresh intent token. A protocol receipt is an epoch commitment, not proof that the epoch root has settled.

The saved request ID again hashes the stable, sorted object `{wallet, intent, params}`, matching the original ledger key. This preserves blocks stored under that key. Challenge placeholder binding and strict receipt/answer shape checks match `origin/main`.

Spendable escrow remains a **conservative estimate**: pending and unknown authorizations and all protocol receipts remain liabilities because the UI has no verified settlement reconciliation. Telegraph's current escrow documentation says receipts identify a call and that `GET /v1/blocks/{epochId}/deliveries/{receiptHash}` returns a delivery, Merkle proof and root after epoch recording; it also says epoch blocks can take up to about an hour to appear. The client does not yet verify that proof against an on-chain root, so it does not mark a receipt settled. See [Pay from Escrow](https://anjoman.ai/docs/using/escrow-inference), receipt and delivery proof section.

Deposit verification uses `(balanceAfter - balanceBefore) + (debtBefore - debtAfter) >= topUp` so it does not assume whether debt or balance is credited first. The documentation describes `available = balance - unbilled - withdrawal request`, but does not establish the contract's exact deposit/debt update ordering. The formula is an accounting assumption and needs Maahin's live testnet check for both debt-repay and no-debt deposits.

Identical deployer/treasury names create one job, one receipt and one charge, with a note in the memo.

## Weather miner preparation

The worker is under `build/weather-proxy/`, next to `build/onchain-hybrid/`. Its compatibility date and Workers observability settings match `build/onchain-hybrid/wrangler.toml`. It retries network errors, 5xx and 429; other 4xx pass through. The final 429 is passed through with its original status/body. It buffers the complete upstream body under the per-attempt abort timer and strips content-encoding/content-length from the reconstructed body to avoid stale transport metadata. It never caches stale forecasts. Tests use mocked fetch responses only.

The project's docs do not publish the Engine HTTP deadline. Worker attempts and backoff are configurable source values and remain unverified against that deadline. The TLS error reports an Engine GET failure but does not prove that Engine-to-Open-Meteo is the failing hop or identify root cause.

The YAML checkout's current line was verified as `base_url: https://api.open-meteo.com`. The only candidate edit is in `build/weather-proxy/weather-verify-openmeteo.patch`; it contains `<WORKER_URL>` and is not applied to the active YAML. No hash was computed.

## Live checks reserved for Maahin

- Real MetaMask signing on Sepolia and actual Telegraph paid requests.
- Deposit/debt ordering and the balance/debt accounting assumption.
- A verifiable epoch settlement signal for receipts.
- Worker deployment, real URL health checks, then YAML approval, commit, free validation and wallet-signed miner update.
