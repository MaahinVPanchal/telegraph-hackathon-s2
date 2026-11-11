#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runDesk } from "./desk.mjs";
import { renderMarkdown, renderHtml } from "./memo.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new TypeError(`--${name} requires a value`);
  }
  return args[index + 1];
};
const valueFlags = new Set(["--mode", "--candidate-json", "--cap", "--per-intent"]);
const positional = args.find((argument, index) =>
  !argument.startsWith("--") && !valueFlags.has(args[index - 1])
);
const mode = flag("mode", "mock");
let candidatePath;
let candidate;
try {
  candidatePath = flag("candidate-json", null);
  candidate = candidatePath
    ? JSON.parse(readFileSync(candidatePath, "utf8"))
    : { token: positional };
} catch (error) {
  console.error(`candidate input could not be read: ${error.message}`);
  process.exit(2);
}
if (candidatePath && (!candidate || typeof candidate !== "object" || Array.isArray(candidate))) {
  console.error("candidate input must be a JSON object");
  process.exit(2);
}
if (positional && candidatePath && !candidate.token) candidate.token = positional;
if (!candidate?.token) {
  console.error("usage: node src/cli.mjs <token> [--mode mock|real] [--candidate-json path] [--cap USD] [--per-intent USD]");
  process.exit(2);
}

const maxUsdPerRun = flag("cap", "0.10");
const maxUsdPerIntent = flag("per-intent", "0.02");
console.error(`listings desk — token ${candidate.token}, mode ${mode}`);
console.error(mode === "mock"
  ? "SIMULATED/OFFLINE demo; no Engine calls, payments or signatures.\n"
  : "REAL mode; only explicitly supplied inputs with supported adapters may be requested.\n");

try {
  const { memo } = await runDesk(candidate, { mode, maxUsdPerRun, maxUsdPerIntent });
  const markdown = renderMarkdown(memo);
  const html = renderHtml(memo);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  mkdirSync("memos", { recursive: true });
  const base = `memos/${candidate.token.replace(/[^a-zA-Z0-9.-]/g, "_")}-${stamp}`;
  writeFileSync(`${base}.md`, markdown);
  writeFileSync(`${base}.html`, html);
  writeFileSync(`${base}.json`, JSON.stringify({ memo }, null, 2));
  console.log(markdown);
  console.error(`\nSaved: ${base}.md | ${base}.html | ${base}.json`);
  console.error(`recommendation: ${memo.verdict} · ${memo.actualSpendDescription} ${memo.actualSpentUsd} USD · estimate ${memo.estimatedCostUsd} USD`);
} catch (error) {
  console.error(`\nrun failed: ${error.message}`);
  process.exit(1);
}
