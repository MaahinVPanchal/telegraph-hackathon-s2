# LIVE MetaMask test runbook (leaderlight.vercel.app)

Run ONLY after: (1) Instinct approves `22ba967`, (2) it merges to main, (3) build-03 is deployed and verified, (4) Maahin explicitly approves the amounts.

## Pre-conditions (verified 2026-11-20, re-check before starting)

- Gas: wallet holds 0.13 ETH on Sepolia — 3 transactions need ~0.0005 ETH ✅
- Test USDC: wallet holds 13 — the deposit needs 3.00 ✅
- Node ledger route on production: 200 ✅
- MetaMask must be on **Ethereum Sepolia (chain 11155111)** — the page warns and blocks on the wrong network

## The sequence — expected outcome at every step

1. **Connect** → MetaMask asks for account access ONLY (no signature, no payment). Button shows `Connected · 0x5549…7821`. Badge flips to TESTNET LIVE, balances load.
2. **Mint 10 test USDC** → one MetaMask transaction, free testnet token. Balance updates after the receipt confirms.
3. **Fund escrow ($3.00)** → TWO transactions: an exact 3.00 USDC approval (never unlimited), then the deposit. Each needs its own approval. After confirmation the node ledger may lag — the page says "confirmed on-chain; indexing" and blocks repeat funding until the ledger reflects it. **Never deposit twice.**
4. **Run LIVE** → two $0.01 sanctions screenings. Each asks for one `personal_sign` showing the exact Telegraph payment template (amount 10000 uUSDC, payTo the current Diamond). No transaction — a signature only.
5. **Result** → the memo shows both receipts (receipt_hash, epoch_id, amount µUSDC, miner) and the verdict.

## Capture for the submission

- Screenshot after Connect (balances loaded), after Fund (pending/confirmed), after Run (the receipted memo)
- Both receipt hashes + the deposit tx hash (from the page and MetaMask activity)
- The verdict and spendable display

## Failure playbook

| Symptom | Meaning | Action |
|---|---|---|
| "indexing" message after funding | Ledger lag (normal, minutes) | Wait + Refresh balances — never fund again while it shows |
| "deposit transaction reverted" | The deposit genuinely failed on-chain | Check the tx on Sepolia explorer; the pending record marks it reverted; funding unlocks |
| "deposit submitted but receipt is unknown" | RPC lost track of the tx | Do NOT re-deposit; verify the hash on the explorer |
| "A previous deposit … is confirmed but not yet reflected" | The pending guard blocked a repeat | Correct behavior — Refresh until it resolves |
| Wrong network warning | MetaMask on another chain | Switch to Sepolia; balances load only there |

## Rules

- One deposit. If anything looks wrong, stop and report — never fund twice on the same lag.
- Every signature prompt must show the Telegraph payment template with the exact amount before you approve.
- Record everything as you go; this is the proof artifact for the submission.
