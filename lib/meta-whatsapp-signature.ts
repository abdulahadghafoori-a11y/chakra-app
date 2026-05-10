import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta App `X-Hub-Signature-256` — HMAC-SHA256 of the **raw** POST body, hex digest with `sha256=` prefix.
 * Use your Meta **App Secret** (`META_APP_SECRET`). Not used for third-party webhook providers.
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  const secret = appSecret.trim();
  const sig = signatureHeader?.trim();
  if (!secret || !sig?.toLowerCase().startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = sig.slice(7).trim().toLowerCase();
  try {
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
