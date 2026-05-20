import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Per-instance limiter (serverless-safe enough for abuse deterrence; use Redis at scale). */
export function checkRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(options.key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(options.key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return { ok: true };
  }
  if (existing.count >= options.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { ok: true };
}

export async function clientIpFromHeaders(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

export async function enforcePublicActionRateLimit(
  action: string,
  options?: { limit?: number; windowMs?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await clientIpFromHeaders();
  const result = checkRateLimit({
    key: `${action}:${ip}`,
    limit: options?.limit ?? 40,
    windowMs: options?.windowMs ?? 60_000,
  });
  if (result.ok) return { ok: true };
  return {
    ok: false,
    error: `Too many requests. Try again in ${result.retryAfterSec}s.`,
  };
}
