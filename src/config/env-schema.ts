import { z } from "zod";

export const envSchema = z.object({
  // ── Application ───────────────────────────────────────────
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // ── Database ──────────────────────────────────────────────
  DATABASE_URL: z.string().url(),

  // ── JWT ───────────────────────────────────────────────────
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default("predictify"),
  JWT_AUDIENCE: z.string().default("predictify-app"),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  // See src/utils/keyRing.ts for the "kid:secret,..." format and rotation flow.
  JWT_KEYS: z.string().optional(),
  JWT_ACTIVE_KID: z.string().optional(),

  // ── Stellar / Soroban ─────────────────────────────────────
  STELLAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  SOROBAN_RPC_URL: z.string().url(),
  HORIZON_URL: z.string().url(),
  PREDICTIFY_CONTRACT_ID: z.string().min(1),

  // ── Indexer tunables ──────────────────────────────────────
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  INDEXER_START_LEDGER: z.coerce.number().int().nonnegative().default(0),
  INDEXER_REWIND_LEDGERS: z.coerce.number().int().positive().default(100),

  // ── Anonymous rate limiting ───────────────────────────────
  ANON_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  ANON_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  TRUST_PROXY: z.coerce.boolean().default(false),

  // ── Captcha gate (per-IP, unauthenticated endpoints) ─────
  /** Number of requests per IP per window before captcha is required (0 = disabled) */
  CAPTCHA_THRESHOLD: z.coerce.number().int().nonnegative().default(10),
  /** Sliding window length for captcha threshold tracking (ms) */
  CAPTCHA_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  // ── Metrics ──────────────────────────────────────────────
  /** Bearer token required to access /api/metrics. Empty string (default) means no auth. */
  METRICS_AUTH_TOKEN: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

export function formatEnvErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  • ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}
