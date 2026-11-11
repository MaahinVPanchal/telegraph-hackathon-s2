function modeLabel(memo) {
  return memo.modeLabel ?? (memo.mode === "mock" ? "SIMULATED/OFFLINE" : "REAL");
}

function receiptLabel(receipt, mode) {
  if (mode === "mock") return "SIMULATED receipt";
  if (receipt.paymentStatus === "receipt_valid") return "Escrow receipt validated (epoch settlement pending)";
  return `Unverified response (${receipt.paymentStatus})`;
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
    "| Intent | Label | Cost | Miner | Signal hash |",
    "|---|---|---|---|---|",
    ...memo.receipts.map((receipt) =>
      `| \`${receipt.intent}\` | ${receiptLabel(receipt, memo.mode)} | ${receipt.costUsd == null ? "unknown" : `$${Number(receipt.costUsd).toFixed(6)}`} | ${receipt.minerName ?? "unknown"} | ${receipt.signalHash ?? "unknown"} |`
    ),
    ...memo.failures.map((failure) =>
      `| \`${failure.intent}\` | ${failure.paymentStatus} | — | — | ${failure.error.replace(/\|/g, "\\|")} |`
    ),
    "",
    `Generated ${memo.generatedAt}; ${memo.wallMs} ms local wall time.`,
    "",
    "The content checksum covers candidate, policy, evidence, recommendation, signals, receipt/proof metadata, failures, spend labels and caps. It excludes only generatedAt and contentDigest. It is not a digital signature and does not prove answer accuracy.",
  ];
  return lines.join("\n");
}

export function renderHtml(memo) {
  const escape = (value) => String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[character]));
  const badge = memo.verdict === "GO" ? "#087" : memo.verdict === "REVIEW" ? "#d80" : "#b33";
  const evidenceRows = Object.entries(memo.evidence).map(([intent, item]) =>
    `<tr><td><code>${escape(intent)}</code></td><td>${escape(item.status)}</td><td>${escape(item.reason)}</td><td>${escape((item.sourceReferences ?? []).filter(Boolean).join(", ") || "—")}</td></tr>`
  ).join("");
  const receiptRows = memo.receipts.map((receipt) =>
    `<tr><td><code>${escape(receipt.intent)}</code></td><td>${escape(receiptLabel(receipt, memo.mode))}</td><td>${receipt.costUsd == null ? "unknown" : `$${Number(receipt.costUsd).toFixed(6)}`}</td><td>${escape(receipt.minerName ?? "unknown")}</td><td><code>${escape(receipt.signalHash ?? "unknown")}</code></td></tr>`
  ).join("");
  const failureRows = memo.failures.map((failure) =>
    `<tr class="warn"><td><code>${escape(failure.intent)}</code></td><td>${escape(failure.paymentStatus)}</td><td colspan="3">${escape(failure.error)}</td></tr>`
  ).join("");
  const signals = memo.signals.map(([kind, text]) => `<li class="${escape(kind)}">${escape(text)}</li>`).join("");
  const paymentStatus = typeof memo.paymentStatus === "string" ? memo.paymentStatus : JSON.stringify(memo.paymentStatus);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Listing memo — ${escape(memo.token)}</title>
<style>
body{font:15px/1.55 system-ui,Segoe UI,sans-serif;max-width:980px;margin:2rem auto;padding:0 1rem;color:#122}
code{background:#f4f4f6;padding:.1em .35em;border-radius:4px;font-size:.9em}
table{border-collapse:collapse;width:100%;margin:.6rem 0}td,th{border:1px solid #ddd;padding:.35rem .55rem;text-align:left;font-size:.9em}
li.bad{color:#b33}li.warn{color:#a60}li.good{color:#087}.meta{color:#667}.summary{padding:.8rem;background:#f2f5fb;border-left:4px solid #36f}
</style></head><body>
<h1>Listing Risk Memo — ${escape(memo.token)}</h1>
<p><strong style="color:${badge}">Recommendation: ${escape(memo.verdict)}</strong></p>
<div class="summary"><b>Mode:</b> ${modeLabel(memo)} · <b>Evidence:</b> ${escape(memo.evidenceCompleteness.status)} · <b>Payment/proof:</b> ${escape(paymentStatus)}<br>
<b>Run counts:</b> ${memo.runCounts.responses} responses · ${memo.runCounts.validEvidence} valid evidence · ${memo.runCounts.failed} failed · ${memo.runCounts.unknown} unknown<br>
<b>${escape(memo.actualSpendDescription)}:</b> ${escape(memo.actualSpentUsd)} USD · <b>${escape(memo.estimateDescription)}:</b> ${escape(memo.estimatedCostUsd)} USD<br>
<b>Content checksum:</b> <code>${escape(memo.contentDigest)}</code> (not a signature)</div>
<h2>Findings</h2><ul>${signals}</ul>
<h2>Evidence status</h2><table><tr><th>Check</th><th>Status</th><th>Reason</th><th>Source reference(s)</th></tr>${evidenceRows}</table>
<h2>Receipts and responses</h2><table><tr><th>Intent</th><th>Label</th><th>Cost</th><th>Miner</th><th>Signal hash</th></tr>${receiptRows}${failureRows}</table>
<p class="meta">Generated ${escape(memo.generatedAt)} · ${memo.wallMs} ms local wall time. The checksum excludes only generatedAt and contentDigest; it is not a digital signature or proof of answer accuracy.</p>
</body></html>`;
}
