# Build track record — Leaderlight

**Rule going forward:** one folder (`telegraph-hackathon`), one branch (`main` = what is deployed).
Every deployed change is tagged `build-NN` and logged here. Nothing else ships.

| Build | Commit | Deployed (UTC) | What changed | Verified |
|---|---|---|---|---|
| **build-01** | `7735a86` | 2026-11-18 | Baseline of the current live site: separate Offline/LIVE workspaces, wallet disconnect control, hardened payment ledger (compact history, reconciliation guards, fail-closed persistence), honest blocked/unsaved-payment messaging, review hardening. Tests: 103/0. | ✅ live hash-checked; /memo + /desk verified |
| build-02 | — | pending | Next deploy lands here (tag + row on ship). Known in-flight work: `fix/leaderlight-ledger-ui2` (documented Sepolia ledger wiring — needs review before merge) and the held `fix/leaderlight-ledger-and-ui` (new-Diamond address change — incomplete: funding balance reads still target the dead `escrowBalance` selector). | — |

## Conventions

1. All edits happen in **this folder only**. No side worktrees.
2. Change → full test suite (`build/listings-desk`: `npm ci && npm test`) → commit on a short branch → fast-forward `main` → push (Vercel auto-deploys) → **tag `build-NN`** → add a row above.
3. Any change touching payment addresses, selectors, or settlement semantics is reviewed by the second session **before** it merges. `fix/leaderlight-ledger-and-ui` (address) and `fix/leaderlight-ledger-ui2` (ledger wiring) are in that category.
4. Historical versions are navigable via tags (`git checkout build-01`) and branch history; nothing is deleted.

## Branch archive (all pushed to origin, 2026-11-20)

- `fix/leaderlight-ledger-and-ui` @ `b2df719` — new-Diamond address change + mode tabs; **held**: incomplete funding reads (old `escrowBalance` selector is gone on `0x72a7…a08b`), tabs since shipped separately
- `fix/leaderlight-ledger-ui2` @ `2ac39eb` — documented Sepolia ledger wiring; **awaiting review/merge**
- `fix/leaderlight-mode-tabs`, `fix/leaderlight-review-hardening`, `review/concurrency-lifecycle-debt-fix`, `review/metamask-escrow-budget-fix`, `archive/review-baseline-wip` — merged or archived snapshots
- Deployed worker (Cloudflare): `onchain-hybrid` @ version `81056257` (arb1 archive fallback, sanitized failure labels, per-chain archive env)
