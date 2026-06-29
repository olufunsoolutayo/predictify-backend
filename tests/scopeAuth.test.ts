/**
 * tests/scopeAuth.test.ts
 * -----------------------
 * Unit tests for src/middleware/scopeAuth.ts
 *
 * Strategy: mount a tiny Express app in-process with a single probe route
 * protected by requireScope.  No DB, no real token store — just JWT signing
 * and the middleware logic.
 *
 * Covers:
 *   • No Authorization header                → 401 unauthenticated
 *   • Malformed Bearer token                 → 401 unauthenticated
 *   • Expired token                          → 401 unauthenticated
 *   • Wrong issuer / audience               → 401 unauthenticated
 *   • Valid token but missing scopes claim   → 403 insufficient_scope
 *   • Valid token with wrong scope           → 403 insufficient_scope
 *   • Valid token with exact required scope  → 200
 *   • Scope hierarchy: write satisfies read  → 200
 *   • Scope hierarchy: admin satisfies write → 200
 *   • Scope hierarchy: admin satisfies read  → 200
 *   • req.apiKeyScopes is populated          → reflected in response
 *   • requireScope("admin") enforced         → 403 for read-only token
 */

// ── Set env vars before any project module is loaded ────────────────────────
const TEST_SECRET = "scopeauth-test-secret-at-least-32-bytes!!";
const TEST_ISSUER = "predictify";
const TEST_AUDIENCE = "predictify-app";

process.env.NODE_ENV = "test";
process.env.PORT = "3002";
process.env.LOG_LEVEL = "silent";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.JWT_SECRET = TEST_SECRET;
process.env.JWT_ISSUER = TEST_ISSUER;
process.env.JWT_AUDIENCE = TEST_AUDIENCE;
process.env.JWT_TTL_SECONDS = "3600";
process.env.STELLAR_NETWORK = "testnet";
process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
process.env.HORIZON_URL = "https://horizon-testnet.stellar.org";
process.env.PREDICTIFY_CONTRACT_ID = "CTEST";

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { requireScope, type ApiScope } from "../src/middleware/scopeAuth";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Sign a valid JWT with the given scopes (or none). */
function signToken(scopes?: string[], opts: jwt.SignOptions = {}): string {
  const payload: Record<string, unknown> = {};
  if (scopes !== undefined) {
    payload.scopes = scopes;
  }
  return jwt.sign(payload, TEST_SECRET, {
    algorithm: "HS256",
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    expiresIn: 3600,
    ...opts,
  });
}

/**
 * Creates a minimal Express app with one probe route protected by
 * requireScope(required).  The handler echoes req.apiKeyScopes so tests can
 * inspect them.
 */
function buildApp(required: ApiScope) {
  const app = express();
  app.get(
    "/probe",
    requireScope(required),
    (req: express.Request, res: express.Response) => {
      res.json({ ok: true, scopes: req.apiKeyScopes ?? null });
    },
  );
  return app;
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe("requireScope — authentication failures (no/bad token)", () => {
  const app = buildApp("read");

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(app).get("/probe");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("returns 401 when Authorization header lacks Bearer prefix", async () => {
    const res = await request(app)
      .get("/probe")
      .set("Authorization", "Token abc123");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("returns 401 for a completely invalid token string", async () => {
    const res = await request(app)
      .get("/probe")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("returns 401 for an expired token", async () => {
    const token = signToken(["read"], { expiresIn: -1 });
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("returns 401 for a token signed with the wrong secret", async () => {
    const token = jwt.sign(
      { scopes: ["read"] },
      "totally-different-secret-but-long-enough!!",
      { algorithm: "HS256", issuer: TEST_ISSUER, audience: TEST_AUDIENCE },
    );
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("returns 401 for a token with the wrong issuer", async () => {
    const token = signToken(["read"], { issuer: "evil-issuer" });
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("returns 401 for a token with the wrong audience", async () => {
    const token = signToken(["read"], { audience: "wrong-audience" });
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });
});

describe("requireScope — missing / wrong scope (token valid, scope insufficient)", () => {
  it("returns 403 when token has no scopes claim", async () => {
    const app = buildApp("read");
    const token = signToken(undefined); // no scopes field at all
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scope");
    expect(res.body.error.required).toBe("read");
  });

  it("returns 403 when token has empty scopes array", async () => {
    const app = buildApp("read");
    const token = signToken([]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scope");
  });

  it("returns 403 when token has read scope but write is required", async () => {
    const app = buildApp("write");
    const token = signToken(["read"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scope");
    expect(res.body.error.required).toBe("write");
  });

  it("returns 403 when token has write scope but admin is required", async () => {
    const app = buildApp("admin");
    const token = signToken(["write"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scope");
    expect(res.body.error.required).toBe("admin");
  });

  it("returns 403 when token has read scope but admin is required", async () => {
    const app = buildApp("admin");
    const token = signToken(["read"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scope");
  });

  it("strips unknown scope values from scopes claim — unknown scope does not satisfy read", async () => {
    const app = buildApp("read");
    // "superuser" is not in ApiScope union; should be ignored
    const token = signToken(["superuser"] as string[]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scope");
  });
});

describe("requireScope — exact scope match (200)", () => {
  it("passes when token has read and read is required", async () => {
    const app = buildApp("read");
    const token = signToken(["read"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("passes when token has write and write is required", async () => {
    const app = buildApp("write");
    const token = signToken(["write"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("passes when token has admin and admin is required", async () => {
    const app = buildApp("admin");
    const token = signToken(["admin"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("requireScope — scope hierarchy (supersets satisfy subsets)", () => {
  it("write scope satisfies read requirement", async () => {
    const app = buildApp("read");
    const token = signToken(["write"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("admin scope satisfies write requirement", async () => {
    const app = buildApp("write");
    const token = signToken(["admin"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("admin scope satisfies read requirement", async () => {
    const app = buildApp("read");
    const token = signToken(["admin"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("requireScope — scope intersection (multiple scopes in token)", () => {
  it("token with both read and write passes a write-protected route", async () => {
    const app = buildApp("write");
    const token = signToken(["read", "write"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("token with read and unknown scope only passes read-protected route", async () => {
    const readApp = buildApp("read");
    const writeApp = buildApp("write");
    const token = signToken(["read", "superuser"] as string[]);

    const readRes = await request(readApp)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(readRes.status).toBe(200);

    const writeRes = await request(writeApp)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(writeRes.status).toBe(403);
  });
});

describe("requireScope — req.apiKeyScopes population", () => {
  it("attaches the parsed scopes array to req.apiKeyScopes on success", async () => {
    const app = buildApp("read");
    const token = signToken(["read", "write"]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.scopes).toEqual(["read", "write"]);
  });

  it("filters unknown scope values from req.apiKeyScopes", async () => {
    const app = buildApp("read");
    const token = signToken(["read", "superuser", "write"] as string[]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    // "superuser" is stripped; only known scopes survive
    expect(res.body.scopes).toEqual(["read", "write"]);
  });

  it("attaches an empty array when scopes claim is an empty array", async () => {
    const app = buildApp("read");
    const token = signToken([]);
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    // 403 because empty scopes, but we test that apiKeyScopes is not populated
    // (req.apiKeyScopes is set before the scope check so it's [] on the way out,
    // but since the handler never runs we verify the 403 shape instead)
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scope");
  });
});

describe("requireScope — non-array scopes claim treated as no scopes", () => {
  it("returns 403 when scopes claim is a string (not an array)", async () => {
    const app = buildApp("read");
    // Manually craft a token where scopes is a plain string
    const token = jwt.sign(
      { scopes: "read" },
      TEST_SECRET,
      { algorithm: "HS256", issuer: TEST_ISSUER, audience: TEST_AUDIENCE, expiresIn: 3600 },
    );
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scope");
  });

  it("returns 403 when scopes claim is a number", async () => {
    const app = buildApp("read");
    const token = jwt.sign(
      { scopes: 1 },
      TEST_SECRET,
      { algorithm: "HS256", issuer: TEST_ISSUER, audience: TEST_AUDIENCE, expiresIn: 3600 },
    );
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
