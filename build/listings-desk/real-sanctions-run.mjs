/** First real paid run: sanctions screening with explicit inputs (2 subjects → 2 paid requests). */
import { runDesk } from "./src/desk.mjs";
import { renderMarkdown } from "./src/memo.mjs";
import { writeFileSync } from "node:fs";

const candidate = {
  token: "PEPE",
  // Explicit sanctions-screening inputs — the only check type the desk pays for
  // in this bounded first run (the policy requires explicit subjects; no guessing).
  deployerName: "MaaHin Digital Labs Ltd",
  treasuryName: "Pepe Treasury Holdings SA",
};

const { memo, receipts, failures } = await runDesk(candidate, { mode: "real" });

console.log("=== receipts ===");
for (const r of receipts) {
  console.log(JSON.stringify({
    check: r.check, intent: r.intent, miner: `${r.minerName} (${r.minerId})`,
    costUsd: r.costUsd, latencyMs: r.latencyMs ?? r.durationMs,
    signalHash: r.signalHash, evidenceStatus: r.evidenceStatus,
    paymentStatus: r.paymentStatus, matchedIntent: r.matchedIntent ?? null,
  }, null, 1));
}
console.log("=== failures ===");
for (const f of failures) console.log(JSON.stringify({ check: f.check, error: String(f.error).slice(0, 200) }));
console.log("=== memo verdict ===");
console.log("verdict:", memo.verdict ?? memo.recommendation ?? "n/a");
console.log("actual spend (micro):", String(memo.actualMicro ?? memo.actualSpendMicro ?? "n/a"));
const md = renderMarkdown(memo);
writeFileSync("memos/first-real-run.md", md);
console.log("--- memo markdown head ---");
console.log(md.slice(0, 900));
