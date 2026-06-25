import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { healthRouter } from "./routes/health";
import { marketsRouter } from "./routes/markets";
import { createAdminWebhooksRouter, type AdminWebhookDeps } from "./routes/adminWebhooks";
import { errorHandler } from "./middleware/errorHandler";

export interface AppDeps {
  /**
   * Webhook store + dispatcher. Optional so tests can inject an in-memory
   * implementation. When omitted, production wiring (drizzle + fetch) is built
   * lazily — importing this module never opens a DB connection by side effect.
   */
  webhooks?: AdminWebhookDeps;
}

function buildProductionWebhookDeps(): AdminWebhookDeps {
  // Imported lazily so test/tooling imports don't require a live database.
  const { getDb } = require("./db/client") as typeof import("./db/client");
  const { DrizzleWebhookStore } =
    require("./services/drizzleWebhookStore") as typeof import("./services/drizzleWebhookStore");
  const { WebhookDispatcher } =
    require("./services/webhookDispatcher") as typeof import("./services/webhookDispatcher");

  const store = new DrizzleWebhookStore(getDb());
  const dispatcher = new WebhookDispatcher({
    store,
    signingSecret: env.WEBHOOK_SIGNING_SECRET,
  });
  return { store, dispatcher };
}

export function createApp(deps: AppDeps = {}): express.Express {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: "256kb" }));
  app.use(pinoHttp({ logger }));

  app.use("/health", healthRouter);
  app.use("/api/markets", marketsRouter);

  const webhooks = deps.webhooks ?? buildProductionWebhookDeps();
  app.use("/api/admin/webhooks", createAdminWebhooksRouter(webhooks));

  app.use(errorHandler);
  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "predictify-backend listening");
  });
}
