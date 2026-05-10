/**
 * Same rules as lib/database-url.ts (used by CLI scripts — load dotenv first).
 * Production: DATABASE_URL only. Else: DATABASE_URL_DEVELOPMENT ?? DATABASE_URL.
 */

export function resolvedDatabaseUrlFromEnv() {
  const prod = process.env.NODE_ENV === "production";
  if (prod) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) {
      throw new Error(
        "DATABASE_URL must be set when NODE_ENV is production.",
      );
    }
    return url;
  }

  const dev = process.env.DATABASE_URL_DEVELOPMENT?.trim();
  const fb = process.env.DATABASE_URL?.trim();
  const url = dev || fb;
  if (!url) {
    throw new Error(
      "Set DATABASE_URL_DEVELOPMENT (Neon dev branch) and/or DATABASE_URL in .env.local.",
    );
  }
  return url;
}
