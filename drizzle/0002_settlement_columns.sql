ALTER TABLE "claims"
  ADD COLUMN "settlement_tx" text,
  ADD COLUMN "settle_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "next_settle_attempt_at" timestamptz,
  ADD COLUMN "settled_at" timestamptz;
