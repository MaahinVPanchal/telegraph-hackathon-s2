# Telegraph Listings Desk

The local desk produces a recommendation with explicit evidence, payment and proof statuses. Its five-check listing policy is an application policy, not an official Telegraph guarantee or ranking.

## Offline demo

```bash
npm run demo
npm test
node src/cli.mjs PEPE --mode mock
npm run web   # local SIMULATED/OFFLINE UI at http://localhost:7788
```

Mock mode is **SIMULATED / OFFLINE**. It makes no Engine calls, payments or signatures. Each simulated receipt has a $0 actual-spend value; the demonstration estimate is reported separately. A simulation is never eligible decision evidence.

## Optional MetaMask account connection

The local web UI can request account access after the user selects **Connect MetaMask**. It uses the EIP-1193 `eth_requestAccounts` method and discovers a MetaMask EIP-6963 provider first, with an injected `window.ethereum` MetaMask-provider fallback. The authorized address stays in the browser and is not sent with an assessment request.

This connection does not request a signature, transaction, payment, chain switch, or chain default. It is account access only, not the full `@metamask/connect-evm` mobile QR/deep-link SDK flow. The SDK requires explicit supported-network RPC configuration; that is intentionally not added until the Engine/deployment network is confirmed. See [MetaMask's `eth_requestAccounts` reference](https://docs.metamask.io/metamask-connect/evm/reference/json-rpc-api/eth_requestAccounts) and [provider API](https://docs.metamask.io/metamask-connect/evm/reference/provider-api/).

## Public Vercel mock preview

Live preview: [https://leaderlight.vercel.app](https://leaderlight.vercel.app)

Vercel project: `leaderlight`

Vercel project root: `build/listings-desk`

The `api/` handlers and `vercel.json` adapt the local UI to Vercel Functions. Both the page and memo endpoint explicitly force mock mode; setting `DESK_MODE=real` cannot enable Engine calls or payments on this deployment. The browser wallet remains account-access-only. The preview is public, reports **SIMULATED / OFFLINE**, and makes no Engine calls, payments, or signatures.

Receipt/response diagnostics are collapsed by default on the memo, with an accessible toggle; recommendation, evidence status, payment status, and reasons remain visible. The local Node server binds to `127.0.0.1`. Do not expose its real mode publicly. A future real deployment requires authentication, persistent authorization accounting, confirmed Engine compatibility, and a separate security review.

This Vercel project currently uses direct CLI deployments rather than Git-based automatic deployment. After logging in with `npx vercel@latest login`, redeploy from this project directory with:

```bash
npx vercel@latest deploy --prod --project leaderlight
```

The `leaderlight.vercel.app` hostname is Vercel-provided. A custom domain requires control of its DNS.

## Candidate inputs

The CLI accepts an optional JSON file with candidate-specific identifiers:

```json
{
  "token": "0xCandidate",
  "deployerName": "Explicit entity name",
  "treasuryName": "Explicit treasury entity name",
  "socialAccounts": ["@explicit-account"],
  "chain": "explicit-chain",
  "block": 123456,
  "repositoryUrl": "https://example.invalid/repository"
}
```

```bash
node src/cli.mjs 0xCandidate --mode mock --candidate-json candidate.json
```

No deployer, treasury, social account, chain, block or repository is inferred. Real mode currently requests only `SANCTIONS_SCREENING_MATCH_GENERAL` and `SOCIAL_BOT_DETECTION_GENERAL` when their explicit inputs are supplied. The memo keeps these concrete Engine intent IDs separate from the internal mandatory check names. The contract snapshot records 19 and 16 leaf miners respectively at retrieval time; listed miners do not prove current availability or working answers. Some category-prefix entries report zero miners even when a concrete child lists miners, so prefix counts are not used to infer leaf availability. Audit, holder concentration/liquidity/age, and repository-history checks remain unsupported by the retrieved Engine contracts and mandatory; therefore the current contract cannot produce a GO. A balance or price is not substituted for concentration or an audit.

The prior app thresholds are application policy only: contract risk `<= 0.35`, top-10 concentration `<= 40%`, social bot score/share `<= 0.25`, and repository authenticity `>= 0.7`. The prior recommendation rule was 0 adverse signals = GO, 1 = REVIEW, and 2 or more = NO-GO, with a sanctions match always NO-GO. The current published response shapes do not provide matching inputs and outputs for three of those checks, so those thresholds are not evaluated. None is an official Telegraph guarantee.

## Real-mode payment guard

Real mode requires explicit `ESCROW_EXPECTED_NETWORK`, `ESCROW_EXPECTED_PAYTO`, `ESCROW_EXPECTED_ORIGIN`, and `ESCROW_EXPECTED_RESOURCE` configuration before any signing is permitted. Values must be checked against the live challenge and trusted deployment configuration; the challenge itself is not trusted to define the expected payee or network. No network/payee is silently selected by this app.

USD caps accept decimal strings/numbers with at most six fractional digits and convert exactly to integer micro-USDC (`1 USD = 1,000,000 micro-USDC`). Zero, negative, nonfinite, malformed, and unrepresentable caps are rejected. The run and per-intent ledger reserves challenge amounts before signing and retains unknown post-authorization outcomes. A stable request fingerprint prevents another authorization for the same request after settlement or an unknown outcome; a definitive unpaid response releases the reservation. There is no automatic new-charge retry.

An escrow receipt can establish a per-request protocol receipt and epoch commitment without a per-request `tx_hash`. It does not by itself prove final epoch settlement or answer accuracy. The app preserves receipt/proof gaps and distinguishes them from decision evidence. Receipts and rendered reports show both the internal check and the concrete Engine intent.

Evidence source references identify an escrow receipt when available, otherwise an Engine signal hash; a signal hash alone is not settlement or answer proof.

## Published contract snapshot

The safe schema snapshot and retrieval timestamp are in [`docs/engine-contract-snapshot-2026-11-11.md`](./docs/engine-contract-snapshot-2026-11-11.md). It records why this app cannot currently claim compatibility with the whole five-check policy. Recheck the live Engine contracts before enabling a real run.

The on-chain provider deployment gate remains blocked until Engine confirms acceptance of `chain`/`chain_id` and the proposed operation inputs. Do not infer a chain default or replace an explicitly requested historical block with latest.

## Artifact integrity

Memos carry a versioned SHA-256 content checksum over candidate, inputs/evidence, recommendation, signals, receipt/proof metadata, failures, spend labels and caps. The volatile `generatedAt` and the checksum field itself are excluded. This checksum is not a digital signature and does not prove that an answer is accurate.
