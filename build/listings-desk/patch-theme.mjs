import fs from "node:fs";
const p = "public/leaderlight-live.html";
let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// 1. browser theme color -> midnight
s = s.replace('name="theme-color"', 'name="theme-color"'); // marker check below
{
  const from = /(<meta[^>]*name="theme-color"[^>]*content=")[^"]*(")/;
  if (!from.test(s)) throw new Error("theme-color meta not found");
  s = s.replace(from, "$1#080b10$2");
}

// 2. the midnight design layer — appended LAST in head so it wins the cascade
const overlay = `<style>
/* ── Midnight design layer — appended last so it wins the cascade ── */
:root {
  --ld-page: #080b10;
  --ld-surface: rgba(17, 22, 31, .66);
  --ld-surface-raised: rgba(23, 29, 41, .82);
  --ld-border: rgba(126, 152, 186, .15);
  --ld-primary: #2dd4a8;
  --ld-primary-strong: #5eead4;
  --ld-text: #e9eef6;
  --ld-secondary: #94a2b6;
  --ld-caution: #f5c96b;
  --ld-danger: #fb7185;
  --ld-focus: rgba(94, 234, 212, .5);
  color-scheme: dark;
}
html { background: var(--ld-page); }
body {
  background:
    radial-gradient(ellipse 62% 42% at 88% -6%, rgba(45, 212, 168, .11), transparent),
    radial-gradient(ellipse 52% 38% at -4% 12%, rgba(56, 189, 248, .07), transparent),
    var(--ld-page) !important;
}
/* glass cards */
.panel, .workspace-nav, .leaderboard-panel, .balance-card,
.workspace-panel, .live-grid > .panel {
  background: linear-gradient(160deg, rgba(24, 30, 43, .78), rgba(14, 18, 27, .66)) !important;
  border: 1px solid var(--ld-border) !important;
  border-radius: 18px !important;
  box-shadow: 0 18px 50px rgba(2, 6, 12, .55), inset 0 1px 0 rgba(255, 255, 255, .045) !important;
  backdrop-filter: blur(12px);
}
/* hero */
.hero h1 { letter-spacing: -.045em; }
.hero h1 span {
  background: linear-gradient(92deg, #5eead4 8%, #38bdf8 58%, #7dd3fc 100%);
  -webkit-background-clip: text; background-clip: text;
  color: transparent;
}
.hero::before, .hero-copy { color: var(--ld-secondary); }
/* brand mark */
.leaderlight-mark {
  background: linear-gradient(150deg, #2dd4a8, #14b8a6 55%, #0f9d8f) !important;
  color: #04211a !important;
  border-radius: 10px; clip-path: none !important;
}
.leaderlight-mark span { color: #04211a !important; }
.brand-name { letter-spacing: .16em; }
/* tabs */
.workspace-tab {
  border-radius: 12px !important;
  transition: background .15s, border-color .15s, color .15s, box-shadow .15s;
}
.workspace-tab.is-active {
  background: linear-gradient(120deg, rgba(45, 212, 168, .16), rgba(56, 189, 248, .06)) !important;
  border-color: rgba(94, 234, 212, .4) !important;
  color: var(--ld-primary-strong) !important;
  box-shadow: 0 0 24px rgba(45, 212, 168, .12), inset 0 1px 0 rgba(255, 255, 255, .05);
}
/* buttons */
.primary-action {
  background: linear-gradient(135deg, #34d399, #14b8a6 60%, #0ea5a4) !important;
  color: #04211a !important;
  box-shadow: 0 10px 30px rgba(20, 184, 166, .22);
}
.primary-action:hover:not(:disabled) {
  background: linear-gradient(135deg, #5eead4, #2dd4a8 60%, #14b8a6) !important;
  box-shadow: 0 14px 40px rgba(20, 184, 166, .3);
}
.action-button {
  border-radius: 10px !important;
  transition: border-color .15s, background .15s, transform .15s;
}
.action-button:hover:not(:disabled) {
  border-color: rgba(94, 234, 212, .45) !important;
  background: rgba(45, 212, 168, .08) !important;
}
/* chips */
.chip {
  background: linear-gradient(120deg, rgba(45, 212, 168, .10), rgba(56, 189, 248, .05)) !important;
  border-color: rgba(94, 234, 212, .22) !important;
  color: #bfe9de !important;
}
/* badge */
.mode-badge--live { border-color: rgba(94, 234, 212, .55) !important; color: #5eead4 !important; }
.mode-badge--live::before { background: #5eead4 !important; }
/* balance card numerals */
.balance-card strong { font-variant-numeric: tabular-nums; }
/* focus */
:focus-visible { outline-color: var(--ld-focus) !important; }
/* footer + secondary text */
.app-footer, .rail-footer, .wallet-status { color: #8b99ad !important; }
</style>
`;
const headClose = s.indexOf("</head>");
if (headClose === -1) throw new Error("</head> not found");
s = s.slice(0, headClose) + overlay + s.slice(headClose);

fs.writeFileSync(p, s);
console.log("midnight layer inserted; theme color set");
