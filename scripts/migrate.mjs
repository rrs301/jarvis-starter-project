// Applies db/schema.sql to the cloudhike Postgres database.
// Usage: npm run db:migrate   (reads DIRECT_URL or DATABASE_URL from .env.local)
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
await client.end();
console.log("Schema applied.");
