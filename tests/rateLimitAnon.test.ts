/**
 * Tests for anonymous sliding-window rate limiting.
 *
 * Covers acceptance criteria:
 *  - Window enforced (429 after max requests)
 *  - Retry-After header on 429
 *  - X-Forwarded-For handled safely when TRUST_PROXY is enabled
 *  - Authenticated Bearer callers bypass the limiter
 *  - Standard error envelope with rate_limit_exceeded code
 */

import request from "supertest";
import express from "express";
import {
  SlidingWindowStore,
  createRateLimitAnon,
  extractClientIp,
  isAuthenticatedRequest,
  isValidIp,
  normalizeIp,
  retryAfterSeconds,
} from "../src/middleware/rateLimitAnon";
import { requestContextStorage } from "../src/lib/requestContext";
import type { Request } from "express";

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    path: "/api/markets",
    method: "GET",
    socket: { remoteAddress: "127.0.0.1" },
    ip: "127.0.0.1",
    ...overrides,
  } as Request;
}

function makeApp(limit = 3, windowMs = 60_000, trustProxy = false, store = new SlidingWindowStore()) {
  const app = express();
  app.use((_req, _res, next) => {
    requestContextStorage.run({ requestId: "test-req-id" }, next);
  });
  app.use(
    createRateLimitAnon({
      windowMs,
      max: limit,
      trustProxy,
      store,
    }),
  );
  app.get("/api/markets", (_req, res) => {
    res.json({ data: [] });
  });
  app.get("/api/leaderboard", (_req, res) => {
    res.json({ data: [] });
  });
  return { app, store };
}

describe("rateLimitAnon helpers", () => {
  it("normalises IPv4-mapped IPv6 addresses", () => {
    expect(normalizeIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
  });

  it("validates IPv4 and rejects garbage", () => {
    expect(isValidIp("192.168.1.1")).toBe(true);
    expect(isValidIp("999.999.999.999")).toBe(false);
    expect(isValidIp("not-an-ip")).toBe(false);
  });

  it("detects authenticated requests via Bearer token", () => {
    expect(isAuthenticatedRequest(makeReq())).toBe(false);
    expect(
      isAuthenticatedRequest(
        makeReq({ headers: { authorization: "Bearer eyJhbG..." } }),
      ),
    ).toBe(true);
    expect(
      isAuthenticatedRequest(makeReq({ headers: { authorization: "Basic abc" } })),
    ).toBe(false);
  });

  it("computes retry-after from oldest timestamp in window", () => {
    const now = 1_000_000;
    const windowMs = 60_000;
    expect(retryAfterSeconds(now - 30_000, now, windowMs)).toBe(30);
    expect(retryAfterSeconds(now - 59_999, now, windowMs)).toBe(1);
  });
});

describe("SlidingWindowStore", () => {
  it("drops timestamps outside the window", () => {
    const store = new SlidingWindowStore();
    const windowMs = 1_000;
    const now = 10_000;

    store.record("1.2.3.4", now - 2_000, windowMs);
    store.record("1.2.3.4", now - 500, windowMs);

    const active = store.getTimestamps("1.2.3.4", now, windowMs);
    expect(active).toEqual([now - 500]);
  });

  it("removes empty buckets and supports clear()", () => {
    const store = new SlidingWindowStore();
    store.record("1.2.3.4", 100, 1_000);
    store.getTimestamps("1.2.3.4", 2_000, 1_000);
    store.clear();
    expect(store.getTimestamps("1.2.3.4", 3_000, 1_000)).toEqual([]);
  });
});

describe("extractClientIp", () => {
  it("uses socket remoteAddress when trust proxy is disabled", () => {
    const ip = extractClientIp(
      makeReq({
        headers: { "x-forwarded-for": "203.0.113.50" },
        socket: { remoteAddress: "10.0.0.5" } as Request["socket"],
      }),
      false,
    );
    expect(ip).toBe("10.0.0.5");
  });

  it("honours first valid hop in X-Forwarded-For when trust proxy is enabled", () => {
    const ip = extractClientIp(
      makeReq({
        headers: { "x-forwarded-for": "203.0.113.50, 10.0.0.1" },
        socket: { remoteAddress: "10.0.0.5" } as Request["socket"],
      }),
      true,
    );
    expect(ip).toBe("203.0.113.50");
  });

  it("ignores invalid X-Forwarded-For values and falls back to socket IP", () => {
    const ip = extractClientIp(
      makeReq({
        headers: { "x-forwarded-for": "not-an-ip" },
        socket: { remoteAddress: "127.0.0.1" } as Request["socket"],
      }),
      true,
    );
    expect(ip).toBe("127.0.0.1");
  });

  it("does not trust spoofed X-Forwarded-For when trust proxy is disabled", () => {
    const ip = extractClientIp(
      makeReq({
        headers: { "x-forwarded-for": "203.0.113.99" },
        socket: { remoteAddress: "127.0.0.1" } as Request["socket"],
      }),
      false,
    );
    expect(ip).toBe("127.0.0.1");
  });

  it("falls back to req.ip when socket address is missing", () => {
    const ip = extractClientIp(
      makeReq({
        socket: { remoteAddress: undefined } as unknown as Request["socket"],
        ip: "192.168.0.10",
      }),
      false,
    );
    expect(ip).toBe("192.168.0.10");
  });

  it("returns unknown when no valid IP is available", () => {
    const ip = extractClientIp(
      makeReq({
        socket: { remoteAddress: undefined } as unknown as Request["socket"],
        ip: undefined,
      }),
      false,
    );
    expect(ip).toBe("unknown");
  });

  it("validates IPv6 addresses", () => {
    expect(isValidIp("2001:db8::1")).toBe(true);
  });
});

describe("createRateLimitAnon middleware", () => {
  it("allows requests under the limit", async () => {
    const { app } = makeApp(5);
    const res = await request(app).get("/api/markets");
    expect(res.status).toBe(200);
  });

  it("returns 429 with Retry-After when the window is exceeded", async () => {
    const { app } = makeApp(2);
    await request(app).get("/api/markets");
    await request(app).get("/api/markets");
    const res = await request(app).get("/api/markets");

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(res.body).toEqual({
      error: {
        code: "rate_limit_exceeded",
        requestId: "test-req-id",
      },
    });
  });

  it("returns 429 on /api/leaderboard when limited", async () => {
    const { app } = makeApp(1);
    await request(app).get("/api/leaderboard").expect(200);
    const res = await request(app).get("/api/leaderboard");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("rate_limit_exceeded");
  });

  it("keys limits per IP", async () => {
    const store = new SlidingWindowStore();
    const { app } = makeApp(1, 60_000, false, store);

    await request(app).get("/api/markets").expect(200);
    await request(app).get("/api/markets").expect(429);
  });

  it("uses separate buckets for different forwarded client IPs", async () => {
    const { app } = makeApp(1, 60_000, true);

    await request(app)
      .get("/api/markets")
      .set("x-forwarded-for", "203.0.113.1")
      .expect(200);

    await request(app)
      .get("/api/markets")
      .set("x-forwarded-for", "203.0.113.2")
      .expect(200);

    const blocked = await request(app)
      .get("/api/markets")
      .set("x-forwarded-for", "203.0.113.1");

    expect(blocked.status).toBe(429);
  });

  it("bypasses rate limiting for Bearer-authenticated requests", async () => {
    const { app } = makeApp(1);
    await request(app).get("/api/markets").expect(200);
    await request(app).get("/api/markets").expect(429);

    const authed = await request(app)
      .get("/api/markets")
      .set("Authorization", "Bearer fake-but-present-token");

    expect(authed.status).toBe(200);
  });
});

describe("env defaults", () => {
  it("parses ANON_RATE_LIMIT_WINDOW_MS with default 60000", async () => {
    const { env } = await import("../src/config/env");
    expect(env.ANON_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it("parses ANON_RATE_LIMIT_MAX with default 60", async () => {
    const { env } = await import("../src/config/env");
    expect(env.ANON_RATE_LIMIT_MAX).toBe(60);
  });
});
