// Cloudflare Workers entry point. Same core; ARCHIVE_RPC_URL can be set as a Worker secret.
import { handle } from "./core.mjs";

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return new Response('{"ok":false,"error":"METHOD_NOT_ALLOWED"}', { status: 405, headers: { "content-type": "application/json" } });
    const { status, text } = await handle(request.url, env);
    return new Response(text, { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  },
};
