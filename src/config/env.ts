import pino from "pino";
import { envSchema } from "./env-schema";

const _logger = pino({ level: "warn", base: { service: "predictify-backend" } });

export const env = envSchema.parse(process.env);
export type { Env } from "./env-schema";

const _minTtl = env.WORKER_HEARTBEAT_SECONDS * 2;
if (env.JWT_TTL_SECONDS < _minTtl * 1.1) {
  _logger.warn(
    { JWT_TTL_SECONDS: env.JWT_TTL_SECONDS, minimumRecommended: _minTtl },
    `JWT_TTL_SECONDS is within 10% of the minimum bound (${_minTtl}). Increase it to avoid worker token-expiry issues.`
  );
}

