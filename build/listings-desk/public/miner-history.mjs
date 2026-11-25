import { series, failures } from "./miner-november-2026.mjs";

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

const summary = document.querySelector("#observations");
const dailySeries = series.map(({ rows }) => {
  const days = new Map();
  for (const round of rows) {
    const [day, , , , rank, score, failed] = round;
    days.set(day, { rank, score, failed: failed || days.get(day)?.failed });
  }
  return days;
});

for (let day = 1; day <= 25; day++) {
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
for (const { label, slug, intent, rows } of series) {
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
    detail.append(metrics, region);
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
