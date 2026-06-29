/**
 * Admin user-freeze router.
 *
 *   GET    /api/admin/users/:address/freeze  — read current freeze status
 *   POST   /api/admin/users/:address/freeze  — freeze a user (block further bets)
 *   DELETE /api/admin/users/:address/freeze  — lift the freeze
 *
 * Every route requires a valid admin JWT (role: "admin") and is rate-limited
 * per admin token. The Stellar address is validated at the boundary and all
 * failures use the standard error envelope.
 */

import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAdmin } from "../../../middleware/requireAdmin";
import { getRequestId } from "../../../lib/requestContext";
import { logger } from "../../../config/logger";
import {
  getFreezeStatus,
  freezeUser,
  unfreezeUser,
} from "../../../services/userFreezeService";

export interface AdminFreezeRouterOptions {
  /** Requests per minute per admin token. Default: 60 */
  rateLimitPerMinute?: number;
}

const stellarAddressSchema = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar address");

const freezeBodySchema = z
  .object({
    reason: z.string().max(280).nullish(),
  })
  .strict()
  .optional();

function validationError(res: import("express").Response, message: string): void {
  res.status(400).json({
    error: { code: "validation_error", message, requestId: getRequestId() },
  });
}

export function createAdminFreezeRouter(opts: AdminFreezeRouterOptions = {}): Router {
  // mergeParams so the :address segment from the parent mount is visible here.
  const router = Router({ mergeParams: true });
  const limit = opts.rateLimitPerMinute ?? 60;

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

  router.use(requireAdmin);

  router.get("/:address/freeze", (req, res) => {
    const parsed = stellarAddressSchema.safeParse(req.params.address);
    if (!parsed.success) {
      return validationError(res, "invalid stellar address");
    }
    return res.json({ data: getFreezeStatus(parsed.data) });
  });

  router.post("/:address/freeze", (req, res) => {
    const parsed = stellarAddressSchema.safeParse(req.params.address);
    if (!parsed.success) {
      return validationError(res, "invalid stellar address");
    }
    const body = freezeBodySchema.safeParse(req.body);
    if (!body.success) {
      return validationError(res, body.error.issues[0]?.message ?? "invalid body");
    }

    const record = freezeUser(parsed.data, req.adminAddress!, body.data?.reason ?? null);
    logger.info(
      { reqId: getRequestId(), address: parsed.data, actor: req.adminAddress },
      "user_frozen",
    );
    return res.json({ data: record });
  });

  router.delete("/:address/freeze", (req, res) => {
    const parsed = stellarAddressSchema.safeParse(req.params.address);
    if (!parsed.success) {
      return validationError(res, "invalid stellar address");
    }

    const record = unfreezeUser(parsed.data, req.adminAddress!);
    logger.info(
      { reqId: getRequestId(), address: parsed.data, actor: req.adminAddress },
      "user_unfrozen",
    );
    return res.json({ data: record });
  });

  return router;
}

export const adminFreezeRouter = createAdminFreezeRouter();
