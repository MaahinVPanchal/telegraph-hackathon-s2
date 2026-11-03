# onchain-hybrid — backend for the ONCHAIN_METRIC_VERIFY miner

Prototype of the "hybrid" design from the onchain history brief. Deployed 27 Oct 2026 to
`https://onchain-hybrid.panchalmaahin.workers.dev` (Workers free plan), but **not yet referenced by any
registered YAML**. The live
miner is still the Ethplorer YAML, latest state only (registration 4860 as of 27 Oct 2026 - resolve it again
before signing, see below).

`ONCHAIN_METRIC_VERIFY` questions are anchored at a block height or "latest". Ethplorer only
serves latest state; free PublicNode refuses archive reads (epoch 442 403); Blockscout rejects
the forwarded `block_number` (epoch 443 422); raw Ethplorer answers blew the 131072-byte cap
(epoch 444). This service fixes all three:

| Question | Route | Answer |
|---|---|---|
| anything at `latest` | `eth_blockNumber` first, then JSON-RPC at that exact head block | value + the integer head `block` |
| `eth_balance` at `latest`, all RPCs down | Ethplorer `getAddressInfo` (`token=0x0..0&showETHTotals=false`) + `getLastBlock` | value + Ethplorer's last block, `block_note` says so |
| anything at a historical block | archive JSON-RPC at that exact block (`eth_getBalance`, `eth_getTransactionCount`, `eth_getCode`, `eth_call balanceOf`) | value at that block, never the current one |

Response block fields: `block` is **always an integer** (the block actually read) and `block_tag` is
`"latest"` or `"number"`. There is no `block_number: null` any more. The Worker accepts an integer,
hex, or the string `latest` (default); however, the Telegraph descriptor
(`../miner-kit/miners/onchain-metric-hybrid.yaml`) requires a specific decimal or hex block for
`ONCHAIN_METRIC_VERIFY_GENERAL`. Its output maps `value` with `unit`, allowing unit-aware comparison
(for example, ETH and Gwei); ETH balances also include exact `balance_wei` and `balance_eth`.
The descriptor's YAML has not been checked by Telegraph's live validator (the public endpoint
currently returns 404), so validate it through the integrate.telegraphprotocol.com register flow
before publishing.

- One endpoint: `GET /query?address=0x..&block_number=18000000|0x112a880|latest&metric=eth_balance|tx_count|code|erc20_balance[&token=0x..]`
- Unknown params ignored; block aliases accepted (`block`, `blockNumber`, `blockNo`, `block_height`, ...).
- Exact units via BigInt (no float rounding). Bytecode is never returned (only `code_size_bytes`).
- Every response is serialized with a hard cap of 4096 bytes (`MAX_BYTES`); over that it returns an explicit `ANSWER_TOO_LARGE` error, never a truncated answer.
- **Deadline + hedged failover:** each request has an 8 s total budget (`REQUEST_DEADLINE_MS`). Each upstream
  attempt is aborted (AbortController) after 2.5 s or when the budget runs out. The first 2 RPCs are raced
  in parallel; every failure (timeout, HTTP 429/5xx, JSON-RPC error such as pruned state) starts the next
  provider; the first valid answer wins and the others are aborted. Nothing runs past the deadline: the
  answer is then HTTP 504 `DEADLINE_EXCEEDED` (budget spent) or `NO_ARCHIVE_SOURCE` (every provider failed).
  For historical blocks the head check runs in parallel and is only awaited to turn a failure into
  `FUTURE_BLOCK`. Worst case measured: 8.0 s (mock: every upstream hangs). Max subrequests ≈ 16 (< 50).
- **Request logs:** one JSON line per request via `console.log`: `ts, req_id, path, status, error, address,
  token, metric, block, block_tag, source, cached, attempts, rpc_failures[{rpc, method, reason}],
  latency_ms, bytes`. RPCs appear only as labels (public host, or `ARCHIVE_RPC_URL#n`); the
  `ARCHIVE_RPC_URL` value / key is never logged or returned in error messages. On Workers these go to
  Workers Logs (`[observability] enabled = true`, `head_sampling_rate = 1` in `wrangler.toml`). The
  response carries the same id in `x-request-id` (cf-ray on Workers).
- Cache: historical answers forever (LRU 500), latest 15 s, chain head 6 s.
- Errors are HTTP 400/502/504 with `{"ok":false,"error":CODE,"message":...}` and never contain a guessed value. Future blocks are refused.

## Archive RPCs

Free keyless endpoints that answered `eth_getBalance`/`eth_getTransactionCount` at blocks 1,000,000 and
18,000,000 on 27 Oct 2026, tried in order: blastapi, nodies (POKT), tatum, mevblocker, drpc, tenderly.
Public endpoints change without notice. For reliability set `ARCHIVE_RPC_URL` (comma-separated; e.g. an
Alchemy or Infura free-tier key URL); it is tried first.

Refused archive reads in the same test: PublicNode (personal token), 1rpc, Flashbots (pruned), bloXroute,
Ankr (key), Cloudflare-eth (internal error), Merkle (rate limit), BlockPI (key), OnFinality (rate limit).

## Run / test locally (Node >= 19, no dependencies)

```bash
npm start          # http://localhost:8787/query?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&block_number=18000000
npm test           # mock failover tests, then live tests
npm run test:mock  # 14 offline failover/deadline/secret-safety cases + local CPU proxy (~20 s, mostly deliberate hangs)
npm run test:live  # 15 cases against real upstreams, incl. Ethplorer fallback with RPCs forced down
```

CPU: `test:mock` prints a local Node CPU-per-request figure as a proxy only. Measured on Cloudflare
(27 Oct 2026, 59 requests, `wrangler tail` cpuTime): p50 4 ms, p99/max 16 ms, all outcomes `ok`, no
`exceededCpu`. Cache hits and 400s use 0-1 ms; uncached upstream reads use 3-8 ms, with the first
requests on a fresh isolate reaching 10-16 ms. That is over the nominal 10 ms free-plan figure, but
Cloudflare did not terminate any of them; recheck Metrics → CPU time if traffic grows.

Workers note: `ctx.fetch` wraps the global `fetch` in an arrow function. Storing it bare and calling it as
a method makes Workers throw `Illegal invocation` (every upstream then fails as `network`); Node tolerates it.

## Deploy (Cloudflare Workers, free plan)

Free plan: 100,000 requests/day, 10 ms CPU per request (fetch waits don't count), 50 subrequests per
request (worst case here is about 16). No cold starts, HTTPS on `*.workers.dev`.

```bash
cd build/onchain-hybrid
npx wrangler login                       # opens a browser; free Cloudflare account
npx wrangler deploy                      # prints https://onchain-hybrid.<your-subdomain>.workers.dev
# optional: npx wrangler secret put ARCHIVE_RPC_URL
curl "https://onchain-hybrid.<your-subdomain>.workers.dev/query?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&block_number=18000000"
```

Then put that URL in `../miner-kit/miners/onchain-metric-hybrid.yaml` as `base_url`, publish the YAML
byte-for-byte to the public repo and wait for the raw URL to serve the new sha256.

### Resolve the active registration id immediately before signing

Every `updateMiner` creates a new registration id, so never reuse an id from notes or an old tx.
Right before building the `updateMiner` calldata:

```bash
WALLET=0x5549286a1c71893816899bbef8f4ce4d91f87821
# 1) registry (devnode dispatcher) - must print exactly one active line
curl -s https://devnode.telegraphprotocol.com/miner-dispatcher/miners/address/$WALLET/yamls \
  | jq -r '.yamls[] | select(.slug=="onchain-metric-publicnode" and .activation_status!="deregistered")
           | "\(.registration_id) \(.activation_status) \(.yaml_hash)"'
curl -s https://devnode.telegraphprotocol.com/api/miners/<ID> | jq .   # cross-check the one id

# 2) on-chain cross-check (Base Sepolia Diamond): the newest MinerRegistered for that id must not be
#    followed by a MinerDeregistered for it.
#    MinerRegistered(uint256,address,string,bytes32,address,uint256,string[]) topic0 0x7305b0d0...
#    MinerDeregistered(uint256,address)                                       topic0 0xa161d6b7...
cast rpc eth_getLogs '{"address":"0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8","fromBlock":"<recent block hex>","toBlock":"latest",
  "topics":[null,null,"0x0000000000000000000000005549286a1c71893816899bbef8f4ce4d91f87821"]}' \
  --rpc-url https://base-sepolia-rpc.publicnode.com \
  | jq -r '.[] | "\(.blockNumber) \(.transactionHash) \(.topics[0][0:10]) id=\(.topics[1])"'
# (sepolia.base.org limits eth_getLogs to 200 blocks; publicnode accepts larger ranges)
```

Use that id as the first `updateMiner` argument. If the two checks disagree or more than one onchain
registration is active, stop and do not sign.

Checked 27 Oct 2026 16:10 IST: dispatcher shows 4860 active (yaml_hash 2e033bbb...); on-chain, tx
`0x115c4b9b573ee49c8647cbc854d9ca32b49fd43e66850bb0d382a5c6a572c785` (block 50866881) emits
MinerDeregistered(4856) + MinerRegistered(4860) for this wallet, with no later deregistration of 4860.
This is a snapshot only; re-run the commands above before signing.
