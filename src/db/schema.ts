import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  stellarAddress: text("stellar_address").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const markets = pgTable("markets", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  status: text("status").notNull(),
  resolutionTime: timestamp("resolution_time", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata"),
  indexedLedger: integer("indexed_ledger").notNull(),
  archived: boolean("archived").notNull().default(false),
});

export const predictions = pgTable("predictions", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketId: text("market_id").notNull().references(() => markets.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  outcome: text("outcome").notNull(),
  amount: text("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const indexerEvents = pgTable(
  "indexer_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledger: integer("ledger").notNull(),
    txHash: text("tx_hash").notNull(),
    opIndex: integer("op_index").notNull(),
    eventType: text("event_type"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ledgerTxOpUnique: uniqueIndex("indexer_events_ledger_tx_op_idx").on(
      table.ledger,
      table.txHash,
      table.opIndex,
    ),
    ledgerIdx: index("indexer_events_ledger_idx").on(table.ledger),
  }),
);

export const indexerCursor = pgTable("indexer_cursor", {
  id: integer("id").primaryKey(),
  lastLedger: integer("last_ledger").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
