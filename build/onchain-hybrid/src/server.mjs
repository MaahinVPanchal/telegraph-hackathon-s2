// Node entry point (no dependencies): node src/server.mjs  [PORT=8787] [ARCHIVE_RPC_URL=...]
import http from "node:http";
import { handle } from "./core.mjs";

const port = Number(process.env.PORT || 8787);
http.createServer(async (req, res) => {
  if (req.method !== "GET") { res.writeHead(405, { "content-type": "application/json" }); return res.end('{"ok":false,"error":"METHOD_NOT_ALLOWED"}'); }
  const { status, text } = await handle(`http://localhost${req.url}`, process.env);
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(text);
}).listen(port, () => console.log(`onchain-hybrid listening on http://localhost:${port}`));
