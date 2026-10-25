#!/usr/bin/env node
/**
 * Validate a miner YAML against Telegraph's registration validator — no wallet needed.
 *
 *   node validate.mjs miners/fx-now-frankfurter.yaml
 *   node validate.mjs miners/fx-now-frankfurter.yaml --api-key YOUR_KEY --miner-address 0xYourWallet
 *
 * Docs: https://docs.telegraphprotocol.com/docs/miners/validation-api
 * The endpoint is the same one https://integrate.telegraphprotocol.com uses.
 */

const ENDPOINT = "https://integrate.telegraphprotocol.com/api/validate";

const args = process.argv.slice(2);
const yamlPath = args.find((a) => !a.startsWith("--"));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!yamlPath) {
  console.error("usage: node validate.mjs <path/to/miner.yaml> [--api-key KEY] [--miner-address 0x...]");
  process.exit(2);
}

const { readFileSync } = await import("node:fs");
let yaml;
try {
  yaml = readFileSync(yamlPath, "utf8");
} catch (e) {
  console.error(`cannot read ${yamlPath}: ${e.message}`);
  process.exit(2);
}

// Offline lint first — catches the mistakes the docs warn about without spending a round-trip.
const lint = [];
for (const field of ["version:", "kind:", "id:", "slug:", "name:", "base_url:"]) {
  if (!yaml.includes(field)) lint.push(`missing required top-level field: ${field}`);
}
if (!/endpoints:/.test(yaml)) lint.push("no endpoints block — registration would be inert");
if (!/supported_intents:/.test(yaml)) lint.push("semantics.supported_intents is empty — nothing declared");
if (/^\s*(input_schema|output_schema):/m.test(yaml) === false) {
  // fine — they are optional, just noting
}
if (/^\s{4,}(input_schema|output_schema):/m.test(yaml)) {
  lint.push("input_schema/output_schema found nested under an endpoint — they are TOP-LEVEL only (registration will be rejected)");
}
if (/type:\s*['"]?chat|rank_answer/.test(yaml)) lint.push("rank_answer modules / signal_mapping type are not accepted");
if (lint.length) {
  console.error("offline lint found problems (fix before validating online):");
  for (const l of lint) console.error("  ✗ " + l);
  process.exit(1);
}
console.log("offline lint: OK");

const body = { yaml };
const apiKey = flag("api-key");
const minerAddress = flag("miner-address");
if (apiKey) body.api_key = apiKey;
if (minerAddress) body.miner_address = minerAddress;

console.log(`POST ${ENDPOINT} (${yamlPath}, ${yaml.length} bytes)...`);
let res;
try {
  res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
} catch (e) {
  console.error(`network error: ${e.message}`);
  console.error("check connectivity; the validator is a plain HTTPS POST, no auth.");
  process.exit(3);
}

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = { raw: text };
}

console.log(`HTTP ${res.status}`);
if (res.ok) {
  const results = data.results || data.endpoints || data.checks;
  if (results) {
    for (const [k, v] of Object.entries(results)) {
      const ok = v && typeof v === "object" ? v.ok ?? v.pass ?? v.valid : v;
      console.log(`  ${ok === true || ok === "pass" ? "✓" : "✗"} ${k}${typeof ok === "string" ? `: ${ok}` : ""}`);
      if (v && typeof v === "object" && v.error) console.log(`      error: ${v.error}`);
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
  if (data.api_key_stored !== undefined) console.log(`api_key_stored: ${data.api_key_stored}`);
  console.log("\nAll green → next step: register (see register.sh).");
} else {
  if (res.status === 404) {
    console.log("The documented public validator endpoint (/api/validate) returned 404 — the developer console");
    console.log("appears to have moved it behind its UI since the docs were written.");
    console.log("Fallback: open https://integrate.telegraphprotocol.com → register flow → paste this YAML.");
    console.log("The UI runs the identical checks (schema + sandbox endpoint test) and reports the same error strings.");
  } else {
    console.log("Validator rejected the YAML. Full response:");
    console.log(JSON.stringify(data, null, 2));
  }
  console.log("\nFix the YAML and re-run. Nothing was spent — this is a free check.");
  process.exit(1);
}
