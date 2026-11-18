const UPSTREAM = "https://api.open-meteo.com";
const ALLOWED_PATH = "/v1/forecast";
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_BACKOFF_MS = 400;

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

async function oneAttempt(fetcher, url, timeoutMs, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method,
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "telegraph-weather-proxy/1.0" },
    });
    // Consume inside the timeout window so a server that sends headers and stalls
    // the body cannot keep this request alive past its configured attempt budget.
    const bytes = method === "HEAD" ? null : await response.arrayBuffer();
    return { status: response.status, headers: response.headers, bytes };
  } finally {
    clearTimeout(timer);
  }
}

function passThrough(result, attempt, method) {
  const headers = new Headers(result.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set("x-weather-proxy", "live");
  headers.set("x-weather-proxy-attempts", String(attempt));
  const noBodyStatus = [204, 205, 304].includes(result.status);
  return new Response(method === "HEAD" || noBodyStatus ? null : result.bytes, { status: result.status, headers });
}

export async function proxyForecast(request, deps = {}) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED", message: "Only GET and HEAD are supported." }, 405, { allow: "GET, HEAD" });
  }
  if (url.pathname !== ALLOWED_PATH) return json({ ok: false, error: "NOT_FOUND" }, 404);

  const fetcher = deps.fetcher ?? fetch;
  const attempts = deps.maxAttempts ?? DEFAULT_ATTEMPTS;
  const timeoutMs = deps.attemptTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const backoffMs = deps.backoffMs ?? DEFAULT_BACKOFF_MS;
  const target = UPSTREAM + url.pathname + url.search;
  const detail = [];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await oneAttempt(fetcher, target, timeoutMs, request.method);
      if ((result.status === 429 || result.status >= 500) && attempt < attempts) {
        detail.push(`attempt ${attempt}: upstream HTTP ${result.status}`);
        await (deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(backoffMs * attempt);
        continue;
      }
      if (result.status === 429) return passThrough(result, attempt, request.method);
      if (result.status >= 500 || result.status === 429) {
        detail.push(`attempt ${attempt}: upstream HTTP ${result.status}`);
        break;
      }
      return passThrough(result, attempt, request.method);
    } catch (error) {
      detail.push(`attempt ${attempt}: ${error?.name ?? "Error"}: ${error?.message ?? String(error)}`);
      if (attempt < attempts) await (deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(backoffMs * attempt);
    }
  }
  return json({ ok: false, error: "UPSTREAM_UNREACHABLE", attempts: detail.length, detail }, 502, {
    "x-weather-proxy": "error", "x-weather-proxy-attempts": String(detail.length),
  });
}

export default { fetch: (request) => proxyForecast(request) };
