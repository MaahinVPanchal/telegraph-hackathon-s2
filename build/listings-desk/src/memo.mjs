export const THEME_TOKENS = `
:root {
  color-scheme: dark;
  --ld-page: #09080e;
  --ld-surface: #121018;
  --ld-surface-raised: #181420;
  --ld-border: #302637;
  --ld-primary: #ad7bea;
  --ld-primary-strong: #c39af4;
  --ld-text: #eae5f3;
  --ld-secondary: #a89db8;
  --ld-caution: #efc77e;
  --ld-danger: #f09aab;
  --ld-focus: #e2c6ff;
}
`;

export const MEMO_CSS = `
body.memo-page {
  margin: 0;
  padding: 24px;
  background: var(--ld-page);
  color: var(--ld-text);
  font: 15px/1.55 system-ui, "Segoe UI", sans-serif;
}
.listings-memo, .listings-memo * { box-sizing: border-box; }
.listings-memo {
  width: min(100%, 1080px);
  margin: 0 auto;
  color: var(--ld-text);
}
.listings-memo h2, .listings-memo h3, .listings-memo p { margin-top: 0; }
.listings-memo h2 { margin-bottom: 6px; font-size: clamp(1.3rem, 3vw, 1.8rem); line-height: 1.2; overflow-wrap: anywhere; }
.listings-memo h3 { margin-bottom: 12px; font-size: 1rem; }
.listings-memo code, .listings-memo pre { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
.memo-result-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 24px;
  border: 1px solid var(--ld-border);
  border-radius: 16px;
  background: linear-gradient(125deg, rgba(173,123,234,.09), transparent 58%), var(--ld-surface);
}
.memo-result-head > div { min-width: 0; }
.memo-eyebrow, .memo-section-label {
  margin-bottom: 10px;
  color: var(--ld-primary-strong);
  font-size: .72rem;
  font-weight: 750;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.memo-subline, .memo-muted { color: var(--ld-secondary); }
.memo-subline { margin-bottom: 0; overflow-wrap: anywhere; }
.memo-verdict, .memo-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 4px 11px;
  border: 1px solid var(--ld-border);
  border-radius: 999px;
  font-size: .75rem;
  font-weight: 800;
  letter-spacing: .06em;
  text-align: center;
  overflow-wrap: anywhere;
}
.memo-verdict { min-width: 94px; min-height: 40px; font-size: .88rem; white-space: nowrap; }
.status--go, .status--valid, .status--simulated, .status--receipt-valid {
  border-color: rgba(173,123,234,.62);
  background: rgba(173,123,234,.12);
  color: var(--ld-primary-strong);
}
.status--review, .status--unknown, .status--missing, .status--unavailable,
.status--unsupported, .status--incomplete, .status--definitive-unpaid,
.status--unpaid-or-rejected {
  border-color: rgba(239,199,126,.62);
  background: rgba(239,199,126,.11);
  color: var(--ld-caution);
}
.status--no-go, .status--invalid, .status--failed, .status--policy-rejected {
  border-color: rgba(240,154,171,.62);
  background: rgba(240,154,171,.11);
  color: var(--ld-danger);
}
.memo-mode-note {
  margin: 14px 0;
  padding: 12px 14px;
  border: 1px solid var(--ld-border);
  border-left: 3px solid var(--ld-primary);
  border-radius: 8px;
  background: var(--ld-surface-raised);
}
.memo-mode-note--real { border-left-color: var(--ld-caution); }
.memo-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 0;
}
.memo-stat {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--ld-border);
  border-radius: 10px;
  background: var(--ld-surface);
}
.memo-stat span { display: block; color: var(--ld-secondary); font-size: .76rem; }
.memo-stat strong { display: block; margin-top: 5px; font-size: clamp(1.05rem, 2.4vw, 1.45rem); overflow-wrap: anywhere; }
.memo-stat small { display: block; margin-top: 3px; color: var(--ld-secondary); overflow-wrap: anywhere; }
.memo-critical {
  margin: 14px 0;
  padding: 14px 16px;
  border: 1px solid rgba(239,199,126,.5);
  border-radius: 10px;
  background: rgba(239,199,126,.07);
}
.memo-critical p:last-child { margin-bottom: 0; }
.memo-section {
  margin-top: 16px;
  padding: 20px;
  border: 1px solid var(--ld-border);
  border-radius: 14px;
  background: var(--ld-surface);
}
.memo-section > p:last-child { margin-bottom: 0; }
.memo-card-list { display: grid; gap: 10px; }
.memo-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--ld-border);
  border-radius: 10px;
  background: rgba(9,8,14,.45);
}
.memo-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.memo-card-title { min-width: 0; font-weight: 750; overflow-wrap: break-word; }
.memo-card-title code { color: var(--ld-primary-strong); }
.memo-pill-row { display: flex; flex-wrap: wrap; gap: 6px; }
.memo-pill {
  min-height: 26px;
  padding: 3px 8px;
  font-size: .68rem;
  letter-spacing: .04em;
  white-space: nowrap;
  overflow-wrap: normal;
  flex: 0 0 auto;
}
.memo-receipt-details { margin-top: 12px; }
.memo-receipt-details > summary {
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--ld-border);
  border-radius: 8px;
  color: var(--ld-primary-strong);
  cursor: pointer;
  font-weight: 700;
}
.memo-receipt-details > summary:focus-visible { outline: 3px solid var(--ld-focus); outline-offset: 2px; }
.memo-reason { margin: 8px 0; overflow-wrap: anywhere; }
.memo-source { margin: 8px 0 0; color: var(--ld-secondary); font-size: .84rem; overflow-wrap: anywhere; }
.memo-finding {
  margin: 8px 0;
  padding: 10px 12px;
  border-left: 3px solid var(--ld-border);
  background: var(--ld-surface-raised);
  overflow-wrap: anywhere;
}
.memo-finding--warn { border-left-color: var(--ld-caution); }
.memo-finding--bad { border-left-color: var(--ld-danger); }
.memo-finding--good { border-left-color: var(--ld-primary); }
.memo-data-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  border: 1px solid var(--ld-border);
  border-radius: 8px;
  overflow: hidden;
}
.memo-data-grid > div { min-width: 0; padding: 9px 10px; background: var(--ld-surface); }
.memo-data-grid dt { color: var(--ld-secondary); font-size: .72rem; }
.memo-data-grid dd { margin: 3px 0 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.memo-data-grid dd code { overflow-wrap: anywhere; }
.memo-raw, .memo-ledger { margin-top: 12px; }
.memo-raw summary, .memo-ledger summary {
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--ld-border);
  border-radius: 8px;
  color: var(--ld-primary-strong);
  cursor: pointer;
  font-weight: 700;
}
.memo-raw summary:focus-visible, .memo-ledger summary:focus-visible {
  outline: 3px solid var(--ld-focus);
  outline-offset: 2px;
}
.memo-raw pre {
  max-width: 100%;
  margin: 10px 0 0;
  padding: 12px;
  border: 1px solid var(--ld-border);
  border-radius: 8px;
  background: #0c0a11;
  color: var(--ld-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow-x: auto;
}
.memo-empty { color: var(--ld-secondary); }
.memo-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 18px;
  margin-top: 16px;
  padding: 16px 2px 4px;
  border-top: 1px solid var(--ld-border);
}
.memo-footer p { max-width: 650px; margin-bottom: 0; color: var(--ld-secondary); font-size: .82rem; overflow-wrap: anywhere; }
@media (max-width: 700px) {
  body.memo-page { padding: 14px; }
  .memo-result-head { padding: 17px; }
  .memo-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .memo-section { padding: 14px; }
  .memo-data-grid { grid-template-columns: minmax(0, 1fr); }
  .memo-card-head { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 380px) {
  body.memo-page { padding: 10px; }
  .memo-result-head { flex-direction: column; gap: 12px; }
  .memo-stat-grid { gap: 7px; }
  .memo-stat { padding: 10px; }
}
`;

function modeLabel(memo) {
  return memo.modeLabel ?? (memo.mode === "mock" ? "SIMULATED/OFFLINE" : "REAL");
}

function receiptLabel(receipt, mode) {
  if (mode === "mock") return "SIMULATED receipt";
  if (receipt.paymentStatus === "receipt_valid") return "Escrow receipt validated (epoch settlement pending)";
  return `Unverified response (${receipt.paymentStatus})`;
}

function escapeHtml(value) {
  return String(value ?? "—").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function breakableIdentifier(value) {
  return escapeHtml(value).replaceAll("_", "_<wbr>");
}

function printable(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function pretty(value) {
  return JSON.stringify(value, null, 2) ?? "—";
}

function statusKey(value) {
  return String(value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function statusPill(value, label = value) {
  const key = statusKey(value);
  return `<span class="memo-pill status--${key}">${escapeHtml(label)}</span>`;
}

function dataGrid(items) {
  return `<dl class="memo-data-grid">${items.map(([label, value]) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(printable(value))}</dd></div>`
  ).join("")}</dl>`;
}

function candidateItems(candidate, token) {
  const source = candidate ?? { token };
  return [
    ["Token", source.token ?? token],
    ["Deployer name", source.deployerName],
    ["Treasury name", source.treasuryName],
    ["Sanctions subjects", source.sanctionsSubjects],
    ["Social accounts", source.socialAccounts],
    ["Chain", source.chain],
    ["Block", source.block],
    ["Repository URL", source.repositoryUrl],
  ].filter(([, value]) => value != null && value !== "" && (!Array.isArray(value) || value.length > 0));
}

function evidenceCard([check, evidence]) {
  const sourceReferences = (evidence.sourceReferences ?? []).filter(Boolean);
  return `<article class="memo-card evidence-card">
    <header class="memo-card-head">
      <div class="memo-card-title">${breakableIdentifier(check)}</div>
      ${statusPill(evidence.status)}
    </header>
    <p class="memo-reason">${escapeHtml(evidence.reason)}</p>
    ${sourceReferences.length
      ? `<p class="memo-source"><strong>Source reference(s):</strong> ${escapeHtml(sourceReferences.join(", "))}</p>`
      : `<p class="memo-source"><strong>Source reference(s):</strong> none recorded</p>`}
    ${evidence.results
      ? `<details class="memo-raw"><summary>Normalized result data</summary><pre>${escapeHtml(pretty(evidence.results))}</pre></details>`
      : ""}
  </article>`;
}

function receiptCard(receipt, mode) {
  const fields = [
    ["Display label", receiptLabel(receipt, mode)],
    ["Cost (USD)", receipt.costUsd],
    ["Estimated cost (USD)", receipt.estimatedCostUsd],
    ["Miner ID", receipt.minerId],
    ["Miner name", receipt.minerName],
    ["Duration (ms)", receipt.durationMs],
    ["Signal hash", receipt.signalHash],
    ["Result shape", receipt.resultShape],
    ["Matched Engine intent", receipt.matchedIntent],
    ["Requested input", receipt.requestInput],
    ["Returned input", receipt.returnedInput],
    ["Field status", receipt.fieldStatus],
    ["Evidence status", receipt.evidenceStatus],
    ["Evidence issues", receipt.evidenceIssues],
    ["Proof status", receipt.proofStatus],
    ["Proof gaps", receipt.proofGaps],
    ["Payment status", receipt.paymentStatus],
    ["Authorized amount (micro-USDC)", receipt.authorizedAmountMicro],
    ["Settlement receipt", receipt.settlement],
    ["Timestamp", receipt.timestamp],
  ];
  return `<article class="memo-card receipt-card">
    <header class="memo-card-head">
      <div class="memo-card-title">${breakableIdentifier(receipt.check ?? "unknown check")} · <code>${breakableIdentifier(receipt.intent)}</code></div>
      <div class="memo-pill-row">
        ${statusPill(receipt.evidenceStatus)}
        ${statusPill(receipt.paymentStatus)}
        ${statusPill(receipt.proofStatus)}
      </div>
    </header>
    <details class="memo-receipt-details">
      <summary>Receipt, response and payment details</summary>
      ${dataGrid(fields)}
      ${receipt.rawResponse != null
        ? `<details class="memo-raw"><summary>Raw Engine response (received data; not independently verified)</summary><pre>${escapeHtml(pretty(receipt.rawResponse))}</pre></details>`
        : ""}
    </details>
  </article>`;
}

function failureCard(failure) {
  return `<article class="memo-card failure-card">
    <header class="memo-card-head">
      <div class="memo-card-title">${breakableIdentifier(failure.check ?? "unknown check")} · <code>${breakableIdentifier(failure.intent)}</code></div>
      <div class="memo-pill-row">
        ${statusPill(failure.paymentStatus)}
        ${statusPill(failure.proofStatus)}
      </div>
    </header>
    <p class="memo-reason"><strong>Failure:</strong> ${escapeHtml(failure.error)}</p>
    ${dataGrid([
      ["Request input", failure.requestInput],
      ["Payment required", failure.isPaymentRequired],
      ["Authorized amount (micro-USDC)", failure.authorizedAmountMicro],
      ["Settlement receipt", failure.settlement],
    ])}
  </article>`;
}

function reservationCard(reservation) {
  return `<article class="memo-card">
    ${dataGrid([
      ["Reservation ID", reservation.id],
      ["Request fingerprint", reservation.requestId],
      ["Engine intent", reservation.intent],
      ["Amount (micro-USDC)", reservation.amountMicro],
      ["Reservation status", reservation.status],
    ])}
  </article>`;
}

export function renderHtmlFragment(memo) {
  const evidence = Object.entries(memo.evidence ?? {});
  const validChecks = memo.evidenceCompleteness?.validChecks ?? [];
  const totalChecks = evidence.length;
  const missingChecks = memo.evidenceCompleteness?.missingChecks ?? [];
  const runCounts = memo.runCounts ?? {};
  const receipts = memo.receipts ?? [];
  const failures = memo.failures ?? [];
  const ledger = memo.paymentLedger ?? {};
  const reservations = ledger.reservations ?? [];
  const verdict = memo.verdict ?? "UNKNOWN";
  const verdictClass = verdict === "GO" ? "go" : verdict === "REVIEW" ? "review" : verdict === "NO-GO" ? "no-go" : "unknown";
  const paymentStatus = typeof memo.paymentStatus?.status === "string"
    ? memo.paymentStatus.status
    : printable(memo.paymentStatus);
  const mock = memo.mode === "mock";
  const signals = memo.signals ?? [];

  return `<section class="listings-memo" aria-labelledby="memo-title">
    <header class="memo-result-head">
      <div>
        <p class="memo-eyebrow">02 / Risk memo · ${escapeHtml(modeLabel(memo))}</p>
        <h2 id="memo-title">${escapeHtml(memo.token)}</h2>
        <p class="memo-subline">Evidence completeness: ${escapeHtml(memo.evidenceCompleteness?.status)} · Payment/proof: ${escapeHtml(paymentStatus)}</p>
      </div>
      <span class="memo-verdict status--${verdictClass}" aria-label="Recommendation: ${escapeHtml(verdict)}">${escapeHtml(verdict)}</span>
    </header>
    <div class="memo-mode-note${mock ? "" : " memo-mode-note--real"}" role="note">
      ${mock
        ? `<strong>SIMULATED / OFFLINE.</strong> No Engine calls, payments, or signatures. Actually spent: ${escapeHtml(memo.actualSpentUsd)} USD. Demonstration estimate: ${escapeHtml(memo.estimatedCostUsd)} USD, not spent.`
        : `<strong>REAL mode.</strong> Each response, evidence, proof, and payment status is shown separately. An Engine response or signal hash does not prove answer accuracy or final settlement.`}
    </div>
    <div class="memo-stat-grid" aria-label="Run summary">
      <div class="memo-stat"><span>Responses</span><strong>${escapeHtml(runCounts.responses ?? 0)}</strong><small>${escapeHtml(runCounts.failed ?? 0)} failed · ${escapeHtml(runCounts.unknown ?? 0)} unknown</small></div>
      <div class="memo-stat"><span>Valid evidence checks</span><strong>${escapeHtml(validChecks.length)} / ${escapeHtml(totalChecks)}</strong><small>${escapeHtml(runCounts.validEvidence ?? 0)} valid evidence responses</small></div>
      <div class="memo-stat"><span>${escapeHtml(memo.actualSpendDescription ?? "actual spent")}</span><strong>${escapeHtml(memo.actualSpentUsd)}</strong><small>${escapeHtml(paymentStatus)}</small></div>
      <div class="memo-stat"><span>${escapeHtml(memo.estimateDescription ?? "demonstration estimate; not spent")}</span><strong>${escapeHtml(memo.estimatedCostUsd)}</strong><small>Estimate only</small></div>
    </div>
    <div class="memo-critical">
      <p><strong>Recommendation:</strong> ${escapeHtml(verdict)} · <strong>Evidence:</strong> ${escapeHtml(memo.evidenceCompleteness?.status)}</p>
      <p><strong>Checks not validated:</strong> ${escapeHtml(missingChecks.length ? missingChecks.join(", ") : "none")}</p>
      ${memo.hardBlock ? `<p><strong>Hard block:</strong> confirmed sanctions match.</p>` : ""}
    </div>
    <section class="memo-section" aria-labelledby="candidate-heading">
      <p class="memo-section-label">01 / Candidate</p>
      <h3 id="candidate-heading">Inputs considered</h3>
      ${dataGrid(candidateItems(memo.candidate, memo.token))}
    </section>
    <section class="memo-section" aria-labelledby="findings-heading">
      <p class="memo-section-label">Decision context</p>
      <h3 id="findings-heading">Findings</h3>
      ${signals.length
        ? signals.map(([kind, text]) => `<p class="memo-finding memo-finding--${statusKey(kind)}"><strong>${escapeHtml(String(kind).toUpperCase())}:</strong> ${escapeHtml(text)}</p>`).join("")
        : `<p class="memo-empty">No findings recorded.</p>`}
    </section>
    <section class="memo-section" id="evidence-section" aria-labelledby="evidence-heading">
      <p class="memo-section-label">Evidence</p>
      <h3 id="evidence-heading">Check status and reasons</h3>
      <div class="memo-card-list">${evidence.length ? evidence.map(evidenceCard).join("") : `<p class="memo-empty">No evidence checks recorded.</p>`}</div>
    </section>
    <section class="memo-section" id="receipts-section" aria-labelledby="receipts-heading">
      <p class="memo-section-label">Receipts and responses</p>
      <h3 id="receipts-heading">Response details</h3>
      <div class="memo-card-list">${receipts.length ? receipts.map((receipt) => receiptCard(receipt, memo.mode)).join("") : `<p class="memo-empty">No receipts or responses recorded.</p>`}</div>
    </section>
    <section class="memo-section" aria-labelledby="failures-heading">
      <p class="memo-section-label">Request outcomes</p>
      <h3 id="failures-heading">Failures</h3>
      <div class="memo-card-list">${failures.length ? failures.map(failureCard).join("") : `<p class="memo-empty">No failures recorded.</p>`}</div>
    </section>
    <section class="memo-section" aria-labelledby="ledger-heading">
      <p class="memo-section-label">Payment accounting</p>
      <h3 id="ledger-heading">Authorization ledger</h3>
      ${dataGrid([
        ["Ledger status", paymentStatus],
        ["Payment/proof details", memo.paymentStatus],
        ["Reserved or authorized (micro-USDC)", ledger.reservedOrAuthorizedMicro],
        ["Run cap (micro-USDC)", ledger.maxRunMicro],
        ["Per-intent cap (micro-USDC)", ledger.maxIntentMicro],
        ["Run cap (USD)", memo.caps?.maxUsdPerRun],
        ["Per-intent cap (USD)", memo.caps?.maxUsdPerIntent],
      ])}
      <div class="memo-card-list">${reservations.length ? reservations.map(reservationCard).join("") : `<p class="memo-empty">No payment reservations recorded.</p>`}</div>
    </section>
    <footer class="memo-footer">
      <p><strong>Content checksum:</strong><br><code>${escapeHtml(memo.contentDigest)}</code><br>This is not a digital signature and does not prove answer accuracy. Generated ${escapeHtml(memo.generatedAt)} · ${escapeHtml(memo.wallMs)} ms local wall time.</p>
      <p><strong>Policy:</strong> ${escapeHtml(memo.policyVersion)}<br>Recommendations reflect application policy and supplied evidence; they are not an official Telegraph guarantee or ranking.</p>
    </footer>
  </section>`;
}

export function renderMarkdown(memo) {
  const lines = [
    `# Listing Risk Memo — ${memo.token}`,
    "",
    `**Recommendation: ${memo.verdict}**${memo.hardBlock ? " (confirmed sanctions hard block)" : ""}`,
    "",
    `**Mode:** ${modeLabel(memo)}  `,
    `**Evidence completeness:** ${memo.evidenceCompleteness.status}  `,
    `**Run counts:** ${memo.runCounts.responses} responses · ${memo.runCounts.validEvidence} valid evidence · ${memo.runCounts.failed} failed · ${memo.runCounts.unknown} unknown  `,
    `**Payment/proof status:** ${typeof memo.paymentStatus === "string" ? memo.paymentStatus : JSON.stringify(memo.paymentStatus)}  `,
    `**${memo.actualSpendDescription}:** ${memo.actualSpentUsd} USD  `,
    `**${memo.estimateDescription}:** ${memo.estimatedCostUsd} USD  `,
    `**Policy:** ${memo.policyVersion}  `,
    `**Content checksum:** \`${memo.contentDigest}\` (not a signature)`,
    "",
    "## Findings",
    ...memo.signals.map(([kind, text]) => `- ${kind.toUpperCase()}: ${text}`),
    "",
    "## Evidence status",
    "",
    "| Check | Status | Reason | Source reference(s) |",
    "|---|---|---|---|",
    ...Object.entries(memo.evidence).map(([intent, evidence]) =>
      `| \`${intent}\` | ${evidence.status} | ${evidence.reason.replace(/\|/g, "\\|")} | ${(evidence.sourceReferences ?? []).filter(Boolean).join(", ") || "—"} |`
    ),
    "",
    "## Receipts and responses",
    "",
    "| Check | Engine intent | Label | Cost | Miner | Signal hash |",
    "|---|---|---|---|---|---|",
    ...memo.receipts.map((receipt) =>
      `| \`${receipt.check ?? "unknown"}\` | \`${receipt.intent}\` | ${receiptLabel(receipt, memo.mode)} | ${receipt.costUsd == null ? "unknown" : `$${Number(receipt.costUsd).toFixed(6)}`} | ${receipt.minerName ?? "unknown"} | ${receipt.signalHash ?? "unknown"} |`
    ),
    ...memo.failures.map((failure) =>
      `| \`${failure.check ?? "unknown"}\` | \`${failure.intent}\` | ${failure.paymentStatus} | — | — | ${failure.error.replace(/\|/g, "\\|")} |`
    ),
    "",
    `Generated ${memo.generatedAt}; ${memo.wallMs} ms local wall time.`,
    "",
    "The content checksum covers candidate, policy, evidence, recommendation, signals, receipt/proof metadata, failures, spend labels and caps. It excludes only generatedAt and contentDigest. It is not a digital signature and does not prove answer accuracy.",
  ];
  return lines.join("\n");
}

export function renderHtml(memo) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Listing memo — ${escapeHtml(memo.token)}</title><style>${THEME_TOKENS}${MEMO_CSS}</style></head><body class="memo-page">${renderHtmlFragment(memo)}</body></html>`;
}
