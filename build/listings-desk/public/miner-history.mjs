import { series, failures } from "./miner-november-2026.mjs";

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

const slugs = [...new Set(series.map(({ slug }) => slug))];
const histories = await Promise.allSettled(slugs.map(async (slug) => {
  const query = new URLSearchParams({ miner: slug });
  const response = await fetch("/api/miner-history?" + query, {
    cache: "no-store", signal: AbortSignal.timeout(14000),
  });
  if (!response.ok) throw new Error("Score history unavailable");
  const { scores } = await response.json();
  if (!Array.isArray(scores) || !scores.length) throw new Error("No Explorer scores");
  return scores;
}));
const scoresByMiner = new Map(slugs.map((slug, index) => [slug, histories[index].value ?? []]));

const ist = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "numeric", day: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const novemberSeries = series.map((entry) => {
  const rows = [...entry.rows];
  const epochs = new Set(rows.filter((row) => row[3]).map((row) => row[2]));
  const scores = scoresByMiner.get(entry.slug).filter((score) =>
    score.intent_id === entry.intent && Number.isFinite(Date.parse(score.scored_at)) &&
    Number.isInteger(score.epoch_id) && score.epoch_id > 0 &&
    Number.isInteger(score.rank) && score.rank > 0 && Number.isFinite(score.score));
  scores.sort((a, b) => Date.parse(a.scored_at) - Date.parse(b.scored_at));
  for (const score of scores) {
    const parts = Object.fromEntries(ist.formatToParts(new Date(score.scored_at)).map(({ type, value }) => [type, value]));
    const day = Number(parts.day);
    if (parts.year !== "2026" || parts.month !== "11" || day < 25 || epochs.has(score.epoch_id)) continue;
    rows.push([day, parts.hour + ":" + parts.minute, score.epoch_id, true, score.rank, score.score, Boolean(score.failure_reason)]);
    epochs.add(score.epoch_id);
  }
  rows.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return { ...entry, rows };
});
const lastDay = Math.max(...novemberSeries.map(({ rows }) => rows.at(-1)[0]));
document.querySelector(".subtitle").textContent = "November 1–" + lastDay + ", 2026 · India Standard Time (IST)";
if (histories.some((history) => history.status === "rejected")) {
  document.querySelector(".subtitle").append(" · Some live Explorer history is unavailable");
}

const summary = document.querySelector("#observations");
const dailySeries = novemberSeries.map(({ rows }) => {
  const days = new Map();
  for (const round of rows) {
    const [day, , , , rank, score, failed] = round;
    days.set(day, { rank, score, failed: failed || days.get(day)?.failed });
  }
  return days;
});

for (let day = 1; day <= lastDay; day++) {
  const row = document.createElement("tr");
  row.append(element("th", "Nov " + day, { scope: "row" }));
  for (const days of dailySeries) {
    const entry = days.get(day);
    const cell = element("td", entry ? `#${entry.rank} · ${entry.score}` : "—");
    if (!entry) cell.setAttribute("aria-label", "No record");
    if (entry?.failed) {
      cell.className = "failed";
      cell.setAttribute("aria-label", cell.textContent + ", at least one failed round");
      cell.title = "At least one failed round";
    }
    row.append(cell);
  }
  summary.append(row);
}

const filters = new URLSearchParams(location.search);
for (const { label, slug, intent, rows } of novemberSeries) {
  const detail = element("details", undefined, { id: intent });
  const header = element("summary", label);
  header.append(element("small", slug));
  detail.append(header);
  document.querySelector("#rounds").append(detail);

  function renderRounds() {
    const last = rows.at(-1);
    const metrics = element("dl", undefined, { class: "metrics" });
    for (const [name, value] of [
      ["Rounds recorded", `${rows.length} (${rows.filter(row => row[6]).length} failed)`],
      ["Best rank", "#" + Math.min(...rows.map(row => row[4]))],
      ["Latest round", `#${last[4]} · ${last[5]} · Nov ${last[0]}, ${last[1]}`],
      ["First record", "Nov " + rows[0][0]],
    ]) {
      const metric = document.createElement("div");
      metric.append(element("dt", name), element("dd", value));
      metrics.append(metric);
    }

    const region = element("div", undefined, {
      class: "table-wrap", role: "region", tabindex: "0", "aria-label": label + " rounds",
    });
    const table = document.createElement("table");
    const headings = table.createTHead().insertRow();
    for (const name of ["Day", "Time (IST)", "Epoch", "Rank", "Score", "Note"]) {
      headings.append(element("th", name, { scope: "col" }));
    }
    const body = table.createTBody();
    for (const [day, time, epoch, renumbered, rank, score, failed] of rows) {
      const row = body.insertRow();
      row.append(element("th", "Nov " + day, { scope: "row" }));
      for (const value of [time, epoch + (renumbered ? "†" : ""), "#" + rank, score, failed ? "Failed" : ""]) {
        row.append(element("td", value));
      }
      if (failed) row.className = "failed";
    }
    region.append(table);
    if (rows.length < 2) {
      detail.append(metrics, region);
      return;
    }
    const values = rows.map((row) => row[5]);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum;
    const chart = element("figure", undefined, { class: "score-chart" });
    const caption = "Recorded scores in round order (" + minimum + " to " + maximum + ")";
    chart.append(element("figcaption", caption));
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", "0 0 300 80");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    for (const y of [8, 40, 72]) {
      const line = document.createElementNS(namespace, "line");
      line.setAttribute("x1", "5");
      line.setAttribute("x2", "295");
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      svg.append(line);
    }
    const trend = document.createElementNS(namespace, "polyline");
    trend.setAttribute("points", values.map((score, index) => {
      const x = 5 + index * 290 / (values.length - 1);
      const y = range ? 72 - (score - minimum) * 64 / range : 40;
      return x + "," + y;
    }).join(" "));
    svg.append(trend);
    chart.append(svg);
    detail.append(metrics, chart, region);
  }

  detail.addEventListener("toggle", () => {
    if (detail.open && !detail.querySelector("table")) renderRounds();
  });
  if (filters.get("miner") === slug && (!filters.has("intent") || filters.get("intent") === intent)) {
    detail.open = true;
  }
}

for (const [title, count, first, excerpt] of failures) {
  const detail = document.createElement("details");
  detail.append(element("summary", `${title} × ${count}`), element("p", first), element("blockquote", excerpt));
  document.querySelector("#failures").append(detail);
}
