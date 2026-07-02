import { redisConnection } from "../queue";
import { logger } from "../config/logger";
import { getRequestId } from "../lib/requestContext";

export const marketCacheKeys = {
  all: "markets:all",
  byId: (id: string) => `markets:${id}`,
};

export async function invalidateMarketCache(marketId: string): Promise<void> {
  const keys = [marketCacheKeys.byId(marketId), marketCacheKeys.all];
  try {
    await Promise.all(
      keys.map(async (key) => {
        try {
          await redisConnection.del(key);
        } catch (err) {
          logger.error({ marketId, key, err }, "Failed to delete cache key");
          throw err;
        }
      })
    );
    logger.info(
      {
        requestId: getRequestId(),
        marketId,
        keys,
      },
      "Market cache invalidated"
    );
  } catch (err) {
    logger.error(
      {
        requestId: getRequestId(),
        marketId,
        keys,
        err,
      },
      "Failed to invalidate market cache"
    );
  }
}
