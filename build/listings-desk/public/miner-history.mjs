const miner = document.querySelector("#miner");
const intent = document.querySelector("#intent");
const status = document.querySelector("#status");
const history = document.querySelector("#history");
const chart = document.querySelector("#chart");
const table = document.querySelector("#observations");
const source = document.querySelector("#source");
const dayMs = 86400000;
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

  const first = Date.parse(dates[0]);
  const count = (Date.parse(dates.at(-1)) - first) / dayMs + 1;
  const days = Array.from({ length: count }, (_, index) => {
    const date = new Date(first + index * dayMs).toISOString().slice(0, 10);
    return { date, row: daily.get(date) };
  });
  status.textContent = `${dates[0]} to ${dates.at(-1)} · ${dates.length} scored days`;
  table.replaceChildren(...days.slice().reverse().map(({ date, row }) => {
    const tr = document.createElement("tr");
    for (const value of [date, row ? `#${row.rank}` : "No score", row?.score, row?.epoch_id]) {
      tr.insertCell().textContent = value ?? "—";
    }
    return tr;
  }));

  const width = Math.min(3800, Math.max(320, 64 + count * 42));
  const height = 260;
  const scale = Math.min(devicePixelRatio || 1, 2);
  chart.width = width * scale;
  chart.height = height * scale;
  chart.style.width = `${width}px`;
  chart.style.height = `${height}px`;
  const ctx = chart.getContext("2d");
  ctx.scale(scale, scale);
  ctx.font = "12px system-ui";
  const maxRank = Math.max(1, ...[...daily.values()].map(row => row.rank));
  const ticks = new Set([1, Math.ceil(maxRank / 2), maxRank]);
  const x = index => 54 + index * (width - 78) / Math.max(count - 1, 1);
  const y = rank => 24 + (rank - 1) * 194 / Math.max(maxRank - 1, 1);
  for (const rank of ticks) {
    ctx.fillStyle = "#d2c3e2";
    ctx.fillText(`#${rank}`, 9, y(rank) + 4);
    ctx.fillStyle = "#493658";
    ctx.fillRect(44, y(rank), width - 56, 1);
  }
  const labelEvery = Math.ceil(count / Math.max(1, Math.floor((width - 78) / 42)));
  days.forEach(({ date, row }, index) => {
    if (index % labelEvery === 0) {
      ctx.fillStyle = "#d2c3e2";
      ctx.fillText(date.slice(5), x(index) - 15, 244);
    }
    if (!row) return;
    ctx.strokeStyle = ctx.fillStyle = "#d5afff";
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
    records = scores
      .filter(row => Number.isInteger(row.rank) && row.rank > 0 &&
        typeof row.intent_id === "string" && Number.isFinite(Date.parse(row.scored_at)))
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
