import { readFileSync, writeFileSync } from "node:fs";

const deployed = readFileSync("C:/Users/HP/AppData/Local/Temp/ll-deployed.html", "utf8");
const walletModule = readFileSync("C:/Users/HP/AppData/Local/Temp/wallet-client.mjs", "utf8").trimEnd();

let html = deployed;

// 1. Dynamic mode badge
html = html.replace(
  '<span class="mode-badge">SIMULATED / OFFLINE</span>',
  '<span class="mode-badge" id="mode-badge">SIMULATED / OFFLINE</span>'
);

// 2. The LIVE run button + the explicit-input fields after the run button
html = html.replace(
  '<button class="primary-action" id="run-button" type="submit">Run offline demo</button>',
  `<button class="primary-action" id="run-button" type="submit">Run offline demo</button>
          <button class="primary-action" id="run-live" type="button" hidden>Run LIVE assessment (signs + pays)</button>
          <div id="live-inputs" hidden>
            <label class="field-label" for="deployer-name">Sanctions: deployer entity name</label>
            <input id="deployer-name" type="text" placeholder="e.g. MaaHin Digital Labs Ltd" autocomplete="off">
            <label class="field-label" for="treasury-name">Sanctions: treasury entity name</label>
            <input id="treasury-name" type="text" placeholder="e.g. Pepe Treasury Holdings SA" autocomplete="off">
          </div>`
);

// 3. The wallet-actions block after the boundary note
html = html.replace(
  /(<p class="boundary-note">[^<]*<\/p>)/,
  `$1
          <div id="wallet-actions" hidden>
            <button class="action-button" id="mint-usdc" type="button">Mint 10 test USDC (free)</button>
            <button class="action-button" id="fund-escrow" type="button">Fund escrow: approve + deposit 3 USDC</button>
            <p id="action-note" role="status"></p>
          </div>`
);

// 4. The leaderboard section before the footer
html = html.replace(
  /(<footer class="app-footer">)/,
  `  <section class="leaderboard-panel" aria-labelledby="lb-title" hidden>
      <p class="eyebrow">Live boards</p>
      <h2 id="lb-title">Your miners, ranked</h2>
      <button class="action-button" id="lb-refresh" type="button">Refresh ranks</button>
      <div id="lb-body" aria-live="polite"></div>
    </section>
  $1`
);

// 5. New CSS before </style>
html = html.replace(
  "</style>",
  `  .secondary-action {
    min-height: 44px; padding: 8px 14px; margin-top: 8px; width: 100%;
    border: 1px solid var(--ld-caution); border-radius: 8px;
    background: rgba(239,199,126,.08); color: var(--ld-caution);
    cursor: pointer; font-size: .82rem; font-weight: 750;
  }
  .secondary-action:hover:not(:disabled) { background: rgba(239,199,126,.16); }
  .secondary-action:disabled { cursor: progress; opacity: .7; }
  .action-button {
    min-height: 42px; padding: 8px 14px; width: 100%; margin-bottom: 8px;
    border: 1px solid var(--ld-border); border-radius: 8px;
    background: var(--ld-surface-raised); color: var(--ld-text);
    cursor: pointer; font-size: .8rem; font-weight: 700; text-align: left;
  }
  .action-button:hover:not(:disabled) { border-color: var(--ld-primary); }
  .action-button:disabled { cursor: progress; opacity: .7; }
  .action-note { color: var(--ld-secondary); font-size: .76rem; overflow-wrap: anywhere; }
  .leaderboard-panel {
    margin-top: 24px; padding: 20px;
    border: 1px solid var(--ld-border); border-radius: 14px;
    background: var(--ld-surface);
  }
  .leaderboard-panel h2 { margin: 6px 0 12px; font-size: 1.1rem; }
  .leaderboard-panel .action-button { width: auto; margin-bottom: 12px; }
  .lb-row { display: flex; flex-wrap: wrap; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--ld-border); align-items: baseline; }
  .lb-row:last-child { border-bottom: none; }
  .lb-intent { color: var(--ld-primary-strong); font-size: .8rem; min-width: 240px; overflow-wrap: anywhere; }
  .lb-rank { font-weight: 800; min-width: 64px; }
  .lb-score { color: var(--ld-secondary); }
  .lb-mine { color: var(--ld-caution); font-size: .72rem; letter-spacing: .08em; font-weight: 800; }
  </style>`
);

// 6. Replace the wallet module script tag with: the inlined wallet logic + the live wiring
const liveWiring = `
// === Telegraph LIVE wiring (Ethereum Sepolia, post-migration) ===
const DIAMOND = "0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b";
const USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
const ENGINE_BASE = "https://devnode.telegraphprotocol.com/engine";
const TRUSTED_NETWORK = "eip155:11155111";
const OUR_MINERS = ["9602", "9603", "9601"];

function connectedWallet() { return window.__listingsWallet ?? null; }
function connectedAddress() { return window.__listingsWallet?.address ?? null; }
function providerRequest(params) { return window.ethereum.request(params); }
function randomNonce() {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function mintTestUsdc(wallet) {
  const data = "0x40c10f19" + wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0") + (10_000_000).toString(16).padStart(64, "0");
  return providerRequest({ method: "eth_sendTransaction", params: [{ from: wallet, to: USDC, data, gas: "0x186a0" }] });
}
async function fundEscrow(wallet) {
  const approve = "0x095ea7b3" + DIAMOND.toLowerCase().replace(/^0x/, "").padStart(64, "0") + (3_000_000).toString(16).padStart(64, "0");
  await providerRequest({ method: "eth_sendTransaction", params: [{ from: wallet, to: USDC, data: approve, gas: "0x186a0" }] });
  const deposit = "0x6a761202" + (3_000_000).toString(16).padStart(64, "0");
  return providerRequest({ method: "eth_sendTransaction", params: [{ from: wallet, to: DIAMOND, data: deposit, gas: "0x30d40" }] });
}
async function liveAssessment(wallet, intent, params, minerId) {
  const url = ENGINE_BASE + "/v1/ask" + (minerId ? "/" + minerId : "");
  const body = JSON.stringify(params ? { intent, params } : { query: params?.query ?? intent });
  const first = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (first.status !== 402) {
    if (first.ok) return { status: 200, data: await first.json().catch(() => ({})), settlement: null };
    throw new Error("Engine HTTP " + first.status);
  }
  const challenge = await first.json().catch(() => ({}));
  const entry = (challenge.accepts ?? []).find((a) => a?.scheme === "escrow");
  if (!entry) throw new Error("no escrow scheme in the 402 challenge");
  const template = String(entry.extra?.message ?? "");
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: wallet.toLowerCase(),
    to: String(entry.payTo ?? DIAMOND).toLowerCase(),
    value: (template.match(/Amount:\\s*(\\d+) uUSDC/) ?? [])[1] ?? "10000",
    validAfter: String(now - 5),
    validBefore: String(now + 100),
    nonce: randomNonce(),
  };
  const message = String(entry.extra?.message ?? "")
    .replace("{from}", authorization.from)
    .replace("{nonce}", authorization.nonce)
    .replace("{validAfter}", authorization.validAfter)
    .replace("{validBefore}", authorization.validBefore);
  const signature = await providerRequest({ method: "personal_sign", params: [message, wallet] });
  const envelope = { x402Version: 2, scheme: "escrow", network: entry.network ?? TRUSTED_NETWORK, payload: { signature, authorization } };
  const header = btoa(JSON.stringify(envelope));
  const retry = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-PAYMENT": header }, body });
  const rawSettlement = retry.headers?.get("x-payment-response") ?? null;
  let settlement = null;
  if (rawSettlement) { try { settlement = JSON.parse(atob(rawSettlement)); } catch { settlement = { raw: rawSettlement }; } }
  if (!retry.ok) throw new Error("Engine HTTP " + retry.status + " after payment");
  return { status: 200, data: await retry.json().catch(() => ({})), settlement };
}

// The LIVE run: sanctions screening with explicit inputs (2 paid requests)
const runLive = document.getElementById("run-live");
const liveInputs = document.getElementById("live-inputs");
const out = document.getElementById("out");

function renderLiveMemo(list, wallet) {
  const shell = document.createElement("div");
  shell.className = "listings-memo";
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const totalMicro = list.reduce((sum, r) => sum + Number(r.settlement?.amount_uusdc ?? 10_000), 0n);
  const rows = list.map((r) => {
    const d = r.data ?? {};
    return '<div class="memo-card"><div class="memo-card-head"><span class="memo-card-title"><code>' +
      esc(d.intent ?? "SANCTIONS_SCREENING_MATCH_GENERAL") + '</code></span><span class="memo-pill status--receipt-valid">' +
      (r.settlement ? "SETTLED · " + (r.settlement.amount_uusdc ?? "?") + " μUSDC" : "PENDING") + '</span></div>' +
      '<dl class="memo-data-grid">' +
      '<div><dt>Miner</dt><dd>' + esc(d.miner_name ?? "?") + " (#" + esc(d.miner_id ?? "?") + ')</dd></div>' +
      '<div><dt>Cost</dt><dd>$' + (d.cost_usd ?? 0.01) + '</dd></div>' +
      '<div><dt>Latency</dt><dd>' + (d.duration_ms ?? "?") + ' ms</dd></div>' +
      '<div><dt>Signal</dt><dd><code>' + esc(d.signal_hash ?? "—") + '</code></dd></div>' +
      '</dl><pre class="memo-raw">' + esc(JSON.stringify(d.result ?? {}, null, 1)) + '</pre></div>';
  }).join("");
  shell.innerHTML =
    '<div class="memo-result-head"><div><p class="memo-eyebrow">LIVE sanctions assessment · real payments</p>' +
    '<h2>' + esc(list[0]?.data?.input?.name ?? "candidate") + '</h2></div>' +
    '<span class="memo-verdict status--receipt-valid">' + list.length + ' PAID</span></div>' +
    '<p class="memo-mode-note memo-mode-note--real">LIVE mode — real Engine calls settled from your escrow. ' +
    'Receipts: ' + list.filter((r) => r.settlement).length + ' of ' + list.length + '.</p>' +
    '<div class="memo-section"><h3>Purchased intelligence</h3>' + rows + '</div>' +
    '<p class="memo-footer">Cost line: ' + list.length + ' paid requests, $' +
    (Number(totalMicro) / 1e6).toFixed(2) + ' total.</p>';
  return shell;
}

if (runLive) runLive.addEventListener("click", async () => {
  const wallet = connectedAddress();
  if (!wallet) { alert("Connect MetaMask first — the LIVE assessment pays from your escrow."); return; }
  const deployer = document.getElementById("deployer-name")?.value.trim() ?? "";
  const treasury = document.getElementById("treasury-name")?.value.trim() ?? "";
  if (!deployer || !treasury) { alert("Enter both the deployer and treasury entity names for the sanctions check."); return; }
  runLive.disabled = true;
  out.setAttribute("aria-busy", "true");
  const state = Object.assign(document.createElement("p"), { className: "request-state request-state--real", role: "status" });
  state.textContent = "LIVE — signing and paying via your connected wallet…";
  out.replaceChildren(state);
  try {
    const jobs = [
      { intent: "SANCTIONS_SCREENING_MATCH_GENERAL", params: { name: deployer } },
      { intent: "SANCTIONS_SCREENING_MATCH_GENERAL", params: { name: treasury } },
    ];
    const list = [];
    for (const job of jobs) {
      const run = await liveAssessment(wallet, job.intent, job.params, "9602");
      list.push(run);
    }
    out.replaceChildren(renderLiveMemo(list, wallet));
  } catch (error) {
    out.replaceChildren(Object.assign(document.createElement("p"), {
      className: "request-error", role: "alert",
      textContent: "LIVE failed: " + String(error?.message ?? error),
    }));
  } finally { runLive.disabled = false; }
});

// The leaderboard panel
const lbRefresh = document.getElementById("lb-refresh");
const lbBody = document.getElementById("lb-body");
if (lbRefresh) lbRefresh.addEventListener("click", async function () {
  this.disabled = true;
  try {
    const miners = await (await fetch("https://devnode.telegraphprotocol.com/api/miners")).json();
    const ours = ["onchain-metric-publicnode", "weather-verify-openmeteo", "fx-now-frankfurter"];
    lbBody.innerHTML = ours.map((slug) => {
      const m = miners.find((x) => x.slug === slug);
      if (!m) return '<div class="lb-row"><span class="lb-intent">' + slug + '</span><span class="lb-rank">absent</span></div>';
      const rows = (m.scores ?? []).map((s) =>
        '<div class="lb-row"><span class="lb-intent">' + s.intent_id + '</span><span class="lb-rank">#' +
        (s.rank ?? "—") + '</span><span class="lb-score">' + (s.score != null ? (+s.score).toFixed(4) : "—") + '</span></div>'
      ).join("") || '<div class="lb-row"><span class="lb-intent">no scores yet</span></div>';
      return '<p class="eyebrow">' + slug + ' · ' + m.activation_status + '</p>' + rows;
    }).join("<hr>");
  } catch (error) { lbBody.textContent = "Failed: " + error.message; }
  this.disabled = false;
});
`;

const walletScriptTag = '<script type="module" src="/wallet-client.mjs"></script>';
if (!html.includes(walletScriptTag)) throw new Error("wallet module script tag not found");
html = html.replace(walletScriptTag, () => "<script>\n" + walletModule + "\n" + liveWiring + "\n</script>");

writeFileSync("leaderlight-final.html", html);
console.log("final app built:", html.length, "chars");
