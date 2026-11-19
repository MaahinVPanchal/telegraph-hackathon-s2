# Leaderlight Sepolia ledger migration

## Trusted contract and token

Leaderlight now trusts Sepolia Diamond `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b` and test USDC `0xcc194e1a843B658526D0D5C431f670028582Ae17`. The official address page identifies the Diamond as the 17 November 2026 replacement and says balances on the old Diamond do not carry over. Existing funds are not described here as lost, recoverable, or migrated.

Reference: [Addresses & Parameters](https://anjoman.ai/docs/protocol/addresses-and-params).

## Funding and balance reads

Funding uses `approve(Diamond, amount)` followed by `LedgerFacet.depositUSDC(amount)`, with six-decimal micro-USDC. The UI checks the documented node ledger `deposited` value before and after the confirmed deposit; it no longer reads the removed raw-escrow/debt selectors or assumes a debt repayment order.

Balance reads use the read-only same-origin `GET /api/ledger/account/<address>` proxy to the documented node route `/v1/ledger/account/<address>`. The UI validates the documented decimal-string fields and uses the node's `available` value as its starting point. It subtracts this device's saved pending, unknown, and protocol-receipt liabilities as an additional conservative local reservation. Receipts remain reserved because the app has no verified on-chain settlement signal. This estimate cannot account for attempts saved on another device.

Reference: [Pay from Escrow](https://anjoman.ai/docs/using/escrow-inference).

## Receipt and settlement boundary

The existing strict receipt validation requires the documented escrow rail, Telegraph chain, epoch settlement label, epoch ID, receipt hash, payer, miner, intent, micro-USDC amount, and timestamp. That receipt confirms protocol acceptance only; it is not treated as proof that an epoch ledger root settled. Invalid receipt data remains attached to the saved attempt and is shown as unvalidated data for reconciliation. The saved attempt continues to block retries.

No new-Diamond live receipt or live deposit was observed for this change. All browser payment and receipt tests are **mocked**. The deposit check remains **unverified live** until Maahin chooses to make and verify a deposit on Sepolia.

## Documentation freshness note

The address page search result was crawled today and showed the new Diamond. At 22:55 IST on 19 November 2026, cache-busted direct opens of both official pages were inaccessible through the browsing tool; the escrow page's available search excerpt was an older cached copy. Implementation therefore follows the newer official-doc facts supplied for this task, with the address page independently confirming the replacement address. No paid endpoint was called.
