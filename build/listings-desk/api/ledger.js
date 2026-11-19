const BASE = "https://devnode.telegraphprotocol.com/v1/ledger/account/";
const ADDRESS = /^0x[0-9a-f]{40}$/i;

export default async function handler(req, res) {
  const address = String(req.query?.address ?? "");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("method not allowed");
    return;
  }
  if (!ADDRESS.test(address)) {
    res.status(400).end("invalid address");
    return;
  }
  try {
    const upstream = await fetch(BASE + address, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).end("ledger read failed");
  }
}
