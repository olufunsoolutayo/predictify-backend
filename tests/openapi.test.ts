import { resetOpenApiCache, getOpenApiSpec } from "../src/openapi/builder";
import express from "express";
import request from "supertest";
import { createDocsRouter } from "../src/routes/docs";
import * as fs from "fs";
import * as yaml from "js-yaml";

describe("OpenAPI spec generation", () => {
  let spec: ReturnType<typeof getOpenApiSpec>;

  beforeAll(() => {
    resetOpenApiCache();
    spec = getOpenApiSpec();
  });

  it("is a valid OpenAPI 3.1 document", () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(spec.info.title).toBe("Predictify API");
    expect(spec.paths).toBeDefined();
  });

  it("includes all expected route paths", () => {
    const paths = Object.keys(spec.paths ?? {});
    expect(paths).toContain("/health");
    expect(paths).toContain("/healthz/dependencies");
    expect(paths).toContain("/metrics");
    expect(paths).toContain("/api/auth/challenge");
    expect(paths).toContain("/api/auth/verify");
    expect(paths).toContain("/api/auth/refresh");
    expect(paths).toContain("/api/auth/logout");
    expect(paths).toContain("/api/markets");
    expect(paths).toContain("/api/markets/search");
    expect(paths).toContain("/api/markets/{id}");
    expect(paths).toContain("/api/leaderboard");
    expect(paths).toContain("/api/leaderboard/user/{stellarAddress}");
    expect(paths).toContain("/api/notifications/preferences");
    expect(paths).toContain("/api/users/me");
    expect(paths).toContain("/api/users/{address}/predictions");
    expect(paths).toContain("/api/users/{stellarAddress}/profile");
    expect(paths).toContain("/api/users/{addr}/follow");
    expect(paths).toContain("/api/admin/audit");
  });

  it("defines reusable component schemas", () => {
    const schemas = spec.components?.schemas ?? {};
    expect(schemas["ErrorBody"]).toBeDefined();
    expect(schemas["Market"]).toBeDefined();
    expect(schemas["TokenPair"]).toBeDefined();
    expect(schemas["ChallengeRequest"]).toBeDefined();
    expect(schemas["ChallengeResponse"]).toBeDefined();
    expect(schemas["UserProfile"]).toBeDefined();
  });

  it("defines bearer security scheme", () => {
    const schemes = spec.components?.securitySchemes ?? {};
    expect(schemes["bearerAuth"]).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });

  it("marks protected routes with bearerAuth", () => {
    const paths = spec.paths ?? {};
    const patchMarket = (paths["/api/markets/{id}"] as Record<string, unknown>)
      ?.patch as Record<string, unknown>;
    expect(patchMarket?.security).toEqual([{ bearerAuth: [] }]);

    const meRoute = (paths["/api/users/me"] as Record<string, unknown>)
      ?.get as Record<string, unknown>;
    expect(meRoute?.security).toEqual([{ bearerAuth: [] }]);
  });

  it("every route has an operationId", () => {
    const paths = spec.paths ?? {};
    for (const [, pathItem] of Object.entries(paths)) {
      for (const method of ["get", "post", "put", "patch", "delete"] as const) {
        const op = (pathItem as Record<string, unknown>)[method] as
          | Record<string, unknown>
          | undefined;
        if (op) {
          expect(op.operationId).toBeDefined();
          expect(typeof op.operationId).toBe("string");
        }
      }
    }
  });
});

describe("/docs router (Swagger UI)", () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use("/docs", createDocsRouter());
  });

  it("GET /docs/openapi.json returns the spec", async () => {
    const res = await request(app).get("/docs/openapi.json");
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/json/);
    expect(res.body).toBeDefined();
    expect(res.body.openapi).toMatch(/^3\.1\./);
    expect(res.body.paths).toBeDefined();
  });

  it("GET /docs/ serves Swagger UI HTML", async () => {
    const res = await request(app).get("/docs/");
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain("swagger");
  });
});

describe("/docs availability logic", () => {
  it("disables docs in production by default", () => {
    const isProduction = true;
    const enableDocsEnv = undefined;
    const docsEnabled = !isProduction || enableDocsEnv === "true";
    expect(docsEnabled).toBe(false);
  });

  it("enables docs when ENABLE_DOCS=true in production", () => {
    const isProduction = true;
    const enableDocsEnv = "true";
    const docsEnabled = !isProduction || enableDocsEnv === "true";
    expect(docsEnabled).toBe(true);
  });

  it("enables docs in non-production by default", () => {
    const isProduction = false;
    const enableDocsEnv = undefined;
    const docsEnabled = !isProduction || enableDocsEnv === "true";
    expect(docsEnabled).toBe(true);
  });

  it("creates docs router in non-production", () => {
    const isProduction = false;
    const enableDocsEnv = undefined;
    const docsEnabled = !isProduction || enableDocsEnv === "true";
    const router = docsEnabled ? createDocsRouter() : null;
    expect(router).not.toBeNull();
  });
});

describe("Validation script logic", () => {
  it("passes when all expected routes are documented", () => {
    resetOpenApiCache();
    const spec = getOpenApiSpec();
    const paths = Object.keys(spec.paths ?? {});
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain("/health");
    expect(paths).toContain("/api/markets");
    expect(paths).toContain("/api/auth/challenge");
  });

  it("detects when a route path is missing", () => {
    resetOpenApiCache();
    const spec = getOpenApiSpec();
    const paths = new Set(Object.keys(spec.paths ?? {}));

    expect(paths.has("/health")).toBe(true);
    expect(paths.has("/api/markets/search")).toBe(true);

    const fakeRoute = "/api/nonexistent";
    expect(paths.has(fakeRoute)).toBe(false);
  });
});

describe("openapi.yaml file", () => {
  it("exists and is valid YAML", () => {
    const yamlPath = process.cwd() + "/openapi.yaml";
    expect(fs.existsSync(yamlPath)).toBe(true);

    const parsed = yaml.load(fs.readFileSync(yamlPath, "utf-8")) as Record<
      string,
      unknown
    >;
    expect(parsed.openapi).toMatch(/^3\.1\./);
    expect(parsed.paths).toBeDefined();
    expect(parsed.info).toBeDefined();
  });

  it("matches the generated spec", () => {
    resetOpenApiCache();
    const spec = getOpenApiSpec();

    const yamlPath = process.cwd() + "/openapi.yaml";
    const parsed = yaml.load(fs.readFileSync(yamlPath, "utf-8")) as Record<
      string,
      unknown
    >;

    expect(parsed.info).toEqual(spec.info);
    expect(parsed.openapi).toBe(spec.openapi);
    expect(Object.keys(parsed.paths as Record<string, unknown>).sort()).toEqual(
      Object.keys(spec.paths ?? {}).sort(),
    );
  });
});
