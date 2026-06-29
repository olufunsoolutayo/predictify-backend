/**
 * Admin markets router.
 *
 * POST /api/admin/markets/:id/force-finalize
 *   Two-phase force-finalize for stuck markets past their resolution deadline.
 *
 *   Phase 1 — omit ?confirm=true (or send confirm=false in body):
 *     Returns a preview of the action without writing to the database.
 *
 *   Phase 2 — add ?confirm=true:
 *     Atomically marks the market resolved + force_finalized = true and
 *     writes a marketAuditLog entry.
 *
 *   Both phases require a valid admin JWT (role: "admin" or ADMIN_ALLOWLIST).
 */

import { Router } from "express";
import { z } from "zod";
import { requireAdmin, type AuthenticatedRequest } from "../middleware/auth";
import { forceFinalize } from "../services/marketAdmin";
import { db } from "../db";

const bodySchema = z.object({
  winningOutcome: z.string().min(1),
});

export const adminMarketsRouter = Router();

adminMarketsRouter.use(requireAdmin);

/**
 * POST /api/admin/markets/:id/force-finalize
 *
 * Query params:
 *   confirm=true   — execute the finalization (phase 2)
 *   (absent)       — dry-run preview (phase 1)
 */
adminMarketsRouter.post(
  "/:id/force-finalize",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: "validation_error", details: parsed.error.issues },
        });
        return;
      }

      const confirm = req.query.confirm === "true";
      const adminAddress = req.user!.stellarAddress as string;

      const outcome = await forceFinalize(
        db,
        { marketId: req.params.id as string, winningOutcome: parsed.data.winningOutcome, adminAddress },
        confirm,
      );

      if (outcome.phase === "already_finalized") {
        res.status(409).json({ error: { code: "already_finalized" } });
        return;
      }

      res.status(200).json({ data: outcome });
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err.status === 404) {
        res.status(404).json({ error: { code: "not_found" } });
        return;
      }
      if (err.status === 422) {
        res.status(422).json({ error: { code: "deadline_not_reached", message: err.message } });
        return;
      }
      next(e);
    }
  },
);
