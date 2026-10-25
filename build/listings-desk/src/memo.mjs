// Renders the desk's decision as a signed-looking Markdown + HTML memo.
// The last line is always the cost line — the mission's signature output.

export function renderMarkdown(m) {
  const L = [];
  L.push(`# Listing Risk Memo — ${m.token}`);
  L.push("");
  L.push(`**Verdict: ${m.verdict}**${m.hardBlock ? " (hard block: sanctions)" : ""}`);
  L.push("");
  L.push(`Generated ${m.generatedAt} · mode \`${m.mode}\` · verification hash \`${m.verificationHash}\``);
  L.push("");
  L.push("## Findings");
  for (const [kind, text] of m.signals) {
    L.push(`- ${kind === "good" ? "✅" : kind === "bad" ? "❌" : "⚠️"} ${text}`);
  }
  L.push("");
  L.push("## Purchased intelligence");
  L.push("");
  L.push("| Intent | Miner | Cost | Latency | Signal |");
  L.push("|---|---|---|---|---|");
  for (const r of m.receipts) {
    L.push(`| \`${r.intent}\` | ${r.miner} | $${r.costUsd.toFixed(4)} | ${r.durationMs} ms | \`${r.signalHash}\` |`);
  }
  for (const f of m.failures ?? []) L.push(`| \`${f.intent}\` | — | — | — | FAILED: ${f.error.slice(0, 80)} |`);
  L.push("");
  L.push("## How to reproduce");
  L.push("");
  L.push("```bash");
  L.push(`node src/cli.mjs ${m.token} --mode ${m.mode}`);
  L.push("```");
  L.push("Every answer was purchased through the Telegraph Engine; the receipt above lists the");
  L.push("serving miner, the price paid and the signal hash (look it up at `GET /engine/v1/signal/{hash}`).");
  L.push("");
  L.push("---");
  L.push(`**Cost line: ${m.receipts.length} paid request${m.receipts.length === 1 ? "" : "s"}, $${m.totalUsd.toFixed(4)} total, ${m.wallMs} ms wall clock.**`);
  return L.join("\n");
}

export function renderHtml(m) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const badge =
    m.verdict === "GO" ? "#0a7" : m.verdict === "REVIEW" ? "#e90" : "#d33";
  const rows = m.receipts
    .map(
      (r) =>
        `<tr><td><code>${esc(r.intent)}</code></td><td>${esc(r.miner)}</td><td>$${r.costUsd.toFixed(4)}</td><td>${r.durationMs} ms</td><td><code>${esc(r.signalHash)}</code></td></tr>`
    )
    .join("\n");
  const fails = (m.failures ?? [])
    .map((f) => `<tr class="fail"><td><code>${esc(f.intent)}</code></td><td colspan="4">FAILED — ${esc(f.error.slice(0, 120))}</td></tr>`)
    .join("\n");
  const signals = m.signals
    .map(([k, t]) => `<li class="${k}">${esc(t)}</li>`)
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Listing memo — ${esc(m.token)}</title>
<style>
 body{font:15px/1.55 system-ui,Segoe UI,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#122}
 h1{margin:.2rem 0} code{background:#f4f4f6;padding:.1em .35em;border-radius:4px;font-size:.9em}
 .verdict{display:inline-block;color:#fff;background:${badge};padding:.15rem .7rem;border-radius:999px;font-weight:700}
 table{border-collapse:collapse;width:100%;margin:.6rem 0} td,th{border:1px solid #ddd;padding:.35rem .55rem;text-align:left;font-size:.92em}
 li.good{color:#0a7} li.bad{color:#d33} li.warn{color:#b60}
 .costline{margin-top:1.2rem;padding:.7rem 1rem;background:#f0f4ff;border-left:4px solid #36f;font-weight:600}
 .meta{color:#667;font-size:.9em}
</style></head><body>
<h1>Listing Risk Memo — ${esc(m.token)}</h1>
<p><span class="verdict">${esc(m.verdict)}</span> <span class="meta">generated ${esc(m.generatedAt)} · mode ${esc(m.mode)} · hash <code>${esc(m.verificationHash)}</code></span></p>
<h3>Findings</h3><ul>${signals}</ul>
<h3>Purchased intelligence</h3>
<table><tr><th>Intent</th><th>Miner</th><th>Cost</th><th>Latency</th><th>Signal</th></tr>
${rows}${fails}</table>
<p class="meta">Every answer was purchased through the Telegraph Engine; each receipt lists the serving miner, price paid and signal hash. Reproduce with <code>node src/cli.mjs ${esc(m.token)} --mode ${esc(m.mode)}</code>.</p>
<div class="costline">Cost line: ${m.receipts.length} paid request${m.receipts.length === 1 ? "" : "s"}, $${m.totalUsd.toFixed(4)} total, ${m.wallMs} ms wall clock.</div>
</body></html>`;
}
