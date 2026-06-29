import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { getPredictionExplanation } from "../services/predictionExplainService";
import { getPredictionStats } from "../services/predictionStatsService";
import { getRequestId } from "../lib/requestContext";
import { logger } from "../config/logger";

export const predictionsRouter = Router();

/**
 * GET /api/predictions/:id/stats
 * Public per-prediction statistics: pool totals, stake ranking among
 * same-outcome predictions, outcome share, and a parimutuel expected payout.
 * Registered before requireAuth so the aggregate (non-sensitive) view is
 * readable without authentication.
 */
predictionsRouter.get("/:id/stats", async (req, res, next) => {
  const reqId = getRequestId();
  try {
    const stats = await getPredictionStats(req.params.id);
    logger.info({ reqId, predictionId: req.params.id }, "prediction_stats_served");
    res.json({ data: stats });
  } catch (error) {
    next(error);
  }
});

// Apply requireAuth to every route declared below this point.
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