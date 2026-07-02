import IORedis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export const redis = new IORedis(env.REDIS_URL);

redis.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});
