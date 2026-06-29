import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAdmin } from "../../middleware/requireAdmin";
import { getRequestId } from "../../lib/requestContext";
import { AppError } from "../../errors/AppError";
import * as featureFlagsService from "../../services/featureFlags";

export interface AdminFlagsRouterOptions {
  /** Requests per minute per admin token. Default: 60 */
  rateLimitPerMinute?: number;
}

const createFlagSchema = z.object({
  key: z.string().min(1, "key is required"),
  enabled: z.boolean(),
  variant: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  variant: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export function createAdminFlagsRouter(opts: AdminFlagsRouterOptions = {}): Router {
  const router = Router();
  const limit = opts.rateLimitPerMinute ?? 60;

  // ── Rate limiter ────────────────────────────────────────────────────────────
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

  // ── Admin guard ─────────────────────────────────────────────────────────────
  router.use(requireAdmin);

  // ── GET / ───────────────────────────────────────────────────────────────────
  router.get("/", async (_req, res, next) => {
    try {
      const flags = featureFlagsService.getAllFlags();
      res.json({ data: flags });
    } catch (e) {
      next(e);
    }
  });

  // ── GET /:key ───────────────────────────────────────────────────────────────
  router.get("/:key", async (req, res, next) => {
    try {
      const flag = featureFlagsService.getFlag(req.params.key);
      if (!flag) {
        throw AppError.notFound(`Feature flag '${req.params.key}' not found`);
      }
      res.json({ data: flag });
    } catch (e) {
      next(e);
    }
  });

  // ── POST / ──────────────────────────────────────────────────────────────────
  router.post("/", async (req, res, next) => {
    try {
      const parseResult = createFlagSchema.safeParse(req.body);
      if (!parseResult.success) {
        const reqId = getRequestId();
        res.status(400).json({
          error: {
            code: "validation_error",
            message: parseResult.error.issues[0]?.message ?? "invalid payload",
            requestId: reqId,
          },
        });
        return;
      }

      const existing = featureFlagsService.getFlag(parseResult.data.key);
      if (existing) {
        const reqId = getRequestId();
        res.status(400).json({
          error: {
            code: "validation_error",
            message: `Feature flag '${parseResult.data.key}' already exists`,
            requestId: reqId,
          },
        });
        return;
      }

      const newFlag = await featureFlagsService.createFlag(parseResult.data);
      res.status(201).json({ data: newFlag });
    } catch (e) {
      next(e);
    }
  });

  // ── PATCH /:key ─────────────────────────────────────────────────────────────
  router.patch("/:key", async (req, res, next) => {
    try {
      const parseResult = updateFlagSchema.safeParse(req.body);
      if (!parseResult.success) {
        const reqId = getRequestId();
        res.status(400).json({
          error: {
            code: "validation_error",
            message: parseResult.error.issues[0]?.message ?? "invalid payload",
            requestId: reqId,
          },
        });
        return;
      }

      const updated = await featureFlagsService.updateFlag(req.params.key, parseResult.data);
      if (!updated) {
        throw AppError.notFound(`Feature flag '${req.params.key}' not found`);
      }
      res.json({ data: updated });
    } catch (e) {
      next(e);
    }
  });

  // ── DELETE /:key ────────────────────────────────────────────────────────────
  router.delete("/:key", async (req, res, next) => {
    try {
      const deleted = await featureFlagsService.deleteFlag(req.params.key);
      if (!deleted) {
        throw AppError.notFound(`Feature flag '${req.params.key}' not found`);
      }
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export const adminFlagsRouter = createAdminFlagsRouter();
