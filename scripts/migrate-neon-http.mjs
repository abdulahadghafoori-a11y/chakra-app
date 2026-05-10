/**
 * Apply Drizzle migrations over Neon HTTP (same protocol as @/lib/db).
 * Use when `drizzle-kit migrate` fails with TCP timeouts (firewall/VPN blocking :5432).
 *
 * NOTE: Neon HTTP driver does not use DB transactions for migrations; if a migration
 * fails mid-way, repair manually. See drizzle-orm neon-http migrator docs.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

import { resolvedDatabaseUrlFromEnv } from "./resolve-database-url.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const migrationsFolder = path.join(root, "drizzle", "migrations");

config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

let url;
try {
  url = resolvedDatabaseUrlFromEnv();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const db = drizzle(neon(url));

try {
  console.log("Applying migrations (Neon HTTP):", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("Migrations finished.");
} catch (e) {
  console.error(e?.message ?? e);
  process.exit(1);
}
