/**
 * Quick connectivity check: Neon HTTP (app) vs TCP postgres (optional; same as drizzle-kit migrate).
 * Run: node scripts/ping-database.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });
config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const redacted = url.replace(/:([^:@/]+)@/, ":****@");
console.log("DATABASE_URL host:", redacted.slice(0, 80) + (redacted.length > 80 ? "…" : ""));

async function httpCheck() {
  const sql = neon(url);
  const r = await sql`SELECT 1 AS ok`;
  console.log("Neon HTTP (fetch): OK", r);
}

async function tcpCheck() {
  let postgres;
  try {
    ({ default: postgres } = await import("postgres"));
  } catch {
    console.log(
      "TCP postgres client: skipped (install `postgres` to test same protocol as drizzle-kit migrate)",
    );
    return;
  }
  const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5 });
  try {
    const r = await sql`SELECT 1 AS ok`;
    console.log("TCP postgres (drizzle-kit migrate protocol): OK", r);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

try {
  await httpCheck();
} catch (e) {
  console.error("Neon HTTP FAILED:", e?.message ?? e);
  if (e?.cause) console.error("cause:", e.cause);
  process.exit(1);
}

try {
  await tcpCheck();
} catch (e) {
  console.warn(
    "TCP postgres FAILED (npm run db:migrate:tcp / drizzle-kit migrate):",
    e?.message ?? e,
  );
  console.warn("Default npm run db:migrate uses Neon HTTP and should still work.");
}
