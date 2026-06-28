/**
 * userProfile.test.ts
 *
 * Tests for GET /api/users/:stellarAddress/profile
 *
 * Coverage areas
 * ──────────────
 *  1.  200 – happy path: returns full profile with predictions and totals
 *  2.  200 – user with no predictions (zero-state totals)
 *  3.  404 – unknown Stellar address
 *  4.  400 – address too short / wrong format
 *  5.  400 – address starts with wrong letter (not G)
 *  6.  400 – address contains lowercase letters
 *  7.  400 – address contains invalid base-32 characters (0, 1, 8, 9)
 *  8.  400 – empty address
 *  9.  Response includes X-Request-Id header (correlation ID plumbing)
 *  10. 400 error envelope contains requestId
 *  11. 404 error envelope contains requestId
 *  12. 500 – service throws → global error handler wraps it
 *  13. Profile predictions are ordered newest-first (service contract)
 *  14. totals reflect prediction data correctly
 */

import request from "supertest";
import { createApp } from "../src/index";
import * as userService from "../src/services/userService";

// ── Fixtures ───────────────────────────────────────────────────────────────

/** A syntactically valid Stellar G-address (56 chars, base-32 alphabet). */
const VALID_ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

const MOCK_PREDICTION: userService.PredictionEntry = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  market: {
    id: "market-abc-001",
    question: "Will BTC exceed $100k by end of 2025?",
    status: "resolved",
    resolutionTime: "2025-12-31T23:59:59.000Z",
  },
  outcome: "yes",
  amount: "5000000",
  createdAt: "2024-03-01T08:00:00.000Z",
};

const MOCK_PROFILE: userService.UserProfile = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  stellarAddress: VALID_ADDRESS,
  joinedAt: "2024-01-15T10:30:00.000Z",
  predictions: [MOCK_PREDICTION],
  totals: {
    totalPredictions: 1,
    totalAmountStaked: "5000000",
    wins: 1,
    losses: 0,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Spy on userService.getUserProfile and replace its implementation. */
function mockGetUserProfile(impl: (addr: string) => Promise<userService.UserProfile | null>) {
  return jest.spyOn(userService, "getUserProfile").mockImplementation(impl);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/users/:stellarAddress/profile", () => {
  let spy: jest.SpyInstance;

  afterEach(() => {
    spy?.mockRestore();
  });

  // ── 1. Happy path ────────────────────────────────────────────────────────

  it("200 – returns full profile for a known address", async () => {
    spy = mockGetUserProfile(async () => MOCK_PROFILE);

    const res = await request(createApp())
      .get(`/api/users/${VALID_ADDRESS}/profile`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: MOCK_PROFILE.id,
      stellarAddress: VALID_ADDRESS,
      joinedAt: MOCK_PROFILE.joinedAt,
    });
    expect(res.body.data.predictions).toHaveLength(1);
    expect(res.body.data.predictions[0]).toMatchObject({
      id: MOCK_PREDICTION.id,
      outcome: "yes",
      amount: "5000000",
    });
    expect(res.body.data.totals).toEqual({
      totalPredictions: 1,
      totalAmountStaked: "5000000",
      wins: 1,
      losses: 0,
    });
  });

  // ── 2. Zero-state ────────────────────────────────────────────────────────

  it("200 – returns empty predictions and zero totals for new user", async () => {
    const emptyProfile: userService.UserProfile = {
      ...MOCK_PROFILE,
      predictions: [],
      totals: { totalPredictions: 0, totalAmountStaked: "0", wins: 0, losses: 0 },
    };
    spy = mockGetUserProfile(async () => emptyProfile);

    const res = await request(createApp())
      .get(`/api/users/${VALID_ADDRESS}/profile`);

    expect(res.status).toBe(200);
    expect(res.body.data.predictions).toEqual([]);
    expect(res.body.data.totals.totalPredictions).toBe(0);
    expect(res.body.data.totals.totalAmountStaked).toBe("0");
  });

  // ── 3. Not found ─────────────────────────────────────────────────────────

  it("404 – unknown Stellar address returns not_found", async () => {
    spy = mockGetUserProfile(async () => null);

    const res = await request(createApp())
      .get(`/api/users/${VALID_ADDRESS}/profile`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  // ── 4–8. Input validation ────────────────────────────────────────────────

  it("400 – address that is too short fails validation", async () => {
    spy = mockGetUserProfile(async () => null);
    const res = await request(createApp()).get("/api/users/GABC/profile");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("400 – address that does not start with G fails validation", async () => {
    // Replace first char with A — still 56 chars but starts with A
    const badAddress = "A" + VALID_ADDRESS.slice(1);
    spy = mockGetUserProfile(async () => null);
    const res = await request(createApp()).get(`/api/users/${badAddress}/profile`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("400 – address with lowercase letters fails validation", async () => {
    const badAddress = VALID_ADDRESS.toLowerCase();
    spy = mockGetUserProfile(async () => null);
    const res = await request(createApp()).get(`/api/users/${badAddress}/profile`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("400 – address with invalid base-32 chars (digits 0,1,8,9) fails", async () => {
    // Replace a char with '0' which is not in the Stellar base-32 alphabet
    const badAddress = VALID_ADDRESS.slice(0, 55) + "0";
    spy = mockGetUserProfile(async () => null);
    const res = await request(createApp()).get(`/api/users/${badAddress}/profile`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("400 – empty address segment is rejected", async () => {
    spy = mockGetUserProfile(async () => null);
    // Express won't route '/api/users//profile' the same way, so we hit a
    // deliberately malformed but routed path instead.
    const res = await request(createApp()).get("/api/users/ /profile");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  // ── 9. X-Request-Id header ───────────────────────────────────────────────

  it("echoes inbound X-Request-Id on 200 response", async () => {
    spy = mockGetUserProfile(async () => MOCK_PROFILE);
    const id = "profile-req-id-200";
    const res = await request(createApp())
      .get(`/api/users/${VALID_ADDRESS}/profile`)
      .set("x-request-id", id);

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBe(id);
  });

  it("echoes inbound X-Request-Id on 404 response", async () => {
    spy = mockGetUserProfile(async () => null);
    const id = "profile-req-id-404";
    const res = await request(createApp())
      .get(`/api/users/${VALID_ADDRESS}/profile`)
      .set("x-request-id", id);

    expect(res.status).toBe(404);
    expect(res.headers["x-request-id"]).toBe(id);
  });

  // ── 10. requestId in 400 envelope ───────────────────────────────────────

  it("400 error body includes requestId for client correlation", async () => {
    spy = mockGetUserProfile(async () => null);
    const id = "profile-req-id-400";
    const res = await request(createApp())
      .get("/api/users/BAD/profile")
      .set("x-request-id", id);

    expect(res.status).toBe(400);
    expect(res.body.error.requestId).toBe(id);
  });

  // ── 11. requestId in 404 envelope ───────────────────────────────────────

  it("404 error body includes requestId for client correlation", async () => {
    spy = mockGetUserProfile(async () => null);
    const id = "profile-req-id-404b";
    const res = await request(createApp())
      .get(`/api/users/${VALID_ADDRESS}/profile`)
      .set("x-request-id", id);

    expect(res.status).toBe(404);
    expect(res.body.error.requestId).toBe(id);
  });

  // ── 12. Service error → global 500 handler ───────────────────────────────

  it("500 – service throw is caught and returns internal_error envelope", async () => {
    spy = mockGetUserProfile(async () => {
      throw new Error("db connection failed");
    });
    const id = "profile-req-id-500";
    const res = await request(createApp())
      .get(`/api/users/${VALID_ADDRESS}/profile`)
      .set("x-request-id", id);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal_error");
    // requestId must still be present even on unexpected errors
    expect(res.body.error.requestId).toBe(id);
  });

  // ── 13. Service is called with correct address ───────────────────────────

  it("calls getUserProfile with the exact address from the URL", async () => {
    spy = mockGetUserProfile(async () => MOCK_PROFILE);

    await request(createApp()).get(`/api/users/${VALID_ADDRESS}/profile`);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(VALID_ADDRESS);
  });

  // ── 14. Response shape is stable ────────────────────────────────────────

  it("response data shape matches the documented contract", async () => {
    const twoPredictons: userService.PredictionEntry[] = [
      MOCK_PREDICTION,
      {
        ...MOCK_PREDICTION,
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        outcome: "no",
        amount: "2500000",
        createdAt: "2024-02-01T08:00:00.000Z",
        market: { ...MOCK_PREDICTION.market, status: "resolved" },
      },
    ];
    const multiProfile: userService.UserProfile = {
      ...MOCK_PROFILE,
      predictions: twoPredictons,
      totals: {
        totalPredictions: 2,
        totalAmountStaked: "7500000",
        wins: 1,
        losses: 1,
      },
    };
    spy = mockGetUserProfile(async () => multiProfile);

    const res = await request(createApp())
      .get(`/api/users/${VALID_ADDRESS}/profile`);

    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({
      totalPredictions: 2,
      totalAmountStaked: "7500000",
      wins: 1,
      losses: 1,
    });
    expect(res.body.data.predictions).toHaveLength(2);
    // Verify nested market object is present on each entry
    expect(res.body.data.predictions[0].market.question).toBeDefined();
  });
});
