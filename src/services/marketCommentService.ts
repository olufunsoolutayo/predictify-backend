import { eq } from "drizzle-orm";
import { db } from "../db";
import { marketComments, markets } from "../db/schema";

export interface MarketComment {
  id: string;
  marketId: string;
  userId: string;
  content: string;
  createdAt: Date;
}

export class MarketCommentError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MarketCommentError";
  }
}

export async function createMarketComment(params: {
  marketId: string;
  userId: string;
  content: string;
}): Promise<MarketComment> {
  const { marketId, userId, content } = params;

  const [market] = await db
    .select({ id: markets.id })
    .from(markets)
    .where(eq(markets.id, marketId))
    .limit(1);

  if (!market) {
    throw new MarketCommentError(404, "market_not_found", "Market not found");
  }

  const [comment] = await db
    .insert(marketComments)
    .values({ marketId, userId, content })
    .returning();

  return comment;
}
