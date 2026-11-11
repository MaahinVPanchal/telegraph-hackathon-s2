# 📋 ANJOMAN REGISTRATION — exact values for all three miners

> Page: anjoman.ai/dashboard/earn → **"I already host a YAML"**
> All values computed 27 Oct 2026 from the exact bytes the CDN serves. All three
> upstreams are **keyless** → uncheck "Requires API key" for every miner.

---

## 🪨 Miner 1 — OnChain Metric Verify (Hybrid archive + Ethplorer)

| Field | Value |
|---|---|
| YAML URL | `https://raw.githubusercontent.com/MaahinVPanchal/telegraph-miner-yaml/main/onchain-metric-publicnode.yaml` |
| YAML hash (bytes32) | `0xeace09fdd5e66b5894953e81c71bfd435cfb7bf52140fa46b231e9cdd1c57c32` |
| Requires API key | **UNCHECK** (worker needs no upstream key — tested keylessly ✅) |
| Fee address | `0x5549286a1C71893816899BbEF8F4CE4d91f87821` |
| Floor price (USDC) | `0.01` |
| Telegraph registration | **4873** (superseded 4870) |

---

## 🌤️ Miner 2 — Weather Forecast Verify (Open-Meteo)

| Field | Value |
|---|---|
| YAML URL | `https://raw.githubusercontent.com/MaahinVPanchal/telegraph-miner-yaml/main/weather-verify-openmeteo.yaml` |
| YAML hash (bytes32) | `0xbf6e92f630cf85b631bd15ae5ba617adfeca143ae40b91e5e66d75fbd3b583bb` |
| Requires API key | **UNCHECK** (Open-Meteo is keyless) |
| Fee address | `0x5549286a1C71893816899BbEF8F4CE4d91f87821` |
| Floor price (USDC) | `0.01` |
| Telegraph registration | **4874** (superseded 4871) |

---

## 💱 Miner 3 — FX Now (Frankfurter ECB)

| Field | Value |
|---|---|
| YAML URL | `https://raw.githubusercontent.com/MaahinVPanchal/telegraph-miner-yaml/main/fx-now-frankfurter.yaml` |
| YAML hash (bytes32) | `0xcf2df08ea7098c32733c0cbeed9bc98eeab2696e0eeccdc4dfad38ee810c13e6` |
| Requires API key | **UNCHECK** (Frankfurter is keyless) |
| Fee address | `0x5549286a1C71893816899BbEF8F4CE4d91f87821` |
| Floor price (USDC) | `0.01` |
| Telegraph registration | **4854** |

---

## What each Anjoman field means (and our answer)

1. **YAML URL** — where the descriptor is publicly hosted. Placeholder suggests Pinata/IPFS, but the field says "HTTPS or IPFS" — our GitHub raw URLs are HTTPS and valid.
2. **YAML hash (bytes32)** — SHA-256 of the raw YAML bytes, 0x-prefixed, **not keccak256**. Our values are computed from the exact bytes GitHub serves right now. Sanity check: use their "Generate from file" button on a freshly downloaded copy — it must equal the hash above.
3. **Requires API key** — only for upstreams that need a key. All three of ours are keyless public APIs → **uncheck**. (If you ever register a keyed miner, Anjoman tests the key against your endpoints and stores it — never logged.)
4. **Validate endpoints** — Anjoman sandbox-tests each endpoint against the real upstream before allowing registration. Click it after filling the URL+hash. Our endpoints were hand-verified: onchain worker returns `{"ok":true,"metric":"eth_balance","value":"5.77…","unit":"ETH"}`, weather returns Open-Meteo hourly/daily JSON, FX returns `{"rates":{"EUR":0.89…}}`.
5. **Fee address** — where USDC payouts go. The form pre-filled `0x1B91F5a7…` (whatever wallet is connected to Anjoman). **Replace with `0x5549…7821`** if you want all earnings in one place — your call.
6. **Floor price (USDC)** — 0.01, matching our Telegraph floor.

## ⚠️ Two cautions

- **Freeze Grok's pushes until all three are registered.** Each GitHub push changes the bytes → the hash changes → Anjoman's stored hash goes stale (same drift loop we just closed on Telegraph). Register, then let Grok push.
- This Anjoman registration is **separate from the Telegraph on-chain registration** (which is already live: 4873 / 4874 / 4854). Anjoman routes its own USDC-paid requests to your endpoints — same YAML, different payment rail.
