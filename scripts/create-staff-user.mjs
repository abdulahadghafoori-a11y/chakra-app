/**
 * Create a staff user for /sales and /campaigns sign-in.
 * Usage: npm run staff:create-user -- you@company.com your-secret-password
 * Requires: DATABASE_URL, migration 0020_staff_users applied.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

const ROUNDS = 11;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (.env.local).");
  process.exit(1);
}

const emailArg = process.argv[2];
const passwordArg = process.argv[3];
if (!emailArg || !passwordArg) {
  console.error(
    "Usage: npm run staff:create-user -- <email> <password>\n" +
      "Example: npm run staff:create-user -- admin@example.com 'hunter2'",
  );
  process.exit(1);
}

const email = String(emailArg).trim().toLowerCase();
if (!email.includes("@")) {
  console.error("Invalid email.");
  process.exit(1);
}

const sql = neon(url);
const passwordHash = await bcrypt.hash(passwordArg, ROUNDS);

try {
  await sql`
    INSERT INTO staff_users (email, password_hash)
    VALUES (${email}, ${passwordHash})
  `;
  console.log("Created staff user:", email);
} catch (e) {
  const msg = String(e?.message ?? e);
  if (
    msg.includes("23505") ||
    msg.toLowerCase().includes("unique") ||
    msg.toLowerCase().includes("duplicate")
  ) {
    console.error(
      "That email is already registered. Use a different email or delete the row in Postgres.",
    );
    process.exit(1);
  }
  console.error(msg);
  process.exit(1);
}
