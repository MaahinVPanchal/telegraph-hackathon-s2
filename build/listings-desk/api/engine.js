// Same-origin proxy for the Engine ask endpoint.
//
// devnode's CORS preflight (OPTIONS) returns 204 without the required
// Access-Control-Allow-* headers, so browsers block direct fetches from the
// deployed page. This handler relays POST /api/engine -> the upstream ask
// endpoint verbatim. It is dumb transport: no keys, no signing, no payment
// logic — the visitor's browser builds and signs the payment envelope, and
// only the X-PAYMENT header is forwarded for the retry.
const UPSTREAM_ASK = "https://devnode.telegraphprotocol.com/engine/v1/ask";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end("method not allowed");
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const headers = { "Content-Type": "application/json" };
  const payment = req.headers["x-payment"];
  if (typeof payment === "string" && payment.length > 0 && payment.length < 16_000) {
    headers["X-PAYMENT"] = payment;
  }

  try {
    const upstream = await fetch(UPSTREAM_ASK, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(120_000),
    });
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
    res.setHeader("Cache-Control", "no-store");
    const settlement = upstream.headers.get("x-payment-response");
    if (settlement) res.setHeader("X-Payment-Response", settlement);
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) res.setHeader("Retry-After", retryAfter);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).end("upstream request failed");
  }
}
