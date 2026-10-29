// Cloudflare Workers entry point. Same core; ARCHIVE_RPC_URL can be set as a Worker secret.
// console.log lines from core.mjs land in Workers Logs ([observability] in wrangler.toml).
import { handle } from "./core.mjs";

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return new Response('{"ok":false,"error":"METHOD_NOT_ALLOWED"}', { status: 405, headers: { "content-type": "application/json" } });
    const { status, text, reqId } = await handle(request.url, env, { requestId: request.headers.get("cf-ray") || undefined });
    return new Response(text, { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": reqId } });
  },
};
