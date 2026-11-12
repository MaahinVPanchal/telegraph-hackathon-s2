# Leaderlight command-room implementation

Prepared 12 November 2026 from GitHub `MaahinVPanchal/telegraph-hackathon-s2`, `build/listings-desk`, pinned source `3b59707`. Fresh main HTML matched that version when checked during preparation. The production release and verification are documented at the end of this file. The source is preserved here for the next CLI deployment.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run web
```

Open http://127.0.0.1:7788. The local root now uses the same `public/leaderlight-live.html` as the production root, rather than a separate outdated template. Offline demo requests use the real local `/memo` handler with simulated fixtures. Live controls retain wallet approvals and payment guards. Do not sign or pay merely to inspect this design.

## What changed

- Selected refined Wakanda layout is implemented, including the command rail, condensed two-line title, original intent/evidence/receipt illustration, two-column desktop panels, stacked phone layout, original Telegraph mark and independent-app disclaimer.
- Existing input IDs, offline flow, wallet connection, account/network handling, mint/fund controls, explicit sanctions identities, evidence/receipt output, saved attempt reconciliation and public network board are retained.
- Fonts and logo are embedded in the production HTML, so deploying that file does not depend on a third-party image/font host.
- Mobile long receipt/status labels wrap instead of widening the page.

## Integration fixes found by browser testing

1. The existing UI passed a relative request URL to a validator that calls `new URL()` without a base. The UI now resolves it against `window.location.origin` before calling the unchanged payment guards.
2. The browser uses `/api/engine/v1/ask`, while the Vercel function lives at `/api/engine`. Read-only production checks found 404 and 405 respectively. An exact rewrite now maps that ask path to the existing function. No upstream, signer, payee, chain or payment policy was changed.
3. Local serving supports that same proxy path and the existing browser payment module. `renderPage("mock")` also uses the same current app file.

`public/live-payment.mjs`, `public/wallet-client.mjs`, `api/engine.js`, the Engine client, risk/evidence rules and existing test files are unchanged from the pinned base. The inline payment UI differs only in the URL-resolution line. The offline script is unchanged.

## Tests and visual checks

```sh
npm test
npx playwright install chromium
npm run test:browser
```

If using an installed Chrome instead, set `CHROME_BIN` to its executable path. Test results recorded here: 60 Node tests pass (57 existing and 3 integration checks), 11 initial browser checks pass, and 4 mocked payment UI scenarios pass.

Browser checks exercise the actual local root and `/memo` path, offline error/retry and result anchors, wallet absence/rejection, fake connected state, account/network safety, valid receipts, a partial second-call failure, unknown receipt status, malformed challenge rejection, and reload duplicate-authorization prevention. Result/receipt layouts were tested at 320, 390 and 1280 pixels and inspected visually.

All wallet providers, signatures, paid responses, receipts and leaderboard data in browser tests/screenshots are LOCAL FIXTURES. No real wallet signature, transaction, paid API probe or mainnet spending occurred. Fixture screenshots are not financial evidence or current miner rankings. A protocol receipt is not final on-chain settlement or proof of answer accuracy.

## Production scope and review

The production application changes are `public/leaderlight-live.html` and `vercel.json`. `src/serve.mjs` keeps local and `/desk` mock serving aligned. Development dependencies and review tests are local validation support. No miner worker, YAML, registration or Engine operation contract is changed.

Before applying, compare against fresh main and preserve newer work. Use the existing Leaderlight Vercel project and production alias, never a new project. Verify the actual production URL and exact ask-route mapping after deployment. No extra paid test is needed. Independent worker/Engine compatibility and original payment-proof gaps remain separate work.

## Assets

Telegraph mark belongs to its owner. Independent app, no endorsement. Noto Sans Condensed Bold is embedded under its font license; see `licenses/NotoSans.txt`.

## Production release 12 November 2026, 11:32 IST

Deployed through the existing Leaderlight project using Vercel CLI, with no Git integration or billing-plan changes. Production alias: https://leaderlight.vercel.app/

Deployment: https://vercel.com/maahinvpanchals-projects/leaderlight/4ktnfxDavsTKA5Yys3Dw9KcuQnyJ

Production HTML and both wallet/payment modules matched this package byte-for-byte. Read-only GET to `/api/engine/v1/ask` now returns 405 Allow POST rather than 404, proving the route resolves without making a paid request. Eleven actual production smoke checks pass: initial/result layout widths, offline memo, navigation, missing-provider handling, no browser exceptions and no POST requests.

These focused release changes are synchronized to the GitHub repository after deployment. Update any older local working copy before the next CLI release. No automatic Git deployment integration was added.
