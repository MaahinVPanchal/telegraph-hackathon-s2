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
