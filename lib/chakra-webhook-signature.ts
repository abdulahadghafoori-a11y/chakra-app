import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ChakraHQ pass-through webhooks: HMAC-SHA256 of raw body; header has **no** `sha256=` prefix.
 * Compare hex digest to `X-Chakra-Signature-256`.
 */
export function verifyChakraWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  const s = secret.trim();
  if (!s || !signatureHeader?.trim()) return false;
  const expected = createHmac("sha256", s).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.trim().toLowerCase();
  try {
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
