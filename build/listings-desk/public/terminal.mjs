import { archivedMinerScores, trackedMiners } from "./miner-score-archive.mjs";

const byId = (id) => document.getElementById(id);
const report = byId("out");
const badge = byId("mode-badge");
const pipeline = byId("pipeline");

function updatePresentation() {
  const live = byId("live-tab").getAttribute("aria-selected") === "true";
  const wallet = window.__listingsWallet;
  const sepolia = live && Boolean(wallet?.address) && String(wallet.chainId).toLowerCase() === "0xaa36a7";
  badge.classList.toggle("mode-badge--live", sepolia);
  badge.textContent = live ? (sepolia ? "SEPOLIA CONNECTED" : "SEPOLIA · NOT READY") : "SIMULATED / OFFLINE";
  byId("hero-connect").hidden = Boolean(wallet?.address);

  const visible = !report.hidden;
  const stage = visible ? report.dataset.stage : "";
  pipeline.dataset.step = { retrieve: "2", assess: "3", receipt: "4" }[stage] ?? "";
  pipeline.dataset.busy = String(visible && report.getAttribute("aria-busy") === "true");
  for (const [index, step] of [...pipeline.querySelectorAll("li")].entries()) {
    if (String(index + 1) === pipeline.dataset.step) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  }

  const gauge = byId("overview-gauge");
  gauge.hidden = live;
  gauge.parentElement.style.gridTemplateColumns = live ? "1fr" : "";
  for (const metric of document.querySelectorAll("[data-overview-offline]")) metric.hidden = live;

  const counts = visible ? report.querySelector(live
    ? "[data-completed-checks][data-valid-checks][data-expected-checks]"
    : "[data-evidence-count][data-check-count]") : null;
  byId("overview-evidence").textContent = (live ? counts?.dataset.validChecks : counts?.dataset.evidenceCount) ?? "—";
  byId("overview-coverage").textContent = counts
    ? (live ? counts.dataset.completedChecks + " / " + counts.dataset.expectedChecks : counts.textContent)
    : "—";
  byId("overview-source").textContent = live
    ? (counts ? "Live sanctions checks completed · Ethereum Sepolia" : "Run a live sanctions assessment to see check coverage.")
    : (counts ? "Simulated memo · Risk index, signal and uncertainty unavailable."
      : "Risk index, signal and uncertainty unavailable.");
}
window.addEventListener("listings:mode", () => queueMicrotask(updatePresentation));
window.addEventListener("listings:wallet", updatePresentation);
new MutationObserver(updatePresentation).observe(report, { attributes: true, attributeFilter: ["aria-busy", "hidden", "data-stage"], childList: true });
updatePresentation();

const command = byId("command-dialog");
const query = byId("command-query");
const commandLinks = [...byId("command-results").querySelectorAll("a")];
const notification = byId("notification-dialog");
const demo = byId("demo-dialog");
const dialogs = [command, notification, demo];

function filterCommands() {
  const text = query.value.trim().toLowerCase();
  for (const link of commandLinks) link.hidden = !link.textContent.toLowerCase().includes(text);
  byId("command-empty").hidden = commandLinks.some((link) => !link.hidden);
}
function openCommand() {
  if (document.querySelector("dialog[open]")) return;
  query.value = "";
  filterCommands();
  command.showModal();
}
byId("open-command").addEventListener("click", openCommand);
byId("open-command").querySelector("kbd").textContent = /Mac/.test(navigator.platform) ? "⌘ K" : "Ctrl K";
query.addEventListener("input", filterCommands);
command.addEventListener("keydown", (event) => {
  const links = commandLinks.filter((link) => !link.hidden);
  if (!links.length) return;
  const index = links.indexOf(document.activeElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const target = index === -1 && event.key === "ArrowUp" ? links.at(-1) :
      links[(index + links.length + (event.key === "ArrowDown" ? 1 : -1)) % links.length];
    target.focus();
  }
  if (event.key === "Enter" && document.activeElement === query) {
    event.preventDefault();
    links[0].click();
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !document.querySelector("dialog[open]")) {
    event.preventDefault();
    openCommand();
  }
});
byId("open-demo").addEventListener("click", () => demo.showModal());
byId("hero-connect").addEventListener("click", () => byId("wallet-connect").click());
byId("open-notifications").addEventListener("click", () => {
  byId("desk-notification").textContent = byId("wallet-status").textContent;
  notification.showModal();
});

const focusTargets = new Map([
  ["#candidate-form", "token"], ["#live-assessment", "deployer-name"], ["#out", "out"],
]);
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const dialog = link.closest("dialog");
  if (dialogs.includes(dialog)) dialog.close();
  const hash = link.getAttribute("href");
  const focusId = focusTargets.get(hash);
  if (!focusId) return;
  event.preventDefault();
  if (hash === "#candidate-form") byId("offline-tab").click();
  if (hash === "#live-assessment") byId("live-tab").click();
  if (hash === "#out" && report.hidden && report.dataset.resultMode) {
    byId(report.dataset.resultMode + "-tab").click();
  }
  if (location.hash !== hash) history.pushState(null, "", hash);
  const target = byId(focusId);
  if (target === report) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start" });
});
if (location.hash === "#live-assessment") byId("live-tab").click();

const nodes = [...document.querySelectorAll(".engine-node")];
for (const node of nodes) {
  node.addEventListener("click", () => {
    const selected = node.getAttribute("aria-pressed") !== "true";
    for (const item of nodes) item.setAttribute("aria-pressed", String(selected && item === node));
    byId("route-detail").textContent = selected ? node.dataset.route : "Telegraph routing diagram";
  });
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

async function loadMiner(slug) {
  const response = await fetch("/api/miner-history?" + new URLSearchParams({ miner: slug }), { cache: "no-store", signal: AbortSignal.timeout(14000) });
  if (!response.ok) throw new Error("Score history unavailable");
  const { scores } = await response.json();
  return scores;
}

function orderedScores(scores, slug) {
  return scores.filter((score) =>
    typeof score.intent_id === "string" && Number.isFinite(Date.parse(score.scored_at))
  ).map((score) => ({ ...score, slug, timestamp: Date.parse(score.scored_at) }))
    .sort((first, second) => second.timestamp - first.timestamp);
}

function scoreRow(score, ranking) {
  const row = document.createElement("li");
  const icon = document.createElement("span");
  icon.className = ranking ? "row-mark place-" + score.rank : "row-mark";
  icon.textContent = ranking ? "#" + score.rank : "⬡";
  if (!ranking) icon.setAttribute("aria-hidden", "true");

  const label = document.createElement("div");
  const link = document.createElement("a");
  link.href = "/miner-history.html?" + new URLSearchParams({ miner: score.slug, intent: score.intent_id });
  link.textContent = score.slug;
  const detail = document.createElement("small");
  detail.textContent = ranking ? score.intent_id + " · Epoch " + score.epoch_id : score.intent_id;
  if (score.archived) detail.textContent = "Archive \u00b7 " + detail.textContent;
  detail.title = detail.textContent;
  label.append(link, detail);

  const value = document.createElement(ranking ? "span" : "time");
  if (ranking) {
    value.className = "rank-data";
    value.textContent = Number.isFinite(score.score) ? score.score.toFixed(3) : "—";
  } else {
    value.dateTime = new Date(score.timestamp).toISOString();
    value.textContent = dateFormat.format(score.timestamp);
    value.title = value.dateTime;
  }
  row.append(icon, label, value);
  return row;
}

function renderScores(list, rows, ranking, partial) {
  list.setAttribute("aria-busy", "false");
  const items = rows.map((row) => scoreRow(row, ranking));
  if (!items.length) {
    const empty = document.createElement("li");
    empty.textContent = partial ? "Score history is currently unavailable." : "No recorded scores.";
    items.push(empty);
  } else if (partial) {
    const notice = document.createElement("li");
    notice.className = "partial-scores";
    notice.textContent = "Some Explorer history is unavailable.";
    items.push(notice);
  }
  list.replaceChildren(...items);
}

const histories = await Promise.allSettled(trackedMiners.map(loadMiner));
const available = histories.map((history, index) => {
  const slug = trackedMiners[index];
  const archive = archivedMinerScores(slug);
  if (history.status === "rejected") return orderedScores(archive, slug);
  const keys = new Set(history.value.map((score) => score.intent_id + ":" + score.epoch_id));
  return orderedScores([...history.value, ...archive.filter((score) => !keys.has(score.intent_id + ":" + score.epoch_id))], slug);
});
const partial = histories.some((history) => history.status === "rejected");
const activity = available.flat().sort((first, second) => second.timestamp - first.timestamp).slice(0, 3);
const ranked = available.flatMap((history) => {
  const latestRank = history.find((score) => Number.isInteger(score.rank) && score.rank > 0);
  return latestRank ? [latestRank] : [];
});
renderScores(byId("miner-activity"), activity, false, partial);
renderScores(byId("miner-ranks"), ranked, true, partial);
