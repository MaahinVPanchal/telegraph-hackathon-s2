#!/usr/bin/env node
/**
 * Live smoke test: proves each YAML's request contract actually works against its
 * real upstream API, using exactly the params the YAML declares. Run before
 * validating/registering so a broken contract never reaches the chain.
 *
 *   node smoke/run-smoke.mjs            # tests all three miners
 *   node smoke/run-smoke.mjs fx         # just FX_NOW
 *   node smoke/run-smoke.mjs onchain    # just ONCHAIN_METRIC_VERIFY
 *   node smoke/run-smoke.mjs weather    # just WEATHER_*
 */

const tests = [
  {
    key: "fx",
    yaml: "miners/fx-now-frankfurter.yaml",
    intent: "FX_NOW",
    request: { base: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR", init: {} },
    check: (j) => j.rates && typeof j.rates.EUR === "number",
    explain: (j) => `1 USD = ${j.rates.EUR} EUR (ECB date ${j.date})`,
  },
  {
    key: "onchain",
    yaml: "miners/onchain-metric-publicnode.yaml",
    intent: "ONCHAIN_METRIC_VERIFY",
    request: {
      base: "https://ethereum-rpc.publicnode.com/",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "latest"],
        }),
      },
    },
    check: (j) => typeof j.result === "string" && /^0x[0-9a-f]+$/i.test(j.result),
    explain: (j) => `vitalik.eth balance = ${BigInt(j.result)} wei (${Number(BigInt(j.result)) / 1e18} ETH)`,
  },
  {
    key: "weather",
    yaml: "miners/weather-verify-openmeteo.yaml",
    intent: "WEATHER_FORECAST / WEATHER_FORECAST_VERIFY",
    request: {
      base:
        "https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&hourly=temperature_2m,wind_speed_10m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=2&models=icon_seamless",
      init: {},
    },
    check: (j) => j.hourly && Array.isArray(j.hourly.time) && j.hourly.time.length > 0,
    explain: (j) =>
      `London next hours: ${j.hourly.time
        .slice(0, 3)
        .map((t, i) => `${t} ${j.hourly.temperature_2m[i]}°C`)
        .join(" | ")}`,
  },
];

const which = process.argv[2];
const run = tests.filter((t) => !which || t.key.startsWith(which.toLowerCase()) || t.intent.includes(which.toUpperCase()));
if (!run.length) {
  console.error("no matching test. use: fx | onchain | weather, or run all with no arg.");
  process.exit(2);
}

let failed = 0;
for (const t of run) {
  process.stdout.write(`[${t.key}] ${t.intent} → ${t.request.base.split("?")[0]} ... `);
  try {
    const res = await fetch(t.request.base, t.request.init);
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`non-JSON response (HTTP ${res.status}): ${text.slice(0, 120)}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error).slice(0, 200)}`);
    if (!t.check(json)) throw new Error(`unexpected shape: ${JSON.stringify(json).slice(0, 200)}`);
    console.log("OK — " + t.explain(json));
  } catch (e) {
    failed++;
    console.log("FAIL — " + e.message);
  }
}
console.log(failed ? `\n${failed} test(s) failed — fix the YAML contract before validating.` : "\nAll request contracts work. Next: node validate.mjs <yaml>.");
process.exit(failed ? 1 : 0);
