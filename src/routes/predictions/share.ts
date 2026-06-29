/**
 * predictions/share.ts
 *
 * Provides the data layer + route handler for
 *   GET /api/predictions/:id/share
 *
 * Design notes
 * ────────────
 *  • The endpoint is intentionally **public** (no auth required).  Social
 *    link-unfurling bots (Slack, Twitter/X, Discord, etc.) do not send
 *    credentials, so gating on auth would prevent any preview from rendering.
 *
 *  • Only the prediction ID is exposed — the response reveals no user PII
 *    beyond what already appears on Predictify's public market pages.
 *
 *  • All data-access logic lives in `getPredictionShareMeta` so it can be
 *    unit-tested without spinning up an Express app.
 *
 *  • The route is registered on the existing `predictionsRouter`; no new
 *    router mount is required.
 */

import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { predictions, markets } from "../../db/schema";
import { logger } from "../../config/logger";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The shape returned by `GET /api/predictions/:id/share`.
 *
 * Field names are chosen to map directly to `<meta>` property names so
 * front-ends and SSR layers can use them without further transformation.
 */
export interface PredictionShareMeta {
  /** Canonical URL for the prediction share page. */
  ogUrl: string;
  /** Human-readable share title, ready for `og:title` and `twitter:title`. */
  ogTitle: string;
  /** One-sentence description, ready for `og:description` and `twitter:description`. */
  ogDescription: string;
  /**
   * Image URL for the social card preview.
   * Defaults to the Predictify OG image; a custom per-market image may be
   * populated via `markets.metadata.ogImage` in a future iteration.
   */
  ogImage: string;
  /** Fixed card type — always `"summary_large_image"` for Twitter/X. */
  twitterCard: "summary_large_image";
  /**
   * Structured data for the front-end to build rich previews without
   * re-fetching related resources.
   */
  prediction: {
    id: string;
    outcome: string;
    amount: string;
    /** `"pending"` | `"won"` | `"lost"` */
    result: string | null;
    createdAt: string;
  };
  market: {
    id: string;
    question: string;
    status: string;
    winningOutcome: string | null;
    resolutionTime: string;
  };
}

// ---------------------------------------------------------------------------
// Repository interface — decouples service from Drizzle for testability
// ---------------------------------------------------------------------------

export interface ShareRepo {
  findPredictionWithMarket(
    predictionId: string,
  ): Promise<{ prediction: typeof predictions.$inferSelect; market: typeof markets.$inferSelect } | null>;
}

/** Production implementation backed by the shared Drizzle client. */
export class DrizzleShareRepo implements ShareRepo {
  async findPredictionWithMarket(predictionId: string) {
    const [prediction] = await db
      .select()
      .from(predictions)
      .where(eq(predictions.id, predictionId))
      .limit(1);

    if (!prediction) return null;

    const [market] = await db
      .select()
      .from(markets)
      .where(eq(markets.id, prediction.marketId))
      .limit(1);

    if (!market) return null;

    return { prediction, market };
  }
}

// ---------------------------------------------------------------------------
// Service function
// ---------------------------------------------------------------------------

/**
 * Returns social-preview metadata for a prediction.
 *
 * Throws a `ShareNotFoundError` when the prediction ID is unknown or the
 * associated market has been deleted.
 *
 * All string-building logic lives here so it can be tested independently of
 * the HTTP layer.
 *
 * @param predictionId - UUID of the prediction.
 * @param appBaseUrl   - Origin used for `ogUrl`, e.g. `"https://app.predictify.io"`.
 * @param repo         - Data access object. Defaults to `DrizzleShareRepo`.
 */
export async function getPredictionShareMeta(
  predictionId: string,
  appBaseUrl: string,
  repo: ShareRepo = new DrizzleShareRepo(),
): Promise<PredictionShareMeta> {
  const row = await repo.findPredictionWithMarket(predictionId);

  if (!row) {
    throw new ShareNotFoundError(predictionId);
  }

  const { prediction, market } = row;

  // ── Text fragments ────────────────────────────────────────────────────────

  const resultLabel = buildResultLabel(prediction.result);
  const outcomeLabel = prediction.outcome;
  const amountXLM = formatAmount(prediction.amount);

  const ogTitle = `${resultLabel} "${market.question}"`;

  const ogDescription =
    `Predicted "${outcomeLabel}" · ${amountXLM} · ` +
    buildStatusFragment(market.status, market.winningOutcome, market.resolutionTime);

  // ── Image ─────────────────────────────────────────────────────────────────

  // Prefer a per-market custom image stored in metadata, fall back to the
  // standard Predictify OG banner so every share has a visual even before
  // custom images are uploaded.
  const metadataImage =
    market.metadata && typeof market.metadata === "object"
      ? (market.metadata as Record<string, unknown>).ogImage
      : undefined;

  const ogImage =
    typeof metadataImage === "string" && metadataImage.startsWith("https://")
      ? metadataImage
      : `${appBaseUrl}/og/default.png`;

  return {
    ogUrl: `${appBaseUrl}/predictions/${predictionId}`,
    ogTitle,
    ogDescription,
    ogImage,
    twitterCard: "summary_large_image",
    prediction: {
      id: prediction.id,
      outcome: prediction.outcome,
      amount: prediction.amount,
      result: prediction.result,
      createdAt: new Date(prediction.createdAt).toISOString(),
    },
    market: {
      id: market.id,
      question: market.question,
      status: market.status,
      winningOutcome: market.winningOutcome,
      resolutionTime: new Date(market.resolutionTime).toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a raw stroops/atomic-unit amount string into "X XLM". */
export function formatAmount(raw: string): string {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return `${raw} XLM`;
  // Stellar uses 7 decimal places (1 XLM = 10_000_000 stroops).
  const xlm = (n / 10_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 7,
  });
  return `${xlm} XLM`;
}

/** Maps a `predictions.result` value to a human-readable emoji+label. */
export function buildResultLabel(result: string | null): string {
  switch (result) {
    case "won":
      return "🏆 Won";
    case "lost":
      return "❌ Lost";
    default:
      return "🔮 Predicted on";
  }
}

/** Returns a short status fragment for the description line. */
export function buildStatusFragment(
  status: string,
  winningOutcome: string | null,
  resolutionTime: string | Date,
): string {
  if (status === "resolved" && winningOutcome) {
    return `resolved → "${winningOutcome}"`;
  }
  if (status === "disputed") {
    return "under dispute";
  }
  const resolveDate = new Date(resolutionTime);
  const now = new Date();
  if (resolveDate > now) {
    return `resolves ${resolveDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return "pending resolution";
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ShareNotFoundError extends Error {
  readonly status = 404;
  readonly code = "not_found";

  constructor(predictionId: string) {
    super(`Prediction "${predictionId}" not found`);
    this.name = "ShareNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Route handler factory — inject deps for testing
// ---------------------------------------------------------------------------

export interface ShareRouteDeps {
  /** Override the default DrizzleShareRepo for tests. */
  repo?: ShareRepo;
  /**
   * Base URL prepended to canonical URLs.
   * Defaults to `APP_BASE_URL` env var or a safe fallback.
   */
  appBaseUrl?: string;
}

/**
 * Returns an Express `Router` with the share route mounted.
 * Called by `predictionsRouter` to register `GET /:id/share`.
 *
 * @example
 * // In your router file:
 * predictionsRouter.use(createShareRouter());
 *
 * // In tests:
 * predictionsRouter.use(createShareRouter({ repo: fakeRepo }));
 */
export function createShareRouter(deps: ShareRouteDeps = {}): Router {
  const router = Router({ mergeParams: true });

  const appBaseUrl =
    deps.appBaseUrl ??
    (process.env.APP_BASE_URL || "https://app.predictify.io");

  const repo = deps.repo ?? new DrizzleShareRepo();

  /**
   * GET /api/predictions/:id/share
   *
   * Returns OG + Twitter card metadata for a prediction.
   *
   * Public — no authentication required.
   */
  router.get("/:id/share", async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const reqId = String((req as unknown as Record<string, unknown>).id ?? "anon");

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: { code: "invalid_id", message: "Prediction ID is required" } });
    }

    try {
      const meta = await getPredictionShareMeta(id, appBaseUrl, repo);
      logger.debug({ reqId, predictionId: id }, "prediction.share.fetched");
      return res.status(200).json({ data: meta });
    } catch (err) {
      if (err instanceof ShareNotFoundError) {
        return res.status(404).json({ error: { code: err.code, message: err.message } });
      }
      next(err);
      return;
    }
  });

  return router;
}
