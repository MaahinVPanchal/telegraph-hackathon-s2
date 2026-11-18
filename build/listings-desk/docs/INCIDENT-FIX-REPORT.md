# Incident & Fix Report: MetaMask Resolution, Run Budget Scoping & Balance-Aware Funding UX

**Date:** 15 November 2026  
**Repository:** `telegraph-hackathon-s2`  
**Application Root:** `build/listings-desk`  
**Review Branch:** `review/metamask-escrow-budget-fix`  
**Status:** Review Only — Not deployed to production, not merged to main.

---

## 1. MetaMask Classification Resolution

### Background & Resolution
* **Initial Incident:** The domain `leaderlight.vercel.app` received a false-positive phishing/drainer warning from MetaMask.
* **MetaMask GitHub Issue:** [#311992](https://github.com/MetaMask/eth-phishing-detect/issues/311992)
* **Closure Timestamp:** `2026-11-13T14:05:14Z`
* **Maintainer Resolution:** AlexHerman1 confirmed: *"this has already been resolved, thanks for reporting"*.
* **Current Automated MetaMask Scan (15 Nov 2026):**
  * URL: `https://dapp-scanning.api.cx.metamask.io/scan?url=leaderlight.vercel.app`
  * `recommendedAction`: `NONE`
  * `riskFactors`: `null`
  * `status`: `COMPLETE`
  * `verified`: `false`

### Accuracy Notice
MetaMask’s issue resolution and clean scanner status do **not** imply that MetaMask has audited, certified, or endorsed Leaderlight. `verified: false` simply denotes unverified domain identity, not risk. Safe wallet connection and honest state display remain the responsibility of application logic.

---

## 2. Confirmed Bug: Per-Run Budget Counted Cumulative History

### Problem Description
In `build/listings-desk/public/live-payment.mjs`, `performPaidAsk` calculated `runReservedMicro` by summing all attempts in `localStorage` (`leaderlight.live-attempts.v1`) with `authorizationStarted: true` and `status !== "definitive_unpaid"`. Because successfully completed calls retain `status: "protocol_receipt"`, every completed assessment accumulated towards the 20,000 μUSDC ($0.02) per-run cap. Once two paid sanctions requests ($0.01 each) were executed, all subsequent assessment runs in that browser profile were rejected with:
> `"challenge exceeds the per-call or per-run payment limit"`

### Fix Implementation
1. **Explicit `runId` Scoping:** Each assessment run generates a unique `runId` (e.g. `run_<timestamp>_<rand>`) shared by both calls in that assessment.
2. **Run-Scoped and Wallet-Scoped Reservations:** In `live-payment.mjs`, `runReservedMicro` is calculated specifically for `attempt.runId === runId` and `attempt.wallet === wallet`. Calls from prior completed runs no longer exhaust the budget of a new assessment.
3. **Cross-Run Protection for Uncertain Outcomes:** If an attempt for an input has `status === "unknown"` or `status === "authorization_pending"`, it remains strictly blocked from reauthorization across runs and tabs until reconciled.
4. **Deliberate Reassessment Allowed:** When a prior attempt is cleanly settled (`status === "protocol_receipt"`), a fresh assessment with a new `runId` is permitted to evaluate those inputs again without bypassing in-flight protection.
5. **No History Deletion:** Existing version-1 ledger history is preserved completely.

---

## 3. UX Improvement: Balance-Aware Setup & On-Demand Funding

### Previous Behavior
The funding flow previously executed a hardcoded approval of 3,000,000 μUSDC (3 test USDC) followed by a deposit of 3 test USDC into the Telegraph Diamond contract, even if the user already had sufficient escrow deposited.

### Enhanced Balance-Aware Flow
1. **Balance & Allowance Inspection (`readWalletFundingState`):**
   * Inspects Sepolia ETH (for gas).
   * Reads wallet test-USDC (`balanceOf`).
   * Reads USDC allowance granted to the Diamond (`allowance`).
   * Reads raw escrow balance (`escrowBalance`).
   * Reads official spendable effective balance (`effectiveBalance`).
   * Reads `agentDebt` (subtracts outstanding debt from effective balance).
   * Reads `pendingWithdrawal` (locks pending funds).
   * Accounts for unreconciled browser liabilities.
2. **Dynamic Funding UI:**
   * If spendable escrow covers the run ceiling ($0.02 / 20,000 μUSDC), funding is marked complete (`stepFund` active) and top-up options are hidden.
   * If funding is required, the user is offered explicit top-up choices:
     * `$0.02` (exact run requirement: 20,000 μUSDC)
     * `$1.00` (standard balance: 1,000,000 μUSDC)
     * `$3.00` (legacy default: 3,000,000 μUSDC)
3. **Allowance-Aware Transactions:**
   * If current allowance already covers the chosen top-up, the ERC-20 approval step is skipped.
   * If approval is needed, approval is requested only for the bounded chosen amount. No unlimited approvals are ever requested.

---

## 4. Test & Verification Summary

### Unit & Integration Suite
* **Command:** `npm test`
* **Suite Files:**
  * `test/desk.test.mjs`
  * `test/live-payment.test.mjs`
  * `test/live-payment-regression.test.mjs`
  * `test/wakanda-integration.test.mjs`
* **Results:** **70 passed, 0 failed, 0 skipped** across all 4 suites.

### Browser & UI Suite (Playwright Mocked Providers)
* **Command:** `npm run test:browser`
* **Scenarios Verified:**
  * Responsive layouts at 320px, 390px, and 1280px without horizontal overflow.
  * Disconnected state, connection rejection handling, network switching.
  * Live paid assessment (2 valid calls signed and validated with protocol receipts).
  * Partial failures and unknown post-sign state handling.
  * Duplicate authorization prevention on page reload.
* **Results:** **100% pass across all viewport and paid scenarios.**

---

## 5. Manual Testing Checklist (For Maintainer Review with Throwaway Sepolia Wallet)

> **DO NOT PERFORM WITH REAL/MAINNET FUNDS. USE A THROWAWAY SEPOLIA WALLET ONLY.**

1. **Connect Account:**
   * Open `http://localhost:7788/` or preview URL.
   * Click **Connect MetaMask**. Verify account prompt requests account address only — no signature, no transaction, no allowance.
2. **Inspect Balances:**
   * Verify the balance panel displays Sepolia ETH, Wallet test-USDC, Spendable Escrow, and Allowance.
   * If spendable escrow is $\ge \$0.02$, confirm top-up options are collapsed and Live run is ready.
3. **Test Bounded Top-up (if needed):**
   * If balance is $< \$0.02$, select **Top-up $0.02**.
   * If allowance is insufficient, verify MetaMask asks for approval of exactly 0.02 USDC (20,000 units), followed by a deposit of 0.02 USDC.
4. **Execute Assessment Run:**
   * Enter test deployer and treasury names.
   * Click **Run LIVE assessment**.
   * Approve 2 sequential `personal_sign` challenges (each verifying envelope: `eip155:11155111`, payee `0x3624...b99b`, amount `10000 uUSDC`).
   * Verify memo renders with validated protocol receipts.
5. **Execute Second Assessment Run:**
   * Click **Run LIVE assessment** again with fresh inputs.
   * Confirm the second run executes successfully and is not blocked by the first run's budget.


---

# Follow-up Repair: Concurrency, Lifecycle, Debt & Deposit (18 November 2026)

**Review Branch:** `review/concurrency-lifecycle-debt-fix` (review-only; not merged to `main`, not deployed)  
**Baseline:** reviewed merge `0315805` + prior repair `03e231b`. This change set is uncommitted-to-main working-tree work, finalized and committed only to the review branch.

This follow-up closes the four confirmed gaps the prior repair left open. All verification below uses **mocked** providers, signatures and Engine responses — it is not proof of real-wallet or on-chain settlement behaviour.

## A. The four fixes

### Fix 1 — Overlapping authorizations and ledger loss (`live-payment.mjs`)
- `performPaidAsk` now runs the entire reserve/read/sign/receipt sequence inside a per-wallet cross-tab lock (`withLock("lock:escrow:<wallet>")`) backed by the Web Locks API (`navigator.locks.request`), with an in-process queue fallback for Node and a **fail-closed** throw in browsers that lack the primitive.
- The authoritative ledger re-read happens inside the critical section, so a second tab or in-tab double-click cannot race past a first reservation.
- `saveAttempt` is append-only: each attempt gets a stable `attemptId`, writes to `history`, and indexes by `runId` and `wallet`; a repeating input preserves prior attempts under `priorAttempts` instead of overwriting them. A receipt or unknown outcome can no longer disappear.
- A reservation is released only on a definitive unpaid or signature-rejected result, never on timeout (transport failure after signing stays `unknown`, which keeps blocking re-authorization).

**Design decision (deliberate reassessment):** a *different* `runId` with the same inputs is an intentional new assessment and is allowed to re-authorize (this is the module behaviour Fix 2 relies on and that regression #6 asserts). The concurrency guard that enforces “at most one signature” applies to overlap within the **same** run — the actual double-click / two-tabs-of-one-run bug.

### Fix 2 — UI new-assessment lifecycle (`leaderlight-live.html`)
- Added an explicit **New assessment** action that resets the result region and clears the stale `paymentBlocked` flag without erasing prior receipts.
- The run-loop guard now blocks only on an **unresolved** saved attempt (`authorization_pending` / `unknown`); a completed `protocol_receipt` no longer blocks a fresh run. This removed the “every completed receipt blocks all future same-input runs” anti-pattern.
- On input edit the re-check re-scans the ledger for unresolved authorizations rather than blindly clearing the block.
- Identical deployer/treasury names assess once and reuse the validated result, so the second job no longer silently duplicates a paid request or stops halfway.

### Fix 3 — Spendable balance honest about commitments and debt (`live-payment.mjs`, `leaderlight-live.html`)
- `pendingLiabilitiesMicro` now includes unsettled `protocol_receipt` commitments (not only `authorization_pending`/`unknown`), so funds already committed to a receipt are not reported as spendable.
- `spendableEscrowMicro` is `null` (not-ready) when any of the effective-balance, agent-debt or liabilities reads fails or the ledger is malformed — the previous silent `catch` that treated malformed data as zero is gone.
- Positive `agentDebt` or any read error blocks the “ready” state and surfaces an “Unavailable” / explanatory note; `pendingWithdrawal` is not double-subtracted (effective balance already excludes it). Wallet/network context is re-checked after the async reads.
- A local-only limitation is labelled: on-chain reads cannot see commitments made on other devices/apps.

### Fix 4 — Verify deposits without misreporting debt repayment as failure (`live-payment.mjs`, `leaderlight-live.html`)
- `fundEscrow` now reads raw escrow balance **and** `agentDebt` before and after the deposit, computes `debtRepaid` and `expectedMinRawIncrease = topUp - debtBefore`, and validates against that minimum — so a legitimate deposit that clears debt no longer throws “did not increase by requested amount”. Both the balance-aware and legacy paths do this.
- `deposit_confirmed` reports `debtRepaid` and `debtRemaining`; the UI `walletAction` wires `onStage` (approval pending/confirmed/skipped, deposit pending/confirmed) into the action note instead of a single generic failure. All funding buttons are disabled during an active funding action and the stale “funding is always a separate 3 USDC transaction” copy was removed.

## B. Test #10 correction

The added adversarial test #10 originally deadlocked: its “barrier” waited for two concurrent *initial* `402` fetches, but Fix 1 now serializes the whole flow (including that first fetch) inside the lock, so the second fetch never fired and the barrier promise never resolved. Its assertion (`personalSignCount === 1` across two *different* run IDs) also conflicted with the deliberate-reassessment behaviour in #6.

Rewritten to fire two concurrent calls for the **same** wallet/intent/params/**runId** (a double-click / two tabs of one assessment). With the lock, exactly one reaches `personal_sign` and returns a `protocol_receipt`; the other is refused with “already authorized in the current assessment run”; the receipt is preserved in append-only history. A new test #13 verifies concurrent **distinct** inputs in one run both authorize and preserve separate receipts (no false blocking, simultaneous ledger updates).

## C. MetaMask connect warning (unchanged architecture)

- **Why a warning appears:** MetaMask’s anti-phishing scanner flagged `leaderlight.vercel.app` as `BLOCK / DRAINER` on 2026-11-12. This is MetaMask’s external blocklist, not a defect in Leaderlight’s connect code, which uses standard EIP-6963 provider discovery and `eth_requestAccounts` and requests **account access only** (no signature, no transaction on connect).
- **Current status:** review request [#311992](https://github.com/MetaMask/eth-phishing-detect/issues/311992) is **closed / completed** (`state_reason: completed`) as of `2026-11-13T14:05:14Z` (verified via the GitHub API on 2026-11-18).
- **If a warning still shows:** it is a stale cached phishing list in the user’s MetaMask extension (extensions cache the list locally); restart/update MetaMask to refresh it. If it recurs, file a new review request — do **not** alter the connect code to work around an external classification. No connect-architecture change was made, per the repair brief.

## D. Weather miner note (no change applied)

The Instinct review proposed a Cloudflare Worker retry proxy between Telegraph and Open-Meteo to absorb upstream TLS timeouts, serving failure (never stale data) if retries exhaust. The **registered** `miner-yaml-public/weather-verify-openmeteo.yaml` still points `base_url` directly at `https://api.open-meteo.com`; no retry worker exists in this repository and the YAML was **not** changed. Per the proposal, the YAML must not be re-registered until its `base_url` matches an actually-deployed worker URL — so no registration or wallet action was taken here.

## E. Test & verification results (mocked only)

- **Node suite** (`node --test` over all four files): **74 pass, 0 fail, 0 skipped** (~3.6 s). Regression file now has 13 tests (1–9 unchanged, #10 corrected, #11 deposit-debt, #12 spendable-fail-closed, #13 concurrent-distinct).
- **Browser suite** (`npm run test:browser`):
  - `review/browser-test.mjs`: all checks pass, no uncaught exceptions, no external calls.
  - `review/paid-browser-test.mjs`: `valid` (2 signatures, 2 receipts), `partial` (2 signatures, 1 unknown), `unknown` (1 signature, no receipt), `malformed-challenge` (0 signatures, network rejected) — all pass, `externalCalls: 0`. The reload re-run now asserts: `valid` re-runs (2 signatures, no “Reconcile”, append-only history ≥ 2), `partial` re-runs the cleared name then stops at the unknown one, `unknown` stays blocked — matching the Fix 2 lifecycle.
- **Screenshots:** regenerated by the browser tests under `review/screenshots/` at 320 / 390 / 1280 px (disconnected, offline result, connected, wrong-network, and per-scenario paid states).
- **Honesty caveat:** every wallet, signature, receipt, balance and Engine response in these runs is a local fixture. These passes do not certify real MetaMask connection, real on-chain deposit/debt behaviour, or final epoch settlement.

## F. Remaining manual checklist (review-only; throwaway Sepolia wallet only)

1. Connect MetaMask on Sepolia; confirm the prompt requests account access only (no sign/tx).
2. Read the funding panel: spendable is `Unavailable` while any read is in error or debt > 0; top-up options appear only when spendable < $0.02.
3. Top-up $0.02: if allowance is short, approve exactly 20,000 μUSDC, then deposit; confirm the note reports any debt repaid and the new raw balance.
4. Run two distinct sanctions names; approve two `personal_sign` challenges; confirm two protocol receipts and an honest “not final settlement” label.
5. Double-click Run on the same names within one assessment: confirm only one signature is requested and a “Reconcile” refusal appears, with the first receipt still in history.
6. Click **New assessment**, re-enter the same names, Run again: confirm the fresh run re-authorizes (new runId) and the prior receipt is preserved.
7. Change wallet/network mid-run: confirm the run aborts before any further request.

**Release state:** review-only commit on `review/concurrency-lifecycle-debt-fix`. No merge to `main`, no deployment, no real wallet action, no key on any server. Separate user approval is required before any remote push beyond this review branch, merge, or release.
