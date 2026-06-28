/**
 * POST /api/me/devices/:id/revoke — revoke a single session/device (#215).
 *
 * A "device" is a refresh-token family. Revoking one marks every still-active
 * refresh token in that family as revoked so the device can no longer mint new
 * access tokens. The operation is scoped to the authenticated user: a caller
 * can only revoke their own sessions, and revoking an unknown/foreign family
 * returns 404 (no information leak about other users' sessions).
 */
import { Router, type Response, type NextFunction } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { refreshTokens } from "../db/schema";
import { requireAuth } from "../middleware/requireAuth";
import { AuthenticatedRequest } from "../middleware/auth";
import { logger } from "../config/logger";

const paramsSchema = z.object({ id: z.string().uuid({ message: "invalid device id" }) });

export const devicesRevokeRouter = Router({ mergeParams: true });

devicesRevokeRouter.use(requireAuth);

devicesRevokeRouter.post(
  "/",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = paramsSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "validation_error",
            message: parsed.error.issues[0]?.message ?? "invalid device id",
          },
        });
      }

      const userId = req.user!.id;
      const familyId = parsed.data.id;

      const revoked = await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.userId, userId),
            eq(refreshTokens.familyId, familyId),
            isNull(refreshTokens.revokedAt),
          ),
        )
        .returning({ id: refreshTokens.id });

      if (revoked.length === 0) {
        // Either no such family for this user, or it was already fully revoked.
        logger.info({ userId, familyId }, "me_device_revoke_noop");
        return res.status(404).json({ error: { code: "not_found" } });
      }

      logger.info({ userId, familyId, revoked: revoked.length }, "me_device_revoked");
      return res.status(200).json({ data: { id: familyId, revoked: revoked.length } });
    } catch (err) {
      return next(err);
    }
  },
);
