/**
 * Neon URLs: production uses DATABASE_URL only. Non-production prefers DATABASE_URL_DEVELOPMENT
 * so local/next dev hits a Neon branch without touching prod data.
 */

export function resolveDatabaseUrl(): string {
  const prod = process.env.NODE_ENV === "production";
  if (prod) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) {
      throw new Error(
        "DATABASE_URL must be set in production (Vercel / next start).",
      );
    }
    return url;
  }

  const dev = process.env.DATABASE_URL_DEVELOPMENT?.trim();
  const fallback = process.env.DATABASE_URL?.trim();
  const url = dev || fallback;
  if (!url) {
    throw new Error(
      "Set DATABASE_URL_DEVELOPMENT (Neon dev branch) and/or DATABASE_URL in .env.local.",
    );
  }
  return url;
}
