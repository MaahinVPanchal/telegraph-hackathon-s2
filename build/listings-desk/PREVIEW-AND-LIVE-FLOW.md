# Leaderlight: preview scenarios and the full live flow

Reference for how the offline preview relates to the real Sepolia assessment
flow. Read together with `LIVE-TEST-RUNBOOK.md` (recording script) and
`README.md`.

## What the preview is

The offline workspace tab is **"Preview the memo format"**. It renders what a
risk memo looks like using five fixed fixture scenarios (`/memo?token=…&scenario=1..5`,
default 1). Rules that hold by construction:

- The scenario fixtures run through the **same real assess() evidence path** as
  live runs (`src/preview-scenarios.mjs` → `runDesk` with an injected ask, mode
  `"real"`), so verdicts come from the decision pipeline — never a hard-coded
  string.
- The preview is **network-free**: no Engine calls, no payments, no wallet, no
  fetch. A test blocks `globalThis.fetch` and runs all five scenarios to prove it.
- Fixture data is **always labeled**: memo banner "SIMULATED / OFFLINE —
  PREVIEW. Preview with fixture data. Not real evidence.", `mode: mock`,
  `actual spent (preview: no funds moved): $0`.
- The preview can **never produce GO**: fixtures only exercise sanctions and
  social, and audit / on-chain / code-review stay unsupported.
- The workspace form fields are **rehearsal inputs**: they teach the LIVE data
  model. The preview always renders the selected scenario's fixed fixture
  identities, never typed text.

## The five preview scenarios

| # | Name | Screened fixture | Verdict the pipeline prints |
|---|------|------------------|-----------------------------|
| 1 | Token only | none — token only | `UNKNOWN` |
| 2 | Clean explicit identities | deployer + treasury clean, social 0.10 | `REVIEW` |
| 3 | Sanctions screening unavailable | sanctions unavailable, social valid | `REVIEW` |
| 4 | Bot-like social account | sanctions clean, social 0.40 (`@sample_bot`) | `REVIEW` |
| 5 | Sanctioned entity match | "Sample Sanctioned Entity" matched=true | `NO-GO` (hard block) |

Every scenario shows a staged walkthrough per check — **Input → Request →
Answer → Validation → Verdict** — with unsupported checks labeled "not sent:
unsupported by current contracts".

## The full live flow (real funds, gated)

Everything below needs explicit approval of amounts and gas and is currently
**on hold** until the preview work is re-reviewed and merged.

1. **Connect** — MetaMask on Ethereum Sepolia (chain 11155111). Connecting
   grants account access only; nothing signs until you approve.
2. **Fund escrow** — `approve` then `depositUSDC` on the Sepolia Diamond
   `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b` (balances on the old Diamond do
   not carry over). Gas is estimated before each transaction (test USDC approve
   costs ~128.9k gas). Deposits are recorded as pending and reconciled against
   the node ledger `GET /api/ledger/account/<address>` — indexing lag shows as
   "indexing"; never fund again while it shows.
3. **Enter explicit identities** — deployer and treasury entity names (sanctions
   subjects) and social accounts. Identities are never guessed from addresses;
   missing inputs stay "missing" in the memo.
4. **Run the LIVE assessment** — each request: Engine returns a 402 escrow
   challenge → the app validates network/payTo/origin/resource/amount against
   caps ($0.01 per call, $0.02 per run) → you approve one `personal_sign` → the
   X-PAYMENT retry returns an `X-Payment-Response` receipt. The exact charge is
   shown before MetaMask opens.
5. **Evidence states** — a valid receipt is the node's ledger-row attestation
   (releases the reservation, `accountedByNode`); it is **not** final epoch
   settlement. Delivery proofs (`/v1/blocks/{epoch}/deliveries/{receiptHash}`)
   appear only after the epoch closes (~1h). On-chain verification stays
   disabled and labeled as such.
6. **Verdicts** — audit, on-chain metrics and code review are unsupported by
   current Telegraph contracts, so the best verdict a real run can reach today
   is `REVIEW`. `GO` additionally needs those checks, which do not exist yet.
   A confirmed sanctions match is a `NO-GO` hard block.

## Where the preview fits

The preview rehearses steps 3–5's *shape* (inputs → checks → evidence →
verdict) with zero risk. When the live run's memo looks unfamiliar, compare it
against the matching preview scenario: any difference beyond fixtures-vs-real
data is a bug worth reporting.
