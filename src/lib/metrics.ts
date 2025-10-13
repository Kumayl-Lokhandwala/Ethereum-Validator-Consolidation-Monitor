// File: src/lib/metrics.ts
import client from "prom-client";

export const eventsDetectedCounter = new client.Counter({
  name: "validator_events_detected_total",
  help: "Total number of validator credential change events detected",
});

export const activeEventQueueGauge = new client.Gauge({
  name: "validator_events_active_queue_length",
  help: "Number of events currently in the pending queue",
});

export const dataFetchCounter = new client.Counter({
  name: "beacon_api_fetches_total",
  help: "Total number of fetches to the Beacon API",
  labelNames: ["status"], // 'success' or 'failure'
});
