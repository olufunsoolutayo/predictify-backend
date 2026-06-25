import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | null = null;
let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;

  if (!env.DATABASE_URL) {
    throw new Error(
      env.NODE_ENV === "test"
        ? "Test database client has not been configured"
        : "DATABASE_URL is required to query markets",
    );
  }

  pool = new Pool({ connectionString: env.DATABASE_URL });
  db = drizzle(pool, { schema });
  return db;
}

export function getPool(): Pool {
  if (!pool) getDb();
  if (!pool) {
    throw new Error("Database pool is not available");
  }

  return pool;
}

export function setDbForTests(testDb: Database | null): void {
  if (env.NODE_ENV !== "test") {
    throw new Error("setDbForTests can only be used in test");
  }

  db = testDb;
  pool = null;
}
