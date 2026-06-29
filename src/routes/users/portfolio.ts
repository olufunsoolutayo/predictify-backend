import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getUserPortfolio } from "../../services/userPortfolioService";

export const userPortfolioRouter = Router();

const stellarAddressSchema = z.string().regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar address");

userPortfolioRouter.get("/:addr/portfolio", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = stellarAddressSchema.safeParse(req.params.addr);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "invalid_address" } });
  }

  try {
    const portfolio = await getUserPortfolio(parsed.data);
    if (!portfolio) {
      return res.status(404).json({ error: { code: "not_found" } });
    }
    return res.json({ data: portfolio });
  } catch (error) {
    return next(error);
  }
});
