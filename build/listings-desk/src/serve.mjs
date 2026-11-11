#!/usr/bin/env node
// Minimal local web UI for the listings desk — no dependencies.
//   node src/serve.mjs     → http://localhost:7788
// Type a token, hit Run, get the rendered memo. Token-only runs cannot resolve other identities.

import { createServer } from "node:http";
import { runDesk } from "./desk.mjs";
import { renderHtml } from "./memo.mjs";

const PORT = Number(process.env.PORT ?? 7788);
const MODE = process.env.DESK_MODE ?? "mock";

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Listings Desk</title>
<style>
 body{font:15px/1.55 system-ui,Segoe UI,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#122;background:#fafbfc}
 input{font-size:1rem;padding:.45rem .6rem;border:1px solid #ccd;border-radius:6px;width:22rem}
 button{font-size:1rem;padding:.45rem 1.1rem;border:0;border-radius:6px;background:#2456f0;color:#fff;cursor:pointer}
 button:disabled{opacity:.5}
 .meta{color:#667;font-size:.9em}
 #out{margin-top:1.2rem}
</style></head><body>
<h1> Telegraph Listings Desk <span class="meta">· ${MODE === "mock" ? "SIMULATED/OFFLINE" : "REAL"}</span></h1>
<p class="meta">Token-only assessment. The listing policy requires explicit entity and account inputs; unsupported or missing evidence cannot produce GO. ${
  MODE === "mock" ? "<b>SIMULATED / OFFLINE</b> — no Engine requests, payments or signatures." : "<b>REAL</b> mode — only supported checks with explicit inputs can request payment."
}</p>
<form id="f"><input id="token" placeholder="token symbol or 0x address" required> <button>Run desk</button></form>
<div id="out"></div>
<script>
const f=document.getElementById('f'),out=document.getElementById('out'),btn=f.querySelector('button');
f.onsubmit=async e=>{
  e.preventDefault();btn.disabled=true;out.innerHTML='<p class="meta">${MODE === "mock" ? "Rendering offline simulation…" : "Checking explicit inputs and supported adapters…"}</p>';
  try{
    const r=await fetch('/memo?token='+encodeURIComponent(document.getElementById('token').value));
    if(!r.ok) throw new Error((await r.json()).error||('HTTP '+r.status));
    const html=await r.text();
    out.innerHTML='<hr>'+html;
  }catch(err){out.innerHTML='<p style="color:#c33">Failed: '+err.message+'</p>';}
  btn.disabled=false;
};
</script></body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }
  if (url.pathname === "/memo") {
    const token = url.searchParams.get("token")?.trim();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!token || token.length > 120) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "missing or bad token" }));
      return;
    }
    try {
      const { memo } = await runDesk(token, { mode: MODE });
      res.end(renderHtml(memo));
    } catch (e) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: String(e.message).slice(0, 400) }));
    }
    return;
  }
  res.statusCode = 404;
  res.end("not found");
}).listen(PORT, () => {
  console.log(`listings desk on http://localhost:${PORT} (mode: ${MODE})`);
  console.log(MODE === "mock" ? "SIMULATED/OFFLINE mode: no Engine calls, payments or signatures." : "REAL mode: token-only requests remain blocked where required inputs are absent.");
});
