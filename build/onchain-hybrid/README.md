# onchain-hybrid — backend for the ONCHAIN_METRIC_VERIFY miner

Prototype of the "hybrid" design from the onchain history brief. **Not deployed.** The live
miner is still registration 4860 (Ethplorer YAML, latest state only).

`ONCHAIN_METRIC_VERIFY` questions are anchored at a block height or "latest". Ethplorer only
serves latest state; free PublicNode refuses archive reads (epoch 442 403); Blockscout rejects
the forwarded `block_number` (epoch 443 422); raw Ethplorer answers blew the 131072-byte cap
(epoch 444). This service fixes all three:

| Question | Route | Answer |
|---|---|---|
| `eth_balance` at `latest` | Ethplorer `getAddressInfo` with `token=0x0..0&showETHTotals=false` (RPC fallback) | `balance_wei`, `balance_eth` |
| anything at a historical block | archive JSON-RPC at that exact block (`eth_getBalance`, `eth_getTransactionCount`, `eth_getCode`, `eth_call balanceOf`) | value at that block, never the current one |

- One endpoint: `GET /query?address=0x..&block_number=18000000|0x112a880|latest&metric=eth_balance|tx_count|code|erc20_balance[&token=0x..]`
- Unknown params ignored; block aliases accepted (`block`, `blockNumber`, `blockNo`, `block_height`, ...).
- Exact units via BigInt (no float rounding). Bytecode is never returned (only `code_size_bytes`).
- Every response is serialized with a hard cap of 4096 bytes (`MAX_BYTES`); over that it returns an explicit `ANSWER_TOO_LARGE` error, never a truncated answer.
- 8 s timeout + one retry per upstream, then the next provider. Any JSON-RPC error (pruned / historical state unavailable / archive token required) moves to the next provider.
- Cache: historical answers forever (LRU 500), latest 15 s, chain head 6 s.
- Errors are HTTP 400/502 with `{"ok":false,"error":CODE,"message":...}` and never contain a guessed value. Future blocks are refused.

## Archive RPCs

Free keyless endpoints that answered `eth_getBalance`/`eth_getTransactionCount` at blocks 1,000,000 and
18,000,000 on 27 Oct 2026, tried in order: blastapi, nodies (POKT), tatum, mevblocker, drpc, tenderly.
Public endpoints change without notice. For reliability set `ARCHIVE_RPC_URL` (comma-separated; e.g. an
Alchemy or Infura free-tier key URL); it is tried first.

Refused archive reads in the same test: PublicNode (personal token), 1rpc, Flashbots (pruned), bloXroute,
Ankr (key), Cloudflare-eth (internal error), Merkle (rate limit), BlockPI (key), OnFinality (rate limit).

## Run / test locally (Node >= 18, no dependencies)

```bash
npm start          # http://localhost:8787/query?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&block_number=18000000
npm test           # 13 live cases against real upstreams
```

## Deploy (Cloudflare Workers, free plan)

Free plan: 100,000 requests/day, 10 ms CPU per request (fetch waits don't count), 50 subrequests per
request (worst case here is about 40). No cold starts, HTTPS on `*.workers.dev`.

```bash
cd build/onchain-hybrid
npx wrangler login                       # opens a browser; free Cloudflare account
npx wrangler deploy                      # prints https://onchain-hybrid.<your-subdomain>.workers.dev
# optional: npx wrangler secret put ARCHIVE_RPC_URL
curl "https://onchain-hybrid.<your-subdomain>.workers.dev/query?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&block_number=18000000"
```

Then put that URL in `../miner-kit/miners/onchain-metric-hybrid.yaml` as `base_url`, publish the YAML
byte-for-byte to the public repo, wait for the raw URL to serve the new sha256, and `updateMiner` the
current onchain registration (4860) with the new URL and hash.
