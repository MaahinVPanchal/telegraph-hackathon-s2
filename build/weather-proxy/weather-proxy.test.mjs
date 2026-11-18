import { test } from "node:test";
import assert from "node:assert/strict";
import { proxyForecast } from "./weather-proxy.js";

const request = (path = "/v1/forecast?latitude=51.5") => new Request(`https://proxy.test${path}`);
const ok = (body = "{\"hourly\":[]}", headers = {}) => new Response(body, { status: 200, headers });
const noWait = { sleep: async () => {} };

test("mocked: GET forwards query and preserves success body/status", async () => {
  let target;
  const response = await proxyForecast(request(), { ...noWait, fetcher: async (url) => { target = url; return ok(); } });
  assert.equal(target, "https://api.open-meteo.com/v1/forecast?latitude=51.5");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"hourly":[]}');
  assert.equal(response.headers.get("x-weather-proxy"), "live");
});

test("mocked: 2xx and 4xx pass through; 429 retries then passes through", async () => {
  const clientError = await proxyForecast(request(), { ...noWait, fetcher: async () => new Response("bad", { status: 400 }) });
  assert.equal(clientError.status, 400); assert.equal(await clientError.text(), "bad");
  let n = 0;
  const rateLimit = await proxyForecast(request(), { ...noWait, fetcher: async () => (++n < 2 ? new Response("slow", { status: 429 }) : new Response("still", { status: 429 })) });
  assert.equal(n, 3); assert.equal(rateLimit.status, 429); assert.equal(await rateLimit.text(), "still");
  const empty = await proxyForecast(request(), { ...noWait, fetcher: async () => new Response(null, { status: 204 }) });
  assert.equal(empty.status, 204); assert.equal(await empty.text(), "");
});

test("mocked: network and 5xx failures retry; exhausted attempts expose details as 502", async () => {
  let n = 0;
  const response = await proxyForecast(request(), { ...noWait, fetcher: async () => { n++; throw new Error("TLS handshake timeout"); } });
  assert.equal(response.status, 502); assert.equal(n, 3);
  assert.equal((await response.json()).detail.length, 3);
  let attempts = 0;
  const retrySuccess = await proxyForecast(request(), { ...noWait, fetcher: async () => (++attempts === 1 ? new Response("bad gateway", { status: 503 }) : ok()) });
  assert.equal(attempts, 2); assert.equal(retrySuccess.status, 200);
});

test("mocked: stalled response body remains bounded by attempt timeout", async () => {
  const response = await proxyForecast(request(), { ...noWait, maxAttempts: 1, attemptTimeoutMs: 10, fetcher: async (_url, init) => {
    const stream = new ReadableStream({ start(controller) { init.signal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError"))); } });
    return new Response(stream);
  } });
  assert.equal(response.status, 502);
});

test("mocked: stale content encoding and length are dropped after body buffering", async () => {
  const response = await proxyForecast(request(), { ...noWait, fetcher: async () => ok("decoded", { "content-encoding": "gzip", "content-length": "999" }) });
  assert.equal(await response.text(), "decoded");
  assert.equal(response.headers.has("content-encoding"), false);
  assert.equal(response.headers.has("content-length"), false);
});

test("mocked: only GET and HEAD on forecast are allowed", async () => {
  let calls = 0;
  for (const [method, path, status] of [["POST", "/v1/forecast", 405], ["GET", "/else", 404]]) {
    const response = await proxyForecast(new Request(`https://proxy.test${path}`, { method }), { fetcher: async () => { calls++; return ok(); } });
    assert.equal(response.status, status);
  }
  assert.equal(calls, 0);
});
