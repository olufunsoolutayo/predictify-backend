import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { markets } from "../db/schema";

export interface Market {
  id: string;
  question: string;
  status: "active" | "resolved" | "disputed";
  resolutionTime: string;
}

export interface ListMarketsOptions {
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const marketStatus = new Set<Market["status"]>(["active", "resolved", "disputed"]);

export async function listMarkets(options: ListMarketsOptions = {}): Promise<Market[]> {
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const rows = await getDb()
    .select({
      id: markets.id,
      question: markets.question,
      status: markets.status,
      resolutionTime: markets.resolutionTime,
    })
    .from(markets)
    .where(eq(markets.archived, false))
    .orderBy(asc(markets.resolutionTime), asc(markets.id))
    .limit(limit)
    .offset(offset);

  return rows.map(toMarket);
}

export async function getMarketById(id: string): Promise<Market | null> {
  const [row] = await getDb()
    .select({
      id: markets.id,
      question: markets.question,
      status: markets.status,
      resolutionTime: markets.resolutionTime,
    })
    .from(markets)
    .where(and(eq(markets.id, id), eq(markets.archived, false)))
    .limit(1);

  return row ? toMarket(row) : null;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function normalizeOffset(offset: number | undefined): number {
  return offset ?? 0;
}

function toMarket(row: {
  id: string;
  question: string;
  status: string;
  resolutionTime: Date;
}): Market {
  if (!marketStatus.has(row.status as Market["status"])) {
    throw new Error(`Unexpected market status: ${row.status}`);
  }

  return {
    id: row.id,
    question: row.question,
    status: row.status as Market["status"],
    resolutionTime: row.resolutionTime.toISOString(),
  };
}
