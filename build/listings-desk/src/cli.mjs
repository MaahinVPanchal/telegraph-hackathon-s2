#!/usr/bin/env node
// CLI entry: run the listings desk for one token.
//   node src/cli.mjs <token> [--mode mock|real] [--cap 0.10] [--per-intent 0.02]
// Writes memos/<token>-<timestamp>.md and .html, prints the memo to stdout.

import { mkdirSync, writeFileSync } from "node:fs";
import { runDesk } from "./desk.mjs";
import { renderMarkdown, renderHtml } from "./memo.mjs";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const token = args.find((a) => !a.startsWith("--"));
const mode = flag("mode", "mock");
const maxUsdPerRun = Number(flag("cap", 0.1));
const maxUsdPerIntent = Number(flag("per-intent", 0.02));

if (!token) {
  console.error("usage: node src/cli.mjs <token-symbol-or-address> [--mode mock|real] [--cap USD] [--per-intent USD]");
  process.exit(2);
}

console.error(`listings desk — token ${token}, mode ${mode}, run cap $${maxUsdPerRun.toFixed(2)} (${maxUsdPerIntent.toFixed(2)}/intent)`);
console.error("firing 5 parallel paid requests through Telegraph...\n");

try {
  const { memo, receipts } = await runDesk(token, { mode, maxUsdPerRun, maxUsdPerIntent });

  const md = renderMarkdown(memo);
  const html = renderHtml(memo);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  mkdirSync("memos", { recursive: true });
  const base = `memos/${token.replace(/[^a-zA-Z0-9.-]/g, "_")}-${stamp}`;
  writeFileSync(`${base}.md`, md);
  writeFileSync(`${base}.html`, html);
  writeFileSync(`${base}.json`, JSON.stringify({ memo, receipts }, null, 2));

  console.log(md);
  console.error(`\nsaved: ${base}.md | ${base}.html | ${base}.json`);
  console.error(`verdict: ${memo.verdict} · cost $${memo.totalUsd.toFixed(4)} · hash ${memo.verificationHash}`);
} catch (e) {
  console.error(`\nrun failed: ${e.message}`);
  if (/402/.test(e.message)) {
    console.error(
      "\nReal mode needs a funded wallet (USDC on Base). Two options:\n" +
        "  1. Exercise the full pipeline risk-free: node src/cli.mjs <token> --mode mock\n" +
        "  2. Fund the desk, then retry — see README.md, section 'Going real'."
    );
  }
  process.exit(1);
}
