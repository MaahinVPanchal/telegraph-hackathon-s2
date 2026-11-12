# Leaderlight Listings Desk — honest local demo

This script demonstrates the current offline app and the un-deployed command-room concept. It does **not** make paid Engine calls, connect a wallet, sign, spend, or claim that all five checks are live. Do not record a real-mode CLI run as a live five-intent demo: the current Engine contract does not support all mandatory checks.

## Before recording

From `build/listings-desk`:

```bash
npm run demo
npm run web
```

Open the local SIMULATED/OFFLINE desk at `http://localhost:7788`. Separately open `public/leaderlight-command-room-preview.html` from a static local server if you want to show the visual concept. The preview is not the deployed app and its controls are disabled.

## Three-minute script

### 1. Problem and product (0:00–0:30)

**Show:** The local Listings Desk memo.

**Say:**
> "Leaderlight is a prototype listings desk for organizing evidence behind a token-listing decision. It makes the required checks and their evidence status visible instead of turning missing data into a confident answer."

### 2. Honest offline behavior (0:30–1:15)

**Show:** The simulated memo. Point to the recommendation, mandatory checks, evidence/payment/proof labels, and simulation status.

**Say:**
> "This run is explicitly simulated and offline. It makes no Engine calls, wallet requests, signatures, or payments. A fixture is useful for reviewing the workflow, but it is not decision evidence and we do not present its sample receipts as paid delivery."

### 3. Evidence gates and current limitation (1:15–2:00)

**Show:** The README's candidate-input and contract-compatibility sections. Do not display a fabricated GO result.

**Say:**
> "The current Engine contracts we inspected expose only part of the five-check policy. Audit, holder concentration, and repository-history evidence are still unsupported by the retrieved contracts. Those checks remain mandatory, so this version cannot honestly produce a GO. We are keeping that gate rather than spending on mismatched requests or filling gaps with defaults."

### 4. Payment evidence, precisely stated (2:00–2:35)

**Show:** The README table linking the two public epoch-2068 delivery records.

**Say:**
> "There are two previously reported 10,000-micro-USDC delivery records in the public epoch API. Both identify the same payer, miner 5166, sanctions intent, and epoch. These records support epoch-ledger inclusion for those receipt IDs. They do not prove which browser or request body produced them, a live MetaMask signature, answer accuracy, or a separate per-request chain transaction. We have not made a new paid request for this demo."

### 5. Design preview and next milestone (2:35–3:00)

**Show:** `public/leaderlight-command-room-preview.html` at desktop width, then a mobile viewport. Clearly identify it as a static, local design concept.

**Say:**
> "This is a local design preview, not a deployment. The next milestone is one supported live request with a verified answer and receipt, followed by reconciliation and a repeatable public test. We will not expand to five intents or enable payments until the contracts, wallet flow, and receipt semantics are verified."

## Short version

> "Leaderlight organizes evidence for a token-listing decision. The current desk demo is offline and clearly labeled as simulation. Some required Engine checks are unsupported, so the app does not claim a live five-intent GO. We have public epoch delivery records for two earlier reported requests, but they do not prove browser signing or answer accuracy. Our next milestone is one supported live request with a verified answer and receipt."

## Recording rules

- Keep the SIMULATED/OFFLINE label visible when showing fixtures.
- Do not run `node src/cli.mjs ... --mode real` for this demo.
- Do not click connect, sign, approve, deposit, or any payment control while recording.
- Do not describe a protocol receipt or epoch delivery record as final on-chain settlement.
- Do not claim current miner rankings, availability, answer quality, one-cent guarantees, or five-cent full reviews without fresh evidence.
