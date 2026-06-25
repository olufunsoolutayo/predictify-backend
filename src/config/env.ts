import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z.string().url().optional(),
    JWT_SECRET: z.string().min(32),
    JWT_ISSUER: z.string().default("predictify"),
    JWT_AUDIENCE: z.string().default("predictify-app"),
    JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    STELLAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
    SOROBAN_RPC_URL: z.string().url(),
    HORIZON_URL: z.string().url(),
    PREDICTIFY_CONTRACT_ID: z.string().min(1),
    INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
    INDEXER_START_LEDGER: z.coerce.number().int().nonnegative().default(0),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "test" && !value.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required outside test",
      });
    }
  });

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
