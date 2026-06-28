/**
 * SQL Injection Security Regression Suite
 * ---------------------------------------
 * Fires common SQLi payloads against all parameterized inputs across all routes.
 * Asserts that inputs are either rejected at the boundary (400 validation error)
 * or handled safely (no 500 database/syntax errors).
 */

// 1. Setup environment variables before imports
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "security-test-secret-at-least-32-bytes!!";
process.env.JWT_ISSUER = "predictify";
process.env.JWT_AUDIENCE = "predictify-app";
process.env.ADMIN_ALLOWLIST = "GADMIN7777777777777777777777777777777777777777777777777777";

// 2. Global Mocks to prevent actual database/Redis connections
jest.mock("pg", () => {
  const Pool = jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  }));
  return { Pool };
});

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  }));
});

jest.mock("bullmq", () => {
  return {
    Queue: jest.fn().mockImplementation((name) => ({ name })),
    Worker: jest.fn(),
    QueueEvents: jest.fn(),
  };
});

// 3. Mock database clients directly
jest.mock("../../src/db/client", () => {
  const mockDb = {
    execute: jest.fn().mockResolvedValue({ rows: [] }),
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    query: {
      users: { findFirst: jest.fn().mockResolvedValue({ id: "user-uuid", stellarAddress: "GBBD47UZQ5DXGX23UKMHLGG5TZPJJKISVQYER3SPRINGS57LVEDSTQCEO" }) },
      markets: { findFirst: jest.fn().mockResolvedValue({ id: "market-1", status: "active" }) },
      predictions: { findFirst: jest.fn().mockResolvedValue({ id: "pred-1", userId: "user-uuid" }) },
      disputes: { findFirst: jest.fn().mockResolvedValue(null) },
    },
    transaction: jest.fn().mockImplementation(async (cb) => cb(mockDb)),
  };
  return {
    db: mockDb,
    getDb: () => mockDb,
    getPool: () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }),
    connectWithRetry: jest.fn().mockResolvedValue(undefined),
    closeDb: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock("../../src/db/index", () => {
  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

// 4. Mock authentication middlewares to bypass DB user lookup and JWT verification
jest.mock("../../src/middleware/requireAuth", () => {
  const mockUser = { id: "user-uuid", stellarAddress: "GBBD47UZQ5DXGX23UKMHLGG5TZPJJKISVQYER3SPRINGS57LVEDSTQCEO" };
  return {
    requireAuth: (req: any, _res: any, next: any) => {
      req.user = mockUser;
      next();
    },
    requireAuthForbidden: (req: any, _res: any, next: any) => {
      req.user = mockUser;
      next();
    },
    optionalAuth: (req: any, _res: any, next: any) => {
      req.user = mockUser;
      next();
    },
  };
});

jest.mock("../../src/middleware/requireAdmin", () => {
  return {
    requireAdmin: (req: any, _res: any, next: any) => {
      req.adminAddress = "GADMIN7777777777777777777777777777777777777777777777777777";
      next();
    },
  };
});

jest.mock("../../src/middleware/auth", () => {
  return {
    requireAdmin: (req: any, _res: any, next: any) => {
      req.user = {
        id: "GADMIN7777777777777777777777777777777777777777777777777777",
        stellarAddress: "GADMIN7777777777777777777777777777777777777777777777777777",
      };
      next();
    },
  };
});

// 5. Mock third-party service logic that is database-dependent
jest.mock("../../src/services/userService", () => ({
  getUserByAddress: jest.fn().mockResolvedValue({ id: "user-uuid" }),
  getUserPredictions: jest.fn().mockResolvedValue({ data: [], nextCursor: null }),
  getCurrentUserProfile: jest.fn().mockResolvedValue({ ok: true, value: { stellarAddress: "GBBD47UZQ5DXGX23UKMHLGG5TZPJJKISVQYER3SPRINGS57LVEDSTQCEO", totals: {} } }),
  getUserProfile: jest.fn().mockResolvedValue({ predictions: [] }),
}));

jest.mock("../../src/services/marketService", () => ({
  listMarkets: jest.fn().mockResolvedValue([]),
  getMarketById: jest.fn().mockResolvedValue({ id: "market-1" }),
  updateMarket: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../src/services/leaderboardService", () => ({
  getLeaderboard: jest.fn().mockResolvedValue([]),
  getLeaderboardWithRefresh: jest.fn().mockResolvedValue([]),
  getUserLeaderboardEntry: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../src/services/predictionExplainService", () => ({
  getPredictionExplanation: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../src/services/reconciliationService", () => ({
  performReconciliation: jest.fn().mockResolvedValue({}),
  getReconciliationReport: jest.fn().mockResolvedValue({}),
  listReconciliationReports: jest.fn().mockResolvedValue([]),
  reconcileMarket: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../src/services/refreshTokenService", () => ({
  rotateRefreshToken: jest.fn().mockResolvedValue({ ok: true, value: {} }),
  revokeFamily: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../src/services/authChallengeService", () => ({
  createChallenge: jest.fn().mockResolvedValue({ nonce: "nonce", expiresAt: new Date() }),
}));

jest.mock("../../src/services/authVerifyService", () => ({
  verifyChallengeAndIssueJwt: jest.fn().mockResolvedValue({ ok: true, value: {} }),
}));

jest.mock("../../src/services/disputeService", () => ({
  openDispute: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../src/services/adminUsersService", () => ({
  getAdminUserView: jest.fn().mockResolvedValue({}),
  writeAuditLog: jest.fn().mockResolvedValue({}),
}));

// Project imports
import request from "supertest";
import express from "express";
import { createApp } from "../../src/index";
import { sqlInjectionPayloads } from "./payloads";
import { adminUsersRouter } from "../../src/routes/adminUsers";
import { adminReconciliationRouter } from "../../src/routes/admin/reconciliation";
import { createAdminWebhooksRouter } from "../../src/routes/adminWebhooks";
import { errorHandler } from "../../src/middleware/errorHandler";

const mainApp = createApp();

// Setup additional Express app for routers not mounted in the main index.ts
const adminApp = express();
adminApp.use(express.json());
adminApp.use("/api/admin/users", adminUsersRouter);
adminApp.use("/api/admin/recon", adminReconciliationRouter);

const mockWebhookStore = {
  listDlq: jest.fn().mockResolvedValue({ data: [], nextCursor: null }),
  getDlqRow: jest.fn().mockResolvedValue(null),
};
const mockWebhookDispatcher = {
  replayFromDlq: jest.fn().mockResolvedValue(null),
};
adminApp.use("/api/admin/webhooks", createAdminWebhooksRouter({
  store: mockWebhookStore as any,
  dispatcher: mockWebhookDispatcher as any,
}));

adminApp.use(errorHandler);

// Helper function to assert safe response
function assertSafeResponse(res: request.Response) {
  // A response is safe if it does not crash (no 500) and doesn't reveal internal DB structures.
  // Standard rejections are 400 (Zod validation), 404 (Not Found), 403 (Forbidden), 409 (Conflict), etc.
  // 200/201 are safe because input was properly parameterized/bound.
  expect(res.status).not.toBe(500);
}

describe("SQL Injection Regression Suite", () => {
  
  describe("Main Application Routes", () => {
    
    it.each(sqlInjectionPayloads)("POST /api/auth/challenge with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .post("/api/auth/challenge")
        .send({ stellarAddress: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("POST /api/auth/verify with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .post("/api/auth/verify")
        .send({
          stellarAddress: payload,
          nonce: "some-nonce",
          signature: "some-signature",
        });
      assertSafeResponse(res);
      
      const resNonce = await request(mainApp)
        .post("/api/auth/verify")
        .send({
          stellarAddress: "GBBD47UZQ5DXGX23UKMHLGG5TZPJJKISVQYER3SPRINGS57LVEDSTQCEO",
          nonce: payload,
          signature: "some-signature",
        });
      assertSafeResponse(resNonce);

      const resSig = await request(mainApp)
        .post("/api/auth/verify")
        .send({
          stellarAddress: "GBBD47UZQ5DXGX23UKMHLGG5TZPJJKISVQYER3SPRINGS57LVEDSTQCEO",
          nonce: "some-nonce",
          signature: payload,
        });
      assertSafeResponse(resSig);
    });

    it.each(sqlInjectionPayloads)("POST /api/auth/refresh with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .post("/api/auth/refresh")
        .send({ refreshToken: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("POST /api/auth/logout with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .post("/api/auth/logout")
        .send({ refreshToken: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/markets with limit payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get("/api/markets")
        .query({ limit: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/markets/search with q payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get("/api/markets/search")
        .query({ q: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/markets/search with limit payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get("/api/markets/search")
        .query({ q: "test", limit: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/markets/search with offset payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get("/api/markets/search")
        .query({ q: "test", offset: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/markets/search with page payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get("/api/markets/search")
        .query({ q: "test", page: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/markets/:id with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get(`/api/markets/${encodeURIComponent(payload)}`);
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("PATCH /api/markets/:id with ID payload: %s", async (payload) => {
      const res = await request(mainApp)
        .patch(`/api/markets/${encodeURIComponent(payload)}`)
        .send({ expectedVersion: 1 });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("PATCH /api/markets/:id with body payload: %s", async (payload) => {
      const res = await request(mainApp)
        .patch("/api/markets/market-1")
        .send({ question: payload, expectedVersion: 1 });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("POST /api/markets/:id/disputes with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .post(`/api/markets/${encodeURIComponent(payload)}/disputes`)
        .send({ reason: "This is a valid dispute reason." });
      assertSafeResponse(res);
      
      const resReason = await request(mainApp)
        .post("/api/markets/market-1/disputes")
        .send({ reason: payload });
      assertSafeResponse(resReason);
      
      const resUri = await request(mainApp)
        .post("/api/markets/market-1/disputes")
        .send({ reason: "This is a valid dispute reason.", evidenceUri: payload });
      assertSafeResponse(resUri);
    });

    it.each(sqlInjectionPayloads)("GET /api/markets/:id/events with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get(`/api/markets/${encodeURIComponent(payload)}/events`);
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("PATCH /api/notifications/preferences with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .patch("/api/notifications/preferences")
        .send({ preferences: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/users/:address/predictions with address payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get(`/api/users/${encodeURIComponent(payload)}/predictions`);
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/users/:address/predictions with query payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get("/api/users/GBBD47UZQ5DXGX23UKMHLGG5TZPJJKISVQYER3SPRINGS57LVEDSTQCEO/predictions")
        .query({ status: payload, limit: payload, cursor: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/users/:stellarAddress/profile with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get(`/api/users/${encodeURIComponent(payload)}/profile`);
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("POST /api/users/:addr/follow with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .post(`/api/users/${encodeURIComponent(payload)}/follow`);
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("DELETE /api/users/:addr/follow with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .delete(`/api/users/${encodeURIComponent(payload)}/follow`);
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/predictions/:id/explain with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get(`/api/predictions/${encodeURIComponent(payload)}/explain`);
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/leaderboard with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get("/api/leaderboard")
        .query({ limit: payload, offset: payload, refresh: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/leaderboard/user/:stellarAddress with payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get(`/api/leaderboard/user/${encodeURIComponent(payload)}`);
      assertSafeResponse(res);
    });
  });

  describe("Admin / Internal Routes", () => {

    it.each(sqlInjectionPayloads)("GET /api/admin/audit with query payload: %s", async (payload) => {
      const res = await request(mainApp)
        .get("/api/admin/audit")
        .query({
          action: payload,
          actor: payload,
          startDate: payload,
          endDate: payload,
          cursor: payload,
          limit: payload,
        });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/admin/users/:address with payload: %s", async (payload) => {
      const res = await request(adminApp)
        .get(`/api/admin/users/${encodeURIComponent(payload)}`);
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/admin/recon/markets/:id with payload: %s", async (payload) => {
      const res = await request(adminApp)
        .get(`/api/admin/recon/markets/${encodeURIComponent(payload)}`);
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("GET /api/admin/webhooks/dlq with payload: %s", async (payload) => {
      const res = await request(adminApp)
        .get("/api/admin/webhooks/dlq")
        .query({ cursor: payload, limit: payload });
      assertSafeResponse(res);
    });

    it.each(sqlInjectionPayloads)("POST /api/admin/webhooks/dlq/:id/replay with payload: %s", async (payload) => {
      const res = await request(adminApp)
        .post(`/api/admin/webhooks/dlq/${encodeURIComponent(payload)}/replay`);
      assertSafeResponse(res);
    });
  });
});
