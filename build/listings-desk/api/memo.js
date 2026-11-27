import { parsePreviewScenario, runPreviewMemo } from "../src/preview-scenarios.mjs";
// renderHtml: /memo is a standalone page in the visitor's browser. A bare
// section fragment has no document, stylesheet or theme and renders unreadably
// (transparent surfaces, unstyled black text).
import { renderHtml } from "../src/memo.mjs";

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

  // Absent or empty scenario falls back to the default (1). Anything that is
  // not an integer from 1 to 5 is rejected instead of silently coerced.
  const scenario = parsePreviewScenario(url.searchParams.get("scenario"));
  if (scenario === null) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(400).end(JSON.stringify({ error: "scenario must be an integer from 1 to 5" }));
    return;
  }

  try {
    const { memo } = await runPreviewMemo(scenario, token);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).end(renderHtml(memo));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(502).end(JSON.stringify({ error: message.slice(0, 400) }));
  }
}
