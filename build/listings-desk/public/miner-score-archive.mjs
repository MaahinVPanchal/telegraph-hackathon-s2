// November 12 devnode miner snapshot and docs/ONCHAIN-ARCHIVE-2026-11-13.md.
const archivedScores = {
  "onchain-metric-publicnode": [
    ["ONCHAIN_METRIC_VERIFY_GENERAL", 2072, 39, 0, "2026-11-12T08:16:22Z"],
    ["ONCHAIN_METRIC_VERIFY_GENERAL", 2074, 11, 0.8186, "2026-11-12T14:41:41.758925Z"],
    ["ONCHAIN_METRIC_VERIFY_GENERAL", 2076, 39, 0, "2026-11-12T20:30:24Z"],
  ],
  "weather-verify-openmeteo": [
    ["WEATHER_FORECAST_GENERAL", 2074, 12, 0.8792, "2026-11-12T14:16:56.501384Z"],
    ["WEATHER_FORECAST_VERIFY_GENERAL", 2074, 6, 0.9087, "2026-11-12T15:14:48.014269Z"],
  ],
  "fx-now-frankfurter": [
    ["FX_NOW_CAD", 2074, 4, 1, "2026-11-12T12:47:49.189668Z"],
    ["FX_NOW_EUR", 2074, 7, 0.87, "2026-11-12T12:48:15.333369Z"],
    ["FX_NOW_SEK", 2074, 4, 1, "2026-11-12T12:45:40.380252Z"],
  ],
};

export const trackedMiners = Object.keys(archivedScores);

export function archivedMinerScores(slug) {
  return (archivedScores[slug] ?? []).map(([intent_id, epoch_id, rank, score, scored_at]) =>
    ({ intent_id, epoch_id, rank, score, scored_at, archived: true }));
}
