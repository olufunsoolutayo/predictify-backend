/**
 * POST /api/admin/markets/disable — disable a market for moderation (#213).
 *
 * Admin-only. Marks a market as disabled and records a structured audit entry
 * with the supplied reason. Idempotent at the row level: re-disabling an
 * already-disabled market returns 409.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdmin, AuthenticatedRequest } from "../../middleware/auth";
import {
  disableMarket,
  MarketAlreadyDisabledError,
} from "../../services/marketService";
import { logger } from "../../config/logger";

const disableBodySchema = z
  .object({
    marketId: z.string().min(1, "marketId is required"),
    reason: z.string().min(1, "reason is required").max(500),
  })
  .strict();

export const adminMarketsRouter = Router();

adminMarketsRouter.use(requireAdmin);

adminMarketsRouter.post("/disable", async (req: AuthenticatedRequest, res, next) => {
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
