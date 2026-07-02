/**
 * Admin feature/unfeature router for the home page.
 *
 *   POST   /api/admin/markets/:id/feature   → mark a market as featured (idempotent)
 *   DELETE /api/admin/markets/:id/feature   → unmark a market (idempotent)
 *
 * Both routes are guarded by `requireAdmin` (returns 403 unauthenticated /
 * non-admin) and rate-limited to 60 requests per minute per admin token.
 *
 * The mutation is split into two verbs (POST/DELETE) rather than a single
 * PATCH so each action is independently auditable, idempotent, and discoverable
 * in API docs without overloading a generic PATCH payload.
 */

import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAdmin } from "../../middleware/requireAdmin";
import { logger } from "../../config/logger";
import {
  featureMarket,
  unfeatureMarket,
  MarketArchivedError,
  MarketNotFoundError,
} from "../../services/marketFeatureService";
import {
  disableMarket,
  MarketAlreadyDisabledError,
} from "../../services/marketService";

/** Pulls the first valid IP from X-Forwarded-For or falls back to socket/ip. */
function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]!;
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(255),
});

function requestIdOf(req: { id?: unknown }): string {
  return typeof req.id === "string" ? req.id : "";
}

export interface AdminMarketsRouterOptions {
  /** Requests per minute per admin token. Default: 60 */
  rateLimitPerMinute?: number;
}

export function createAdminMarketsRouter(
  opts: AdminMarketsRouterOptions = {},
): Router {
  const router = Router();
  const limit = opts.rateLimitPerMinute ?? 60;

  // Per-admin-token bucket so multiple admins don't share state. Falls back to
  // IP for unauthenticated callers so they are still throttled before reaching
  // requireAdmin.
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit,
      keyGenerator: (req) =>
        (req.headers.authorization as string | undefined) ?? req.ip ?? "unknown",
      standardHeaders: "draft-6",
      legacyHeaders: false,
      message: { error: { code: "rate_limit_exceeded" } },
    }),
  );

  // Admin guard
  router.use(requireAdmin);

  const handle = async (
    req: Request,
    res: Response,
    operation: "feature" | "unfeature",
  ): Promise<void> => {
    const parsed = paramsSchema.safeParse(req.params);
    const requestId = requestIdOf({ id: req.id });

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "validation_error",
          details: parsed.error.issues,
          requestId,
        },
      });
      return;
    }

    if (!req.adminAddress) {
      // requireAdmin guarantees this in production, but the guard narrows
      // the type defensively for callers that bypass it in tests.
      res.status(401).json({ error: { code: "unauthorized", requestId } });
      return;
    }

    const handler = operation === "feature" ? featureMarket : unfeatureMarket;
    try {
      const result = await handler(parsed.data.id, req.adminAddress, {
        ip: extractClientIp(req),
        correlationId: requestId,
      });
      res.status(200).json({ data: result });
    } catch (err) {
      if (err instanceof MarketNotFoundError) {
        res.status(404).json({
          error: { code: "not_found", requestId },
        });
        return;
      }
      if (err instanceof MarketArchivedError) {
        res.status(400).json({
          error: { code: err.code, message: err.message, requestId },
        });
        return;
      }
      throw err;
    }
  };

  router.post("/:id/feature", async (req, res, next) => {
    try {
      await handle(req, res, "feature");
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id/feature", async (req, res, next) => {
    try {
      await handle(req, res, "unfeature");
    } catch (err) {
      next(err);
    }
  });

  const disableBodySchema = z
    .object({
      marketId: z.string().min(1, "marketId is required"),
      reason: z.string().min(1, "reason is required").max(500),
    })
    .strict();

  router.post("/disable", async (req: any, res, next) => {
    try {
      const parsed = disableBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: "validation_error", details: parsed.error.issues },
        });
      }

      const { marketId, reason } = parsed.data;
      const adminAddress = req.user!.stellarAddress;

      const updated = await disableMarket(marketId, reason, adminAddress);

      logger.info({ marketId, adminAddress }, "admin_market_disabled");
      return res.status(200).json({ data: updated });
    } catch (e) {
      if (e instanceof MarketAlreadyDisabledError) {
        return res.status(409).json({ error: { code: "already_disabled" } });
      }
      if ((e as { status?: number }).status === 404) {
        return res.status(404).json({ error: { code: "not_found" } });
      }
      return next(e);
    }
  });

  return router;
}

// Default export wired into src/index.ts.
export const adminMarketsRouter = createAdminMarketsRouter();
