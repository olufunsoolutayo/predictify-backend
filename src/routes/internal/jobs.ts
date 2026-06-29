/**
 * Internal job-trigger routes (#212).
 *
 * POST /api/internal/jobs/cleanup-idempotency-keys
 *   Purges expired idempotency keys on demand (e.g. from an external cron).
 *
 * These routes are not for public callers. They are gated behind a shared
 * secret supplied via the `INTERNAL_JOB_TOKEN` env var and sent as
 * `Authorization: Bearer <token>`. When the token is unset the route is
 * disabled (404) so it can never be hit unauthenticated in production.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { cleanupIdempotencyKeys } from "../../workers/cleanupIdempotency";
import { logger } from "../../config/logger";

export const internalJobsRouter = Router();

function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  // Disabled when no token is configured — fail closed.
  if (!expected) {
    res.status(404).json({ error: { code: "not_found" } });
    return;
  }
  const header = req.headers.authorization;
  if (header !== `Bearer ${expected}`) {
    res.status(401).json({ error: { code: "unauthorized" } });
    return;
  }
  next();
}

internalJobsRouter.use(requireInternalToken);

internalJobsRouter.post(
  "/cleanup-idempotency-keys",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await cleanupIdempotencyKeys();
      logger.info({ deleted }, "internal_cleanup_idempotency_triggered");
      return res.status(200).json({ data: { deleted } });
    } catch (err) {
      return next(err);
    }
  },
);
