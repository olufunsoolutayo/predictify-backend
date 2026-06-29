CREATE TABLE IF NOT EXISTS "market_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "market_id" text NOT NULL REFERENCES "markets"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "market_comments_market_created_idx"
  ON "market_comments" ("market_id", "created_at");

CREATE INDEX IF NOT EXISTS "market_comments_user_created_idx"
  ON "market_comments" ("user_id", "created_at");
