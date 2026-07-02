import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

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

export const settleConfirmerPollsTotal = new Counter({
  name: "settle_confirmer_polls_total",
  help: "Total number of settle-confirmer poll cycles completed",
  registers: [register],
});

export const settleConfirmerSettledTotal = new Counter({
  name: "settle_confirmer_settled_total",
  help: "Total number of claims marked as settled by the settle-confirmer",
  registers: [register],
});

export const settleConfirmerFailedTotal = new Counter({
  name: "settle_confirmer_failed_total",
  help: "Total number of claims permanently marked as failed by the settle-confirmer",
  registers: [register],
});

export const indexerLagLedgers = new Gauge({
  name: "indexer_lag_ledgers",
  help: "Current indexer lag in number of ledgers",
  registers: [register],
});

export const indexerGapDetectedTotal = new Counter({
  name: "indexer_gap_detected_total",
  help: "Total number of indexer gaps detected",
  labelNames: ["from", "to"] as const,
  registers: [register],
});

export function resetMetrics(): void {
  register.clear();
}

