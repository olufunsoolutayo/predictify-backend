import request from "supertest";
import type { Database } from "../src/db/client";
import { setDbForTests } from "../src/db/client";
import { createApp } from "../src/index";

type MarketRow = {
  id: string;
  question: string;
  status: string;
  resolutionTime: Date;
};

describe("GET /api/markets", () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it("returns seeded markets from the database query", async () => {
    setDbForTests(createMarketDb([
      {
        id: "market-1",
        question: "Will Predictify ship real market reads?",
        status: "active",
        resolutionTime: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]));

    const res = await request(createApp()).get("/api/markets");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        {
          id: "market-1",
          question: "Will Predictify ship real market reads?",
          status: "active",
          resolutionTime: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("rejects invalid pagination input", async () => {
    const res = await request(createApp()).get("/api/markets?limit=1000");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "invalid_query" } });
  });
});

function createMarketDb(rows: MarketRow[]): Database {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            limit: jest.fn(() => ({
              offset: jest.fn(async () => rows),
            })),
          })),
          limit: jest.fn(async (limit: number) => rows.slice(0, limit)),
        })),
      })),
    })),
  } as unknown as Database;
}
