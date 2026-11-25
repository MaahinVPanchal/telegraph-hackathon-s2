const miner = document.querySelector("#miner");
const intent = document.querySelector("#intent");
const status = document.querySelector("#status");
const history = document.querySelector("#history");
const chart = document.querySelector("#chart");
const table = document.querySelector("#observations");
const source = document.querySelector("#source");
const dayMs = 86400000;
const firstDay = Date.parse("2026-11-01");
// November 12 devnode miner snapshot and docs/ONCHAIN-ARCHIVE-2026-11-13.md.
const archivedScores = {
  "onchain-metric-publicnode": [
    ["ONCHAIN_METRIC_VERIFY_GENERAL", 2072, 39, 0, "2026-11-12T08:16:22Z"],
    ["ONCHAIN_METRIC_VERIFY_GENERAL", 2074, 11, 0.8186, "2026-11-12T14:41:41.758925Z"],
    ["ONCHAIN_METRIC_VERIFY_GENERAL", 2076, 39, 0, "2026-11-12T20:30:24Z"],
  ],
  "weather-verify-openmeteo": [
    ["WEATHER_FORECAST_GENERAL", 2074, 12, 0.8792, "2026-11-12T14:16:56.501384Z"],
    ["WEATHER_FORECAST_VERIFY_GENERAL", 2074, 6, 0.9087, "2026-11-12T15:14:48.014269Z"],
  ],
  "fx-now-frankfurter": [
    ["FX_NOW_CAD", 2074, 4, 1, "2026-11-12T12:47:49.189668Z"],
    ["FX_NOW_EUR", 2074, 7, 0.87, "2026-11-12T12:48:15.333369Z"],
    ["FX_NOW_SEK", 2074, 4, 1, "2026-11-12T12:45:40.380252Z"],
  ],
};
let records = [];
let request;

function render() {
  const daily = new Map();
  for (const row of records) {
    if (row.intent_id !== intent.value) continue;
    const date = new Date(row.scored_at).toISOString().slice(0, 10);
    if (!daily.has(date)) daily.set(date, row);
  }
  const dates = [...daily.keys()].sort();
  history.hidden = dates.length === 0;
  if (!dates.length) {
    status.textContent = "No ranked scores available for this miner.";
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const count = (Date.parse(today) - firstDay) / dayMs + 1;
  const days = Array.from({ length: count }, (_, index) => {
    const date = new Date(firstDay + index * dayMs).toISOString().slice(0, 10);
    return { date, row: daily.get(date) };
  });
  const ranks = [...daily.values()].map(row => row.rank);
  document.querySelector("#latest-rank").textContent = `#${daily.get(dates.at(-1)).rank}`;
  document.querySelector("#best-rank").textContent = `#${Math.min(...ranks)}`;
  document.querySelector("#coverage").textContent = `${dates.length} / ${count}`;
  status.textContent = `2026-11-01 to ${today} · UTC`;
  table.replaceChildren(...days.slice().reverse().map(({ date, row }) => {
    const tr = document.createElement("tr");
    const provenance = row && (row.archived ? "Archive" : "Explorer");
    for (const value of [date, row ? `#${row.rank}` : "No score", row?.score, row?.epoch_id, provenance]) {
      tr.insertCell().textContent = value ?? "—";
    }
    return tr;
  }));

  const width = Math.min(3800, Math.max(document.querySelector("#plot").clientWidth - 2, 64 + count * 20));
  const height = 300;
  const scale = Math.min(devicePixelRatio || 1, 2);
  chart.width = width * scale;
  chart.height = height * scale;
  chart.style.width = `${width}px`;
  chart.style.height = `${height}px`;
  const ctx = chart.getContext("2d");
  ctx.scale(scale, scale);
  ctx.font = "12px system-ui";
  const maxRank = Math.max(1, ...ranks);
  const ticks = new Set([1, Math.ceil(maxRank / 2), maxRank]);
  const x = index => 54 + index * (width - 78) / Math.max(count - 1, 1);
  const y = rank => 24 + (rank - 1) * 226 / Math.max(maxRank - 1, 1);
  for (const rank of ticks) {
    ctx.fillStyle = "#d2c3e2";
    ctx.fillText(`#${rank}`, 9, y(rank) + 4);
    ctx.fillStyle = "#493658";
    ctx.fillRect(44, y(rank), width - 56, 1);
  }
  const labelEvery = Math.ceil(count / Math.max(1, Math.floor((width - 78) / 42)));
  days.forEach(({ date, row }, index) => {
    if (index === count - 1 || (index % labelEvery === 0 && index < count - labelEvery / 2)) {
      ctx.fillStyle = "#d2c3e2";
      ctx.fillText(date.slice(5), x(index) - 15, 281);
    }
    if (!row) return;
    ctx.strokeStyle = ctx.fillStyle = row.archived ? "#f1c681" : "#d5afff";
    ctx.lineWidth = 2;
    const previous = days[index - 1]?.row;
    if (previous) {
      ctx.beginPath();
      ctx.moveTo(x(index - 1), y(previous.rank));
      ctx.lineTo(x(index), y(row.rank));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x(index), y(row.rank), 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

async function load() {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const query = new URLSearchParams({ miner: miner.value });
  source.href = `https://anjoman.ai/api/explorer/scores?${query}`;
  intent.replaceChildren();
  intent.disabled = true;
  history.hidden = true;
  status.textContent = "Loading Anjoman score history…";
  try {
    const response = await fetch(`/api/miner-history?${query}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Score request failed");
    const { scores } = await response.json();
    if (controller.signal.aborted) return;
    const archive = archivedScores[miner.value].map(([intent_id, epoch_id, rank, score, scored_at]) =>
      ({ intent_id, epoch_id, rank, score, scored_at, archived: true }));
    records = [...scores, ...archive]
      .filter(row => Number.isInteger(row.rank) && row.rank > 0 &&
        typeof row.intent_id === "string" && Date.parse(row.scored_at) >= firstDay &&
        Date.parse(row.scored_at) <= Date.now())
      .sort((a, b) => Date.parse(b.scored_at) - Date.parse(a.scored_at) || b.epoch_id - a.epoch_id);
    for (const id of [...new Set(records.map(row => row.intent_id))].sort()) {
      intent.add(new Option(id, id));
    }
    intent.disabled = !intent.options.length;
    render();
  } catch {
    if (!controller.signal.aborted) {
      status.textContent = "Score history is temporarily unavailable. Reload the page to retry.";
    }
  }
}

miner.addEventListener("change", load);
intent.addEventListener("change", render);
load();
