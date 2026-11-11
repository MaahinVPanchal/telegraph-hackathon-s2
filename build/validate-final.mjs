import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const h = readFileSync("leaderlight-final.html", "utf8");
const blocks = [...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
console.log("script blocks:", blocks.length);

blocks.forEach((block, i) => {
  const tmp = `C:/Users/HP/AppData/Local/Temp/final-chk-${i}.mjs`;
  writeFileSync(tmp, block);
  try {
    execSync(`node --check "${tmp}"`, { stdio: "pipe" });
    console.log(`script ${i}: syntax ✅`);
  } catch (err) {
    console.log(`script ${i}: ❌ ${String(err.stderr).slice(0, 200)}`);
  }
});

// web-app markers
for (const m of ["run-live", "wallet-actions", "mint-usdc", "fund-escrow", "leaderboard-panel", "lb-refresh", "renderLiveMemo", "liveAssessment", "__listingsWallet"]) {
  console.log(m + ":", h.includes(m) ? "✅" : "❌");
}
