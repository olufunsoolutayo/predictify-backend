import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { healthRouter } from "./routes/health";
import { marketsRouter } from "./routes/markets";
import { errorHandler } from "./middleware/errorHandler";
import { idempotency } from "./middleware/idempotency";
import { startIdempotencySweeper } from "./jobs/idempotencySweeper";

export function createApp(): express.Express {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: "256kb" }));
  app.use(pinoHttp({ logger }));

  app.use("/health", healthRouter);

  // Idempotency guard for all state-mutating routes under /api.
  // Must be mounted before the routers it protects.
  const mutationMethods = ["POST", "PATCH"] as const;
  app.use("/api", (req, res, next) =>
    mutationMethods.includes(req.method as (typeof mutationMethods)[number])
      ? idempotency(req, res, next)
      : next(),
  );

  app.use("/api/markets", marketsRouter);

  app.use(errorHandler);
  return app;
}

if (require.main === module) {
  const app = createApp();
  startIdempotencySweeper();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "predictify-backend listening");
  });
}
