-- Migration: add feature_flags table

CREATE TABLE IF NOT EXISTS "feature_flags" (
  "id"          text        PRIMARY KEY,
  "enabled"     boolean     NOT NULL DEFAULT false,
  "variant"     text,
  "description" text,
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);
