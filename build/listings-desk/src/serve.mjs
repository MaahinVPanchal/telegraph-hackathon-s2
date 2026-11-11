#!/usr/bin/env node
// Minimal local web UI for the listings desk — no dependencies.
//   node src/serve.mjs     → http://localhost:7788
// Token-only runs cannot resolve other candidate identities.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDesk } from "./desk.mjs";
import { MEMO_CSS, renderHtmlFragment, THEME_TOKENS } from "./memo.mjs";

const PORT = Number(process.env.PORT ?? 7788);
const MODE = process.env.DESK_MODE ?? "mock";
const IS_MOCK = MODE === "mock";

const PAGE_CSS = `
* { box-sizing: border-box; }
html { background: var(--ld-page); scroll-behavior: smooth; }
body {
  margin: 0;
  background:
    radial-gradient(ellipse at 82% 0%, rgba(87, 52, 112, .13), transparent 38rem),
    var(--ld-page);
  color: var(--ld-text);
  font: 15px/1.55 system-ui, "Segoe UI", sans-serif;
}
button, input { font: inherit; }
button, input, a, summary { -webkit-tap-highlight-color: transparent; }
:focus-visible { outline: 3px solid var(--ld-focus); outline-offset: 3px; }
.app-shell { width: min(100%, 1200px); margin: 0 auto; padding: 0 24px 42px; }
.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 76px;
  border-bottom: 1px solid var(--ld-border);
}
.header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.brand-mark {
  position: relative;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  background: var(--ld-border);
  clip-path: polygon(50% 0, 94% 25%, 94% 75%, 50% 100%, 6% 75%, 6% 25%);
}
.brand-mark::after {
  content: "";
  position: absolute;
  inset: 2px;
  background: var(--ld-surface);
  clip-path: polygon(50% 0, 94% 25%, 94% 75%, 50% 100%, 6% 75%, 6% 25%);
}
.brand-mark span {
  position: absolute;
  z-index: 1;
  inset: 11px;
  background: var(--ld-primary);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
}
.brand-name { display: block; font-size: .82rem; font-weight: 850; letter-spacing: .13em; }
.brand-subtitle { display: block; color: var(--ld-secondary); font-size: .75rem; }
.mode-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 5px 12px;
  border: 1px solid rgba(173, 123, 234, .62);
  border-radius: 999px;
  background: rgba(173, 123, 234, .08);
  color: var(--ld-primary-strong);
  font-size: .68rem;
  font-weight: 800;
  letter-spacing: .1em;
  text-align: center;
}
.mode-badge--real, .mode-badge--invalid { border-color: rgba(239, 199, 126, .62); color: var(--ld-caution); }
.wallet-connect {
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid var(--ld-border);
  border-radius: 8px;
  background: var(--ld-surface-raised);
  color: var(--ld-text);
  cursor: pointer;
  font-size: .82rem;
  font-weight: 750;
  overflow-wrap: anywhere;
}
.wallet-connect:hover:not(:disabled) { border-color: var(--ld-primary); background: rgba(173, 123, 234, .12); }
.wallet-connect:disabled { cursor: progress; opacity: .7; }
.wallet-status {
  margin: 10px 0 0;
  color: var(--ld-secondary);
  font-size: .76rem;
  overflow-wrap: anywhere;
}
.wallet-status--connected { color: var(--ld-primary-strong); }
.wallet-status--pending { color: var(--ld-caution); }
.wallet-status--error { color: var(--ld-danger); }
.workspace-grid {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  align-items: stretch;
  gap: 24px;
  margin-top: 24px;
}
.workspace-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-self: stretch;
  padding: 18px 12px;
  border: 1px solid var(--ld-border);
  border-radius: 14px;
  background: var(--ld-surface);
}
.workspace-nav-label {
  margin: 4px 8px 8px;
  color: var(--ld-secondary);
  font-size: .7rem;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.workspace-nav a {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--ld-secondary);
  font-size: .83rem;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.workspace-nav a:hover, .workspace-nav a:focus-visible {
  border-color: var(--ld-border);
  background: rgba(173, 123, 234, .08);
  color: var(--ld-primary-strong);
}
.workspace-nav a:first-of-type {
  border-color: rgba(173, 123, 234, .24);
  background: rgba(173, 123, 234, .12);
  color: var(--ld-primary-strong);
}
.workspace-main { min-width: 0; }
.hero { position: relative; max-width: 760px; padding: clamp(32px, 7vw, 66px) 0 28px; }
.hero::before {
  content: "";
  display: block;
  width: 58px;
  height: 3px;
  margin-bottom: 16px;
  background: var(--ld-primary);
}
.eyebrow {
  margin-bottom: 9px;
  color: var(--ld-primary-strong);
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .17em;
  text-transform: uppercase;
}
.hero h1 { max-width: 680px; margin: 0; font-size: clamp(2.15rem, 6vw, 3.9rem); line-height: 1.03; letter-spacing: -.045em; }
.hero-copy { max-width: 650px; margin: 16px 0 0; color: var(--ld-secondary); font-size: 1rem; }
.setup-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: 16px; }
.panel {
  min-width: 0;
  padding: clamp(16px, 3vw, 24px);
  border: 1px solid var(--ld-border);
  border-radius: 15px;
  background:
    linear-gradient(140deg, rgba(173, 123, 234, .035), transparent 45%),
    var(--ld-surface);
  box-shadow: 0 16px 38px rgba(0, 0, 0, .13);
}
.panel h2 { margin: 0 0 14px; font-size: 1.16rem; line-height: 1.3; }
.field-label { display: block; margin: 14px 0 6px; font-size: .88rem; font-weight: 700; }
.field-help { margin: 7px 0 13px; color: var(--ld-secondary); font-size: .82rem; }
.token-input {
  display: block;
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid var(--ld-border);
  border-radius: 8px;
  background: #0c0a11;
  color: var(--ld-text);
}
.token-input::placeholder { color: #81768f; opacity: 1; }
.token-input[aria-invalid="true"], .token-input:invalid:not(:placeholder-shown) { border-color: var(--ld-caution); }
.primary-action {
  width: 100%;
  min-height: 48px;
  margin-top: 5px;
  padding: 10px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--ld-primary);
  color: #170f20;
  cursor: pointer;
  font-weight: 850;
  transition: background-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.primary-action:hover:not(:disabled) { background: var(--ld-primary-strong); box-shadow: 0 0 22px rgba(173, 123, 234, .2); transform: translateY(-1px); }
.primary-action:disabled { cursor: progress; opacity: .7; }
.mode-help {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-left: 2px solid var(--ld-primary);
  background: rgba(173, 123, 234, .07);
  color: var(--ld-secondary);
  font-size: .8rem;
}
.limit-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.limit-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid rgba(48, 38, 55, .8);
  font-size: .82rem;
}
.limit-list li:first-child { border-top: 0; }
.limit-list span { color: var(--ld-text); }
.limit-list strong { color: var(--ld-secondary); font-size: .75rem; font-weight: 600; text-align: right; }
.boundary-note { margin: 14px 0 0; color: var(--ld-secondary); font-size: .78rem; }
.out-region { min-width: 0; margin-top: 16px; }
.empty-state, .request-state, .request-error {
  margin: 0;
  padding: 14px 16px;
  border: 1px solid var(--ld-border);
  border-radius: 10px;
  background: var(--ld-surface);
  color: var(--ld-secondary);
  overflow-wrap: anywhere;
}
.request-state { border-left: 3px solid var(--ld-primary); }
.request-state--real { border-left-color: var(--ld-caution); }
.request-error { border-left: 3px solid var(--ld-danger); color: var(--ld-danger); }
.app-footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid var(--ld-border); color: var(--ld-secondary); font-size: .74rem; }
.app-footer p { margin: 4px 0; }
@media (max-width: 760px) {
  .app-shell { padding-right: 18px; padding-left: 18px; }
  .workspace-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; margin-top: 16px; }
  .workspace-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 8px; }
  .workspace-nav-label { grid-column: 1 / -1; margin: 2px 6px 0; }
  .workspace-nav a { justify-content: center; padding: 7px 5px; text-align: center; }
  .setup-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 420px) {
  .app-shell { padding-right: 14px; padding-left: 14px; }
  .site-header { flex-wrap: wrap; min-height: 68px; padding: 12px 0; }
  .header-actions { width: 100%; justify-content: space-between; }
  .mode-badge { max-width: 132px; padding: 5px 9px; font-size: .62rem; }
  .hero { padding-top: 34px; }
  .hero-copy { font-size: .94rem; }
  .limit-list li { align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
`;

export function renderPage(mode = MODE) {
  const isMock = mode === "mock";
  const modeLabel = isMock ? "SIMULATED / OFFLINE" : mode === "real" ? "REAL" : "INVALID MODE";
  const actionLabel = isMock ? "Run offline demo" : "Run assessment";
  const modeHelp = isMock
    ? "Offline fixtures only. No Engine calls, payments, or signatures."
    : "Token-only page: required entity and account identities are not inferred, so checks needing them remain missing.";
  const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#09080e"><title>Telegraph Listings Desk</title>
<style>${THEME_TOKENS}${PAGE_CSS}${MEMO_CSS}</style></head><body>
<main class="app-shell">
  <header class="site-header">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"><span></span></span>
      <span><span class="brand-name">LISTINGS DESK</span><span class="brand-subtitle">Telegraph intelligence workspace</span></span>
    </div>
    <div class="header-actions">
      <span class="mode-badge${isMock ? "" : mode === "real" ? " mode-badge--real" : " mode-badge--invalid"}">${modeLabel}</span>
      <button class="wallet-connect" id="wallet-connect" type="button">Connect MetaMask</button>
    </div>
  </header>
  <p class="wallet-status" id="wallet-status" role="status" aria-live="polite" aria-atomic="true">Wallet not connected. Account access is optional and is not used by assessment requests.</p>
  <div class="workspace-grid">
    <nav class="workspace-nav" aria-label="Workspace sections">
      <p class="workspace-nav-label">Workspace</p>
      <a href="#candidate-form">Assessment</a>
      <a id="nav-evidence" href="#out">Evidence</a>
      <a id="nav-receipts" href="#out">Receipt details</a>
    </nav>
    <div class="workspace-main">
      <section class="hero" aria-labelledby="hero-title">
        <p class="eyebrow">Clarity before conviction</p>
        <h1 id="hero-title">A sharper view of listing risk.</h1>
        <p class="hero-copy">Check the candidate. Keep uncertainty visible. Review the evidence behind every recommendation.</p>
      </section>
      <section class="setup-grid" aria-label="Assessment setup">
        <form class="panel" id="candidate-form" novalidate>
          <p class="eyebrow">01 / Candidate</p>
          <h2>Run a ${isMock ? "local simulation" : "listing assessment"}</h2>
          <label class="field-label" for="token">Token symbol or contract address</label>
          <input class="token-input" id="token" name="token" type="text" placeholder="e.g. PEPE or 0x…" autocomplete="off" maxlength="120" required aria-describedby="token-help">
          <p class="field-help" id="token-help">Token-only input. Treasury, deployer, social identities, chain and repository are not inferred.</p>
          <button class="primary-action" id="run-button" type="submit">${actionLabel}</button>
          <p class="mode-help">${modeHelp}</p>
        </form>
        <aside class="panel" aria-labelledby="limits-title">
          <p class="eyebrow">Evidence overview</p>
          <h2 id="limits-title">What this desk can establish</h2>
          <ul class="limit-list">
            <li><span>Sanctions and social checks</span><strong>Explicit identities only</strong></li>
            <li><span>On-chain checks</span><strong>Balance does not prove concentration</strong></li>
            <li><span>Audit and repository history</span><strong>Unsupported by current contracts</strong></li>
            <li><span>MetaMask connection</span><strong>Account access only</strong></li>
          </ul>
          <p class="boundary-note">Connecting a wallet requests account access only. It does not sign, pay, or send the address to this assessment.</p>
        </aside>
      </section>
      <section class="out-region" id="out" aria-live="polite" aria-busy="false" aria-label="Assessment result">
        <p class="empty-state">No result loaded. Run an offline demo or assessment to inspect the available evidence.</p>
      </section>
    </div>
  </div>
  <footer class="app-footer">
    <p>Application policy and supplied evidence only; not an official Telegraph guarantee or ranking.</p>
    <p>Abstract geometric styling is original and unaffiliated. Wallet connection does not authorize an assessment, signature, or payment.</p>
  </footer>
</main>
<script>
const form = document.getElementById("candidate-form");
const input = document.getElementById("token");
const output = document.getElementById("out");
const button = document.getElementById("run-button");
const mockMode = ${isMock};
const defaultButtonText = ${JSON.stringify(actionLabel)};

function validateToken() {
  const value = input.value.trim();
  input.setCustomValidity(!value ? "Enter a token symbol or contract address." :
    value.length > 120 ? "Token input must be 120 characters or fewer." : "");
  if (input.validity.valid) input.removeAttribute("aria-invalid");
  else input.setAttribute("aria-invalid", "true");
}

input.addEventListener("input", validateToken);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  validateToken();
  if (!form.reportValidity()) return;

  button.disabled = true;
  button.textContent = mockMode ? "Running offline demo…" : "Running assessment…";
  output.setAttribute("aria-busy", "true");
  const loading = document.createElement("p");
  loading.className = "request-state" + (mockMode ? "" : " request-state--real");
  loading.setAttribute("role", "status");
  loading.textContent = mockMode
    ? "SIMULATED/OFFLINE — rendering local fixtures; no Engine calls, payments, or signatures."
    : "REAL mode — checking the explicitly supplied token; required identities are not inferred.";
  output.replaceChildren(loading);

  try {
    const response = await fetch("/memo?token=" + encodeURIComponent(input.value.trim()));
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(typeof payload?.error === "string" ? payload.error : "Request failed (HTTP " + response.status + ")");
    }
    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const memo = parsed.querySelector(".listings-memo");
    if (!memo) throw new Error("The result memo could not be displayed.");
    output.replaceChildren(document.importNode(memo, true));
    document.getElementById("nav-evidence").href = "#evidence-section";
    document.getElementById("nav-receipts").href = "#receipts-section";
  } catch (error) {
    const message = document.createElement("p");
    message.className = "request-error";
    message.setAttribute("role", "alert");
    message.textContent = "Failed: " + String(error?.message ?? error);
    output.replaceChildren(message);
    document.getElementById("nav-evidence").href = "#out";
    document.getElementById("nav-receipts").href = "#out";
  } finally {
    button.disabled = false;
    button.textContent = defaultButtonText;
    output.setAttribute("aria-busy", "false");
  }
});
</script><script type="module" src="/wallet-client.mjs"></script></body></html>`;
  return PAGE;
}

function startLocalServer() {
  const walletClient = readFileSync(new URL("../public/wallet-client.mjs", import.meta.url));
  createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/wallet-client.mjs" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(walletClient);
      return;
    }
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderPage());
      return;
    }
    if (url.pathname === "/memo") {
      const token = url.searchParams.get("token")?.trim();
      if (!token || token.length > 120) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "missing or bad token" }));
        return;
      }
      try {
        const { memo } = await runDesk(token, { mode: MODE });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderHtmlFragment(memo));
      } catch (error) {
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        const message = error instanceof Error ? error.message : String(error);
        res.end(JSON.stringify({ error: message.slice(0, 400) }));
      }
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  }).listen(PORT, "127.0.0.1", () => {
    console.log(`listings desk on http://127.0.0.1:${PORT} (mode: ${MODE})`);
    console.log(IS_MOCK
      ? "SIMULATED/OFFLINE mode: no Engine calls, payments or signatures."
      : "REAL mode: token-only requests remain blocked where required.");
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startLocalServer();
}
