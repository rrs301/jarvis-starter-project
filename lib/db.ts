import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type QueryResultRow } from "pg";

// One small pool per process, kept across dev hot reloads (cloudhike docs).
const g = globalThis as unknown as { jbPool?: Pool; jbSchema?: Promise<void> };

function pool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Provision cloudhike Postgres and add it to .env.local.");
  }
  if (!g.jbPool) {
    g.jbPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  return g.jbPool;
}

/** Applies db/schema.sql once per process (idempotent DDL). */
function ensureSchema(): Promise<void> {
  if (!g.jbSchema) {
    const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
    g.jbSchema = pool()
      .query(sql)
      .then(() => undefined)
      .catch((err) => {
        g.jbSchema = undefined;
        throw err;
      });
  }
  return g.jbSchema;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query<T>(text, params);
  return res.rows;
}
