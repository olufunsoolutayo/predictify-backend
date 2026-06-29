  
  
/* eslint-disable @typescript-eslint/no-explicit-any */ 
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { getPredictionExplanation } from "../services/predictionExplainService";
import { createShareRouter } from "./predictions/share";

export const predictionsRouter = Router();

// ── Public sub-routers (no auth required) ────────────────────────────────
// Must be registered before the requireAuth guard so bots / crawlers can
// fetch social-preview metadata without credentials.

/**
 * GET /api/predictions/:id/share
 * Returns OG + Twitter card metadata for a prediction.
 * Public — no authentication required.
 */
predictionsRouter.use("/", createShareRouter());

// ── Authenticated routes ──────────────────────────────────────────────────
predictionsRouter.use(requireAuth);

/**
 * GET /api/predictions
 * Returns predictions belonging to the authenticated user.
 */
predictionsRouter.get("/", (req, res) => {
  res.json({ data: [], user: (req as any).user });
});

/**
 * GET /api/predictions/:id/explain
 * Returns the resolution computation trail for a prediction (educational endpoint).
 * Shows oracle inputs, market resolution, and payout calculation.
 */
predictionsRouter.get("/:id/explain", async (req, res, next) => {
  try {
    const { id } = req.params;
    const explanation = await getPredictionExplanation(id);
    res.json(explanation);
  } catch (error) {
    next(error);
  }
});