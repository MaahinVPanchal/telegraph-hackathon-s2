# Build track record — Leaderlight

**Rule going forward:** one folder (`telegraph-hackathon`), one branch (`main` = what is deployed).
Every deployed change is tagged `build-NN` and logged here. Nothing else ships.

| Build | Commit | Deployed (UTC) | What changed | Verified |
|---|---|---|---|---|
| **build-01** | `7735a86` | 2026-11-18 | Baseline of the current live site: separate Offline/LIVE workspaces, wallet disconnect control, hardened payment ledger (compact history, reconciliation guards, fail-closed persistence), honest blocked/unsaved-payment messaging, review hardening. Tests: 103/0. | ✅ live hash-checked; /memo + /desk verified |
| **build-02** | `0313e75` | 2026-11-20 | New-Diamond ledger wiring: DIAMOND → `0x72a7…a08b`, `/api/ledger/account/:address` proxy (verified live, was 404), duplicate-payment protections, 320px mobile overflow fix, mojibake repair. Tests: 108/0. | ✅ live hash-checked; 320px no-overflow in browser; ledger route 200 |

Next deploy lands as **build-03** (tag + row on ship).

## Conventions

1. All edits happen in **this folder only**. No side worktrees.
2. Change → full test suite (`build/listings-desk`: `npm ci && npm test`) → commit on a short branch → fast-forward `main` → push (Vercel auto-deploys) → **tag `build-NN`** → add a row above.
3. Any change touching payment addresses, selectors, or settlement semantics is reviewed by the second session **before** it merges.
4. Historical versions are navigable via tags (`git checkout build-01`) and branch history; nothing is deleted.

## Branch archive (all pushed to origin, 2026-11-20)

- `fix/leaderlight-ledger-ui2` — documented Sepolia ledger wiring; **merged as build-02** (2026-11-20)
- `fix/leaderlight-ledger-and-ui` @ `b2df719` — earlier new-Diamond address change + mode tabs; **held** — superseded in part by build-02's ledger wiring; distinct remaining value under review
- `fix/leaderlight-mode-tabs`, `fix/leaderlight-review-hardening`, `review/concurrency-lifecycle-debt-fix`, `review/metamask-escrow-budget-fix`, `archive/review-baseline-wip` — merged or archived snapshots
- Deployed worker (Cloudflare): `onchain-hybrid` @ version `81056257` (arb1 archive fallback, sanitized failure labels, per-chain archive env)

## Known issues / open payment work (2026-11-20, per review)

- **Reservation cleanup (real bug):** the node's `available` already reflects charges and unbilled usage, while the app keeps subtracting saved receipts indefinitely — this understates spendable and can suggest unnecessary top-ups. Fix = receipt-specific reconciliation (not a timer, not deleting history). Unknown attempts keep duplicate-payment protection.
- **Real wallet test:** still unproven and gated on the accounting review above. Funding verifies the ledger only once after confirmation — indexing lag can look like failed funding; do **not** deposit again blindly if that happens.
- **Old-Diamond balance (2.97 USDC on `0x3624…`):** balances don't carry over to `0x72a7…a08b`; recovery/withdrawal is unverified — not established as lost.
- **Receipt semantics (resolved):** the docs use both "next ledger block" (charge timing) and `settlement: "epoch"` (proof record) — not a contradiction. Keep strict receipt checks; never present a receipt as final settlement.
- **Testing split:** mocked cross-tab tests pass; real MetaMask multi-tab testing is separate and unrun. The MetaMask scan returning NONE is not a security audit and does not lift the real-wallet gate.
- **Submission status:** not fully submission-ready — real receipt proof and reservation behavior remain open before calling the payment flow finished.
