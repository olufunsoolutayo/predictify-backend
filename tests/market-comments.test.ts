import express from "express";
import request from "supertest";

jest.mock("../src/middleware/requireAuth", () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userId = req.header("x-test-user-id");
    if (!userId) {
      res.status(401).json({ error: { code: "unauthenticated" } });
      return;
    }
    (req as unknown as { user: { id: string; stellarAddress: string } }).user = {
      id: userId,
      stellarAddress: "GTEST",
    };
    next();
  },
}));

jest.mock("../src/services/marketCommentService", () => {
  const actual = jest.requireActual("../src/services/marketCommentService");
  return {
    ...actual,
    createMarketComment: jest.fn(),
  };
});

import { createMarketCommentsRouter } from "../src/routes/markets/comments";
import { createMarketComment, MarketCommentError } from "../src/services/marketCommentService";

const mockedCreateMarketComment = createMarketComment as jest.MockedFunction<typeof createMarketComment>;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/markets/:id/comments", createMarketCommentsRouter({ windowMs: 60_000, max: 2 }));
  return app;
}

describe("POST /api/markets/:id/comments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requires authentication", async () => {
    const res = await request(createTestApp())
      .post("/api/markets/market-1/comments")
      .send({ content: "hello" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("validates content", async () => {
    const res = await request(createTestApp())
      .post("/api/markets/market-1/comments")
      .set("x-test-user-id", "550e8400-e29b-41d4-a716-446655440000")
      .send({ content: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(mockedCreateMarketComment).not.toHaveBeenCalled();
  });

  it("creates a trimmed comment", async () => {
    const createdAt = new Date("2026-06-29T00:00:00.000Z");
    mockedCreateMarketComment.mockResolvedValueOnce({
      id: "550e8400-e29b-41d4-a716-446655440001",
      marketId: "market-1",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      content: "hello market",
      createdAt,
    });

    const res = await request(createTestApp())
      .post("/api/markets/market-1/comments")
      .set("x-test-user-id", "550e8400-e29b-41d4-a716-446655440000")
      .send({ content: "  hello market  " });

    expect(res.status).toBe(201);
    expect(mockedCreateMarketComment).toHaveBeenCalledWith({
      marketId: "market-1",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      content: "hello market",
    });
    expect(res.body.data).toMatchObject({ content: "hello market", createdAt: createdAt.toISOString() });
  });

  it("returns 404 when the market does not exist", async () => {
    mockedCreateMarketComment.mockRejectedValueOnce(
      new MarketCommentError(404, "market_not_found", "Market not found"),
    );

    const res = await request(createTestApp())
      .post("/api/markets/missing/comments")
      .set("x-test-user-id", "550e8400-e29b-41d4-a716-446655440000")
      .send({ content: "hello" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("market_not_found");
  });

  it("rate limits per authenticated user", async () => {
    mockedCreateMarketComment.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440001",
      marketId: "market-1",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      content: "hello",
      createdAt: new Date("2026-06-29T00:00:00.000Z"),
    });
    const app = createTestApp();

    await request(app).post("/api/markets/market-1/comments").set("x-test-user-id", "user-a").send({ content: "one" }).expect(201);
    await request(app).post("/api/markets/market-1/comments").set("x-test-user-id", "user-a").send({ content: "two" }).expect(201);
    const limited = await request(app).post("/api/markets/market-1/comments").set("x-test-user-id", "user-a").send({ content: "three" });
    await request(app).post("/api/markets/market-1/comments").set("x-test-user-id", "user-b").send({ content: "one" }).expect(201);

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
  });
});
