import { runDesk } from "../src/desk.mjs";
import { renderHtmlFragment } from "../src/memo.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("method not allowed");
    return;
  }

  const url = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);
  const token = url.searchParams.get("token")?.trim();
  if (!token || token.length > 120) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(400).end(JSON.stringify({ error: "missing or bad token" }));
    return;
  }

  try {
    const { memo } = await runDesk(token, { mode: "mock" });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).end(renderHtmlFragment(memo));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(502).end(JSON.stringify({ error: message.slice(0, 400) }));
  }
}
