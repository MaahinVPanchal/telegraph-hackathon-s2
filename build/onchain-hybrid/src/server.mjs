// Node entry point (no dependencies): node src/server.mjs  [PORT=8787] [ARCHIVE_RPC_URL=...]
import http from "node:http";
import { handle } from "./core.mjs";

const port = Number(process.env.PORT || 8787);
http.createServer(async (req, res) => {
  if (req.method !== "GET") { res.writeHead(405, { "content-type": "application/json" }); return res.end('{"ok":false,"error":"METHOD_NOT_ALLOWED"}'); }
  const { status, text, reqId } = await handle(`http://localhost${req.url}`, process.env, { requestId: req.headers["x-request-id"] });
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": reqId });
  res.end(text);
}).listen(port, () => console.log(JSON.stringify({ ts: new Date().toISOString(), msg: `onchain-hybrid listening on http://localhost:${port}` })));
