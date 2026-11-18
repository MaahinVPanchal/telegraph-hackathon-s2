# Open-Meteo weather proxy (local preparation only)

This worker allows only `GET` and `HEAD` on `/v1/forecast`, forwards the query string, and makes up to three bounded attempts. Network failures, 5xx, and 429 are retried; 429 matters because Cloudflare egress may be shared and rate limited. Other 4xx and 2xx responses preserve their status and body. The worker removes `content-encoding` and `content-length` because Workers may transparently decode upstream bodies and those headers could then describe the wrong bytes. No cache is used. Exhausted attempts return a 502 with per-attempt details; stale forecasts could alter forecast/verify scoring.

The per-attempt timeout (6 seconds), attempt count (3), and 400 ms linear backoff are code defaults. The total worst case is about 19 seconds. I could not find a published Engine deadline in the checked project docs; it remains unknown, so these values are configurable in `proxyForecast` dependencies and must be checked against Engine behavior before use.

All local tests are **mocked**. They do not prove Cloudflare, Open-Meteo, or Engine behavior. No worker URL exists yet. Do not place the placeholder below in an active manifest.

## Maahin: deploy and check after approval

From this worker folder, copy these commands to deploy when ready:

```sh
npx wrangler deploy
curl -i "<WORKER_URL>/v1/forecast?latitude=51.5&longitude=-0.12&hourly=temperature_2m&forecast_days=2"
curl -i "<WORKER_URL>/another-path"
```

The forecast check should return 200, `x-weather-proxy: live`, and Open-Meteo JSON. The other path should return 404. Instinct should check the real URL after Maahin deploys it. Only then should Maahin approve the YAML edit, commit, free validation, and wallet-signed miner update.

## Candidate manifest patch

Only after the real worker URL has been checked, change this one line in the YAML repository:

```diff
-base_url: https://api.open-meteo.com
+base_url: <WORKER_URL>
```

Do not compute the registration hash until GitHub serves the approved exact bytes with LF line endings.
