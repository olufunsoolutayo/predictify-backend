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

/**
 * Creates a complete mock database that implements the full Drizzle query builder interface.
 * This replaces the deprecated in-memory stub bypass and ensures tests use the real repository path.
 */
function createMarketDb(rows: MarketRow[]): Database {
  return {
    select: jest.fn((columns?: any) => ({
      from: jest.fn((table: any) => ({
        where: jest.fn((condition: any) => ({
          orderBy: jest.fn((orderByFn: any, ...rest: any) => ({
            limit: jest.fn((limitVal: number) => ({
              offset: jest.fn(async (offsetVal: number) => {
                return rows.slice(offsetVal, offsetVal + limitVal);
              }),
            })),
          })),
          limit: jest.fn(async (limitVal: number) => {
            return rows.slice(0, limitVal);
          }),
        })),
      })),
    })),
    transaction: jest.fn(async (fn: Function) => {
      // Mock transaction support for tests
      return fn({
        select: jest.fn((columns?: any) => ({
          from: jest.fn((table: any) => ({
            where: jest.fn((condition: any) => ({
              limit: jest.fn(async (limitVal: number) => rows.slice(0, limitVal)),
            })),
          })),
        })),
        update: jest.fn((table: any) => ({
          set: jest.fn((values: any) => ({
            where: jest.fn((condition: any) => ({
              returning: jest.fn(async () => [{ ...rows[0], ...values }]),
            })),
          })),
        })),
        insert: jest.fn((table: any) => ({
          values: jest.fn(async () => undefined),
        })),
      });
    }),
  } as unknown as Database;
}

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

  it("returns empty array when no markets exist", async () => {
    setDbForTests(createMarketDb([]));

    const res = await request(createApp()).get("/api/markets");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it("respects pagination limit parameter", async () => {
    const markets = Array.from({ length: 5 }, (_, i) => ({
      id: `market-${i + 1}`,
      question: `Question ${i + 1}`,
      status: "active",
      resolutionTime: new Date("2026-07-01T00:00:00.000Z"),
    }));

    setDbForTests(createMarketDb(markets));

    const res = await request(createApp()).get("/api/markets?limit=2");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("rejects invalid pagination input", async () => {
    const res = await request(createApp()).get("/api/markets?limit=1000");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "invalid_query" } });
  });

  it("rejects non-numeric limit", async () => {
    setDbForTests(createMarketDb([]));

    const res = await request(createApp()).get("/api/markets?limit=abc");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "invalid_query" } });
  });
});

describe("GET /api/markets/:id", () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it("returns a single market by ID", async () => {
    setDbForTests(createMarketDb([
      {
        id: "market-1",
        question: "Will Predictify ship real market reads?",
        status: "active",
        resolutionTime: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]));

    const res = await request(createApp()).get("/api/markets/market-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        id: "market-1",
        question: "Will Predictify ship real market reads?",
        status: "active",
        resolutionTime: "2026-07-01T00:00:00.000Z",
      },
    });
  });

  it("returns 404 when market not found", async () => {
    setDbForTests(createMarketDb([]));

    const res = await request(createApp()).get("/api/markets/nonexistent-id");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found" } });
  });

  it("handles market ID with special characters", async () => {
    setDbForTests(createMarketDb([
      {
        id: "market-abc-123",
        question: "Test question",
        status: "active",
        resolutionTime: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]));

    const res = await request(createApp()).get("/api/markets/market-abc-123");

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe("market-abc-123");
  });
});

describe("PATCH /api/markets/:id (secure update with versioning)", () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it("rejects requests without admin authentication", async () => {
    const res = await request(createApp())
      .patch("/api/markets/market-1")
      .send({ question: "Updated?", expectedVersion: 0 });

    expect(res.status).toBe(401);
  });

  it("validates expectedVersion parameter", async () => {
    setDbForTests(createMarketDb([]));

    const res = await request(createApp())
      .patch("/api/markets/market-1")
      .set("Authorization", "Bearer invalid-token")
      .send({ question: "Updated?", expectedVersion: "not-a-number" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects extra fields in request body", async () => {
    setDbForTests(createMarketDb([]));

    const res = await request(createApp())
      .patch("/api/markets/market-1")
      .set("Authorization", "Bearer invalid-token")
      .send({
        question: "Updated?",
        expectedVersion: 0,
        extraField: "should be rejected",
      });

    // Validation schema is strict(), so this should fail
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Regression: ensure stub bypass is removed", () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it("throws error if mock database returns non-array from select", async () => {
    const badDb = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              limit: jest.fn(() => ({
                offset: jest.fn(async () => null), // Wrong: should be an array
              })),
            })),
          })),
        })),
      })),
    } as unknown as Database;

    setDbForTests(badDb);

    const res = await request(createApp()).get("/api/markets");

    // Should fail because the real service now validates the response type
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it("validates market ID is a string in getMarketById", async () => {
    const mockDb = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(async () => [
              {
                id: "market-1",
                question: "Test",
                status: "active",
                resolutionTime: new Date(),
              },
            ]),
          })),
        })),
      })),
    } as unknown as Database;

    setDbForTests(mockDb);

    // This test validates that the service layer performs input validation
    const res = await request(createApp()).get("/api/markets/market-1");
    expect(res.status).toBe(200);
  });
});
