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

## Miner rank history

Run `npm run web` and open **Miner rank history** from the app. Select a miner and Intent to see the latest recorded rank per UTC day, with the score and epoch in the accompanying table. The page reads the history available from Anjoman Explorer and shows gaps on days without a score. It requires network access and opens without a wallet.

## Optional MetaMask account connection

The local web UI can request account access after the user selects **Connect MetaMask**. It uses the EIP-1193 `eth_requestAccounts` method and discovers a MetaMask EIP-6963 provider first, with an injected `window.ethereum` MetaMask-provider fallback. The authorized address stays in the browser and is not sent with an assessment request.

This connection does not request a signature, transaction, payment, chain switch, or chain default. It is account access only, not the full `@metamask/connect-evm` mobile QR/deep-link SDK flow. The SDK requires explicit supported-network RPC configuration; that is intentionally not added until the Engine/deployment network is confirmed. See [MetaMask's `eth_requestAccounts` reference](https://docs.metamask.io/metamask-connect/evm/reference/json-rpc-api/eth_requestAccounts) and [provider API](https://docs.metamask.io/metamask-connect/evm/reference/provider-api/).

## Live app source safety status

The local live app is `public/leaderlight-live.html`; its browser payment helpers are in `public/live-payment.mjs`. It uses the selected MetaMask provider and requires Ethereum Sepolia (chain ID 11155111). The browser validates the escrow challenge's network, scheme, payee, request/resource and message template, enforces $0.01 per-call and $0.02 per-run caps, and stores each request outcome in same-origin `localStorage` before rendering. Unknown or previously authorized requests are blocked from another authorization until reconciled. This local browser ledger survives reloads but can be cleared or edited by the user; it is not server-side durable accounting and must not be treated as an adversarially robust public payment ledger.

The app trusts Sepolia Diamond `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b` and test USDC `0xcc194e1a843B658526D0D5C431f670028582Ae17`. Funding approves the Diamond, calls `depositUSDC(uint256)`, and checks the node ledger's documented `deposited` delta. Balance panels read the node ledger through a same-origin read-only proxy and use documented `available` as their starting point; this device's unresolved authorizations and protocol receipts remain locally reserved. Deposits on the old Diamond do not carry over. A validated Telegraph response receipt is labeled as a **protocol receipt**, not final on-chain settlement or proof of answer accuracy. Numeric fields and returned content are rendered as text. See [the ledger migration note](docs/LEADERLIGHT-LEDGER-MIGRATION.md).

These are source-code and local-test statements, not evidence that the changed source is deployed or that a real wallet signed or spent funds. No deployment, wallet signature, or spending was performed for this update.

## Public Vercel preview

Live preview: [https://leaderlight.vercel.app](https://leaderlight.vercel.app)

Vercel project: `leaderlight`

Vercel project root: `build/listings-desk`

The repository config routes two apps:

- `/` — the Leaderlight live app is served from `public/leaderlight-live.html`; paid Engine requests use `api/engine.js` as a same-origin transport proxy. The proxy holds no keys and does no signing. The page's current source requires explicit MetaMask approval for each testnet transaction or signature. This checkout includes un-deployed local safety changes; do not infer that the public URL serves them.
- `/desk` — the desk's **SIMULATED / OFFLINE** memo UI via `api/index.js` (unchanged). Both `/desk` and its `/memo` endpoint explicitly force mock mode; setting `DESK_MODE=real` cannot enable Engine calls or payments on this deployment. The local Node server's real mode is NOT deployed. A future server-side real deployment requires authentication, persistent authorization accounting, confirmed Engine compatibility, and a separate security review.

Receipt/response diagnostics are collapsed by default on the desk memo, with an accessible toggle; recommendation, evidence status, payment status, and reasons remain visible. The local Node server binds to `127.0.0.1`. Do not expose its real mode publicly.

### Previously reported escrow delivery records

The repository's 12 November milestone records two 10,000 μUSDC (0.01 USDC) sanctions-intent requests: one reported through `https://devnode.telegraphprotocol.com/engine/v1/ask`, and one through `https://leaderlight.vercel.app/api/engine/v1/ask`. The milestone also records that the MetaMask signing popup was **not** tested in a live browser.

Earlier lookups of the epoch-2068 delivery API returned the records below. On November 25, 2026, both URLs returned HTTP 404. A fresh Sepolia browser run with a saved receipt is needed to verify the current deployment.

| Reported request path | Receipt hash | Public delivery record |
|---|---|---|
| Direct Engine | `0x120760df79b4d0206d19385c91b856a242644485f0992145099961462d4b6cb2` | [epoch 2068 delivery](https://devnode.telegraphprotocol.com/v1/blocks/2068/deliveries/0x120760df79b4d0206d19385c91b856a242644485f0992145099961462d4b6cb2) |
| Same-origin proxy | `0xb98ce5989cb9a4172c4d262f8524a14bd9db53bbcc0c955946f57c35477dc5c8` | [epoch 2068 delivery](https://devnode.telegraphprotocol.com/v1/blocks/2068/deliveries/0xb98ce5989cb9a4172c4d262f8524a14bd9db53bbcc0c955946f57c35477dc5c8) |

Both lookups report payer `0x5549286a1c71893816899bbef8f4ce4d91f87821`, miner ID `5166`, intent `SANCTIONS_SCREENING_MATCH_GENERAL`, 10,000 μUSDC, and epoch 2068. The lookup response includes a delivery proof. This supports epoch-ledger inclusion for those receipt IDs; it does not independently establish the originating URL, exact request body, browser wallet interaction, answer accuracy, or a separate on-chain settlement transaction. Escrow does not produce a per-request `tx_hash`. Do not call these verified browser-signing or x402 `exact`-scheme runs.

### Local UI previews

Serve `public/` locally to inspect the full-width live page and the separate command-room concept:

```powershell
python -m http.server 7789 --directory public
```

Open `http://localhost:7789/leaderlight-live.html` or `http://localhost:7789/leaderlight-command-room-preview.html`. The command-room page is a static, offline concept; its disabled controls do not submit requests or connect a wallet. The live page's API actions are not functional through this static server.

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

The Node CLI/server real mode requires explicit `ESCROW_EXPECTED_NETWORK`, `ESCROW_EXPECTED_PAYTO`, `ESCROW_EXPECTED_ORIGIN`, and `ESCROW_EXPECTED_RESOURCE` configuration before any signing is permitted. Values must be checked against the live challenge and trusted deployment configuration; the challenge itself is not trusted to define the expected payee or network. No network/payee is silently selected by this app.

USD caps accept decimal strings/numbers with at most six fractional digits and convert exactly to integer micro-USDC (`1 USD = 1,000,000 micro-USDC`). Zero, negative, nonfinite, malformed, and unrepresentable caps are rejected. The run and per-intent ledger reserves challenge amounts before signing and retains unknown post-authorization outcomes. A stable request fingerprint prevents another authorization for the same request after settlement or an unknown outcome; a definitive unpaid response releases the reservation. There is no automatic new-charge retry.

An escrow receipt can establish a per-request protocol receipt and epoch commitment without a per-request `tx_hash`. It does not by itself prove final epoch settlement or answer accuracy. The CLI/server app preserves receipt/proof gaps and distinguishes them from decision evidence. Receipts and rendered reports show both the internal check and the concrete Engine intent. The browser live app uses a separate localStorage attempt ledger; it is not shared with the Node payment ledger or a server-side reconciliation service.

Evidence source references identify an escrow receipt when available, otherwise an Engine signal hash; a signal hash alone is not settlement or answer proof.

## Published contract snapshot

The safe schema snapshot and retrieval timestamp are in [`docs/engine-contract-snapshot-2026-11-11.md`](./docs/engine-contract-snapshot-2026-11-11.md). It records why this app cannot currently claim compatibility with the whole five-check policy. Recheck the live Engine contracts before enabling a real run.

The on-chain provider deployment gate remains blocked until Engine confirms acceptance of `chain`/`chain_id` and the proposed operation inputs. Do not infer a chain default or replace an explicitly requested historical block with latest.

## Artifact integrity

Memos carry a versioned SHA-256 content checksum over candidate, inputs/evidence, recommendation, signals, receipt/proof metadata, failures, spend labels and caps. The volatile `generatedAt` and the checksum field itself are excluded. This checksum is not a digital signature and does not prove that an answer is accurate.


## Production release: 12 November 2026

The Wakanda command-room layout now serves the real production app at https://leaderlight.vercel.app/. The current source and release checks are documented in [WAKANDA-RELEASE.md](WAKANDA-RELEASE.md). This supersedes earlier preview-only/source-not-deployed notes for these app changes. `npm test` now runs 60 tests; `npm run test:browser` runs the local mocked browser checks. A direct production smoke check is in `review/production-smoke.mjs` (read-only/offline, no signing or paid requests). Payment helpers and the Engine proxy implementation remain unchanged; the ask-route rewrite and absolute same-origin URL fix are included.

Deployment remains manual through the existing Vercel project. Pull this source before your next CLI release. No automatic Git deployment connection was added. UI/offline success and mocked payment tests do not certify a fresh real paid production run.
