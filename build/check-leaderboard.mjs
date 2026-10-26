#!/usr/bin/env node
// Leaderboard check for OUR miners, per Intent — plus the incumbents to beat.
//   node check-leaderboard.mjs
//
// How Telegraph ranking works (no single global board):
//   every Intent has its OWN leaderboard, computed per epoch by validators.
//   Routing pays 70% of traffic to rank #1, 20% to #2, 10% to #3.
//   A miner's first 7 days are the grace period: no leaderboard, 5% of traffic
//   shared equally with other new miners while a track record builds.

const API = "https://devnode.telegraphprotocol.com/api/miners";
const OURS = ["onchain-metric-publicnode", "weather-verify-openmeteo", "fx-now-frankfurter"];
const OUR_INTENTS = ["ONCHAIN_METRIC_VERIFY", "WEATHER_FORECAST", "WEATHER_FORECAST_VERIFY", "FX_NOW"];

const miners = await (await fetch(API, { signal: AbortSignal.timeout(30_000) })).json();

console.log(`network: ${miners.length} miners · pulled ${new Date().toISOString().slice(0, 16)}Z\n`);

// --- our miners ---
for (const slug of OURS) {
  const m = miners.find((x) => x.slug === slug);
  if (!m) { console.log(`❌ ${slug}: not in catalogue (deregistered?)`); continue; }
  const sc = m.scores || [];
  console.log(`${m.activation_status === "active" ? "🟢" : "🔴"} ${slug} (id ${m.id}) · requests served: ${m.total_requests_served || 0}`);
  if (!m.scored || sc.length === 0) {
    console.log(`   ⏳ grace period — not on the leaderboard yet. Scores start from grace traffic; placement appears within ~7 days of registration.\n`);
  } else {
    for (const s of sc) console.log(`   📊 ${s.intent_id} · epoch ${s.epoch_id} · rank ${s.rank} · score ${(+s.score).toFixed(4)}\n`);
  }
}

// --- per-Intent leaderboards (ours marked) ---
for (const intent of OUR_INTENTS) {
  const rows = [];
  for (const m of miners) {
    for (const s of m.scores || []) {
      if (s.intent_id === intent && s.rank != null) rows.push({ slug: m.slug, rank: s.rank, score: s.score, ours: OURS.includes(m.slug) });
    }
  }
  rows.sort((a, b) => a.rank - b.rank);
  console.log(`=== ${intent} — top 5 of ${rows.length} ranked ===`);
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${r.rank}. ${r.ours ? "⭐ OURS: " : ""}${r.slug} — ${(+r.score).toFixed(4)}`);
  }
  const ourRow = rows.find((r) => r.ours);
  if (!ourRow) console.log(`  ⏳ our miner: no rank yet (grace period)\n`);
  else console.log(`  → we are #${ourRow.rank}. #1 gets 70% of routed traffic.\n`);
}

// --- where the demand is: did anyone request our Intents lately? ---
console.log("tips:");
console.log("  browser leaderboard: https://explorer.telegraphprotocol.com/miners and /intents");
console.log("  our miners' pages:   https://explorer.telegraphprotocol.com/miners/<slug>");
