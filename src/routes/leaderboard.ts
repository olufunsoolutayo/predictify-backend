import { Router } from "express";
import { z } from "zod";
import { getLeaderboard, getLeaderboardWithRefresh, getUserLeaderboardEntry } from "../services/leaderboardService";
import { rateLimitAnon } from "../middleware/rateLimitAnon";

export const leaderboardRouter = Router();

// Throttle anonymous read traffic; authenticated Bearer callers bypass.
leaderboardRouter.use(rateLimitAnon);

// Enum for valid periods
export enum LeaderboardPeriod {
  ALL_TIME = "all-time",
  MONTHLY = "monthly",
  WEEKLY = "weekly",
}

// Zod validation schema for query parameters
const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  refresh: z.coerce.boolean().default(false),
  period: z.nativeEnum(LeaderboardPeriod).default(LeaderboardPeriod.ALL_TIME),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

// GET /api/leaderboard - Get leaderboard with optional refresh and period filter
leaderboardRouter.get("/", async (req, res, next) => {
  try {
    const { limit, offset, refresh, period } = leaderboardQuerySchema.parse(req.query);
    
    const data = refresh 
      ? await getLeaderboardWithRefresh(limit, offset, period)
      : await getLeaderboard(limit, offset, period);
    
    res.json({ 
      data,
      meta: {
        limit,
        offset,
        count: data.length,
        refresh,
        period,
      }
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/leaderboard/user/:stellarAddress - Get specific user's leaderboard entry
leaderboardRouter.get("/user/:stellarAddress", async (req, res, next) => {
  try {
    const { period } = z.object({
      period: z.nativeEnum(LeaderboardPeriod).default(LeaderboardPeriod.ALL_TIME),
    }).parse(req.query);

    const entry = await getUserLeaderboardEntry(req.params.stellarAddress, period);
    if (!entry) {
      res.status(404).json({ error: { code: "not_found" } });
      return;
    }
    res.json({ data: entry });
  } catch (e) {
    next(e);
  }
});
