import { readFileSync, existsSync } from "node:fs";
const dir = "C:/Users/HP/AppData/Local/Temp/anjch/";
const files = ["1ezqt_idqor-v.js", "1r3crs0mz8sgg.js", "2cyxux9_cgck4.js", "2we3mapnn9k1a.js", "41ngkhizpgebj.js"];
for (const f of files) {
  const p = dir + f;
  if (!existsSync(p)) continue;
  const s = readFileSync(p, "utf8");
  const routes = [...s.matchAll(/"(\/api\/[a-zA-Z0-9/_-]*)"/g)].map((m) => m[1]);
  const interesting = [...new Set(routes)].filter((r) => /yaml|integration|valid|miner|register|earn/i.test(r));
  if (interesting.length) console.log(f, "→", interesting.join(", "));
}
// context around integrations/yamls in the engine chunk
const s = readFileSync(dir + "2cyxux9_cgck4.js", "utf8");
let i = s.indexOf("integrations/yamls");
while (i !== -1) {
  console.log("\n--- context @" + i + " ---");
  console.log(s.slice(Math.max(0, i - 500), i + 500).replace(/\n/g, " ").slice(0, 900));
  i = s.indexOf("integrations/yamls", i + 1);
  if (i > 2000000000) break;
}
// also: any 'validate' route or function with yaml nearby
const vmatches = [...s.matchAll(/.{60}(validateEndpoints|validate[YA]\w*|\/validate)\b.{100}/g)];
console.log("\n--- validate mentions in engine chunk:", vmatches.length);
for (const m of vmatches.slice(0, 5)) console.log("…", m[0].replace(/\n/g, " ").slice(0, 200));
