# LeaderLight Sepolia demo runbook

## Scope and readiness

The target is a two- to five-minute recording and a fresh public protocol receipt from the same approved Sepolia run. Use the exact Vercel build intended for reviewers, a funded test wallet, and Ethereum Sepolia (chain ID 11155111). The wallet owner approves the exact displayed amount interactively.

A read-only production check returned HTTP 200 for the homepage, offline memo, payment module, miner history and public escrow ledger. The ledger reported 20,000 µUSDC available for the public demo account at the time of the check. Recheck estimated spendable escrow in the UI before recording because unresolved authorizations can reduce it. The historical epoch-2068 delivery URL returned HTTP 404. The new live run and recording are pending.

## Record one blocked path and one allowed path

1. **0:00–0:45 · Show the desk and block.** Open the LIVE Sepolia workspace with MetaMask disconnected. Show the wallet requirement and disabled live action. Connect the demo wallet on Sepolia. Leave one entity name blank and show that the assessment remains blocked before a wallet signature. A wrong-network control is an alternative if the build surfaces it more clearly.
2. **0:45–1:30 · Prepare the allowed request.** Enter the same public demo entity name in the deployer and treasury fields to produce a single `SANCTIONS_SCREENING_MATCH_GENERAL` request. Verify the UI shows sufficient estimated spendable escrow. Budget up to 10,000 µUSDC (0.01 test USDC) for the one request, with the validated challenge determining the actual amount. Existing escrow can fund the request.
3. **1:30–2:30 · Approve and inspect.** Run the assessment, show the exact validated charge, and approve one MetaMask signature after confirming its request and amount. Show the assessment decision, the returned signal, the serving miner ID, and the receipt status. If the response becomes uncertain after signing, stop and reconcile before a retry.
4. **2:30–3:00 · Show the evidence.** Show the saved receipt hash and epoch. Describe the receipt as a record of the protocol response. Only label settlement confirmed when an applicable proof is verified.

## Save the recording and receipt

- Save the recording as `leaderlight-sepolia-demo.mp4`. Keep recovery phrases, private keys, browser account lists, and other account balances outside the recording.
- Select **Download receipt JSON** on the validated result. The file contains the receipt hash, epoch, amount, miner, Intent, network, protocol timestamp and export time. Retain the app URL and Git commit with the run notes.
- When available, record the HTTP result of the receipt delivery lookup at `https://devnode.telegraphprotocol.com/v1/blocks/{epoch_id}/deliveries/{receipt_hash}`. If the delivery is unavailable, retain the receipt and record the evidence status as pending or unavailable.
- Link the approved recordings and receipt in the [app README](README.md) after the live run is complete.

## Failure playbook

| Symptom | Meaning | Action |
|---|---|---|
| "indexing" message after funding | Ledger lag (normal, minutes) | Wait + Refresh balances — never fund again while it shows |
| "deposit transaction reverted" | The deposit genuinely failed on-chain | Check the tx on Sepolia explorer; the pending record marks it reverted; funding unlocks |
| "deposit submitted but receipt is unknown" | RPC lost track of the tx | Do NOT re-deposit; verify the hash on the explorer |
| "A previous deposit … is confirmed but not yet reflected" | The pending guard blocked a repeat | Correct behavior — Refresh until it resolves |
| Wrong network warning | MetaMask on another chain | Switch to Sepolia; balances load only there |
