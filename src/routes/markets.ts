import { Router } from "express";
import { optionalAuth } from "../middleware/requireAuth";
import { listMarkets, getMarketById } from "../services/marketService";
import { AppError } from "../errors";

export const marketsRouter = Router();

/**
 * GET /api/markets
 * Public listing — personalised when a valid JWT is supplied.
 * optionalAuth populates req.user when a token is present; 401s on a bad token
 * so the client knows to re-authenticate rather than silently losing context.
 */
marketsRouter.get("/", optionalAuth, async (req, res, next) => {
  try {
    // req.user is defined only when the caller sent a valid JWT.
    res.json({ data: await listMarkets(), authenticatedAs: req.user ?? null });
  } catch (e) { next(e); }
});

marketsRouter.get("/:id", async (req, res, next) => {
  try {
    const market = await getMarketById(req.params.id as string);
    if (!market) { res.status(404).json({ error: { code: "not_found" } }); return; }
    res.json({ data: market });
  } catch (e) { next(e); }
});
