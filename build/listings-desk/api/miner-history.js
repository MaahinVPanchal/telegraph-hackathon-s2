const miners = new Set(["onchain-metric-publicnode", "weather-verify-openmeteo", "fx-now-frankfurter"]);
const pageSize = 100;

export default async function handler(req, res) {
  const slug = new URL(req.url, "http://localhost").searchParams.get("miner");
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET" }).end();
    return;
  }
  if (!miners.has(slug)) {
    res.writeHead(400).end();
    return;
  }

  try {
    const scores = [];
    const signal = AbortSignal.timeout(12000);
    let offset = 0;
    let total;
    do {
      const query = new URLSearchParams({ miner: slug, limit: pageSize, offset });
      const upstream = await fetch(`https://anjoman.ai/api/explorer/scores?${query}`, { signal });
      if (!upstream.ok) throw new Error("Score history unavailable");
      const page = await upstream.json();
      if (!Array.isArray(page.scores) || page.offset !== offset ||
          !Number.isSafeInteger(page.total) || page.total < 0 || page.total > 10000 ||
          (!page.scores.length && offset < page.total)) {
        throw new Error("Incomplete score history");
      }
      total = page.total;
      for (const { miner_slug, intent_id, epoch_id, rank, score, scored_at, failure_reason } of page.scores) {
        if (miner_slug !== slug) throw new Error("Unexpected miner");
        scores.push({ intent_id, epoch_id, rank, score, scored_at, failure_reason });
      }
      offset += page.scores.length;
    } while (offset < total);

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    }).end(JSON.stringify({ scores }));
  } catch {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" })
      .end(JSON.stringify({ error: "Anjoman score history is temporarily unavailable." }));
  }
}
