import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
  keepAlive: true,
});
// An idle hosted-Postgres connection can close while a video is generating.
// The pool replaces it; never let its error dump a credential-bearing client.
pool.on("error", () => {
  console.warn("An idle database connection closed. The pool will reconnect.");
});
export const db = drizzle(pool, { schema });

export * from "./schema";
