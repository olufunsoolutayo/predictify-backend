import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../../middleware/requireAuth";
import { createMarketComment, MarketCommentError } from "../../services/marketCommentService";

export interface MarketCommentsRouterOptions {
  windowMs?: number;
  max?: number;
}

const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(1000),
}).strict();

export function createMarketCommentsRouter(options: MarketCommentsRouterOptions = {}): Router {
  const router = Router({ mergeParams: true });

  const perUserLimiter = rateLimit({
    windowMs: options.windowMs ?? 60_000,
    max: options.max ?? 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const user = (req as unknown as { user?: { id?: string } }).user;
      return user?.id ?? req.ip ?? "unknown";
    },
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "rate_limited", message: "Too many comments; please try again later" } });
    },
  });

  router.post("/", requireAuth, perUserLimiter, async (req, res, next) => {
    try {
      const marketId = (req.params as Record<string, string>).id;
      if (!marketId) {
        res.status(400).json({ error: { code: "bad_request", message: "Market ID is required" } });
        return;
      }

      const parsed = createCommentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "validation_error",
            message: "Invalid request body",
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      const userId = (req as unknown as { user: { id: string } }).user.id;
      const comment = await createMarketComment({
        marketId,
        userId,
        content: parsed.data.content,
      });

      res.status(201).json({ data: comment });
    } catch (e) {
      if (e instanceof MarketCommentError) {
        res.status(e.status).json({ error: { code: e.code, message: e.message } });
        return;
      }
      next(e);
    }
  });

  return router;
}

export const marketCommentsRouter = createMarketCommentsRouter();
