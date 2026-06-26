import { Registry, Counter, Histogram, collectDefaultMetrics } from "prom-client";

export const register = new Registry();

collectDefaultMetrics({ register });

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds, segmented by route template and status code",
  labelNames: ["route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const indexerPollsTotal = new Counter({
  name: "indexer_polls_total",
  help: "Total number of indexer poll cycles completed",
  registers: [register],
});

export const webhookDeliveriesTotal = new Counter({
  name: "webhook_deliveries_total",
  help: "Total number of webhook deliveries, segmented by outcome status (success, failed)",
  labelNames: ["status"] as const,
  registers: [register],
});

export const authVerificationsTotal = new Counter({
  name: "auth_verifications_total",
  help: "Total number of authentication verification attempts, segmented by outcome (success, failure)",
  labelNames: ["outcome"] as const,
  registers: [register],
});
