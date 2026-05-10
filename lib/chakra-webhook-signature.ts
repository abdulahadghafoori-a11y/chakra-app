import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ChakraHQ webhooks: HMAC-SHA256(raw body UTF-8, team secret) compared to `X-Chakra-Signature-256`.
 * Docs specify hex **without** `sha256=`; we accept optional `sha256=`, quoting, commas, base64 digest.
 */

function timingSafeDigestEqual(expectedHex: string, recvBuf: Buffer): boolean {
  try {
    const b = Buffer.from(expectedHex, "hex");
    if (recvBuf.length !== b.length) return false;
    return timingSafeEqual(recvBuf, b);
  } catch {
    return false;
  }
}

/** Parse signature header fragment into a 32-byte SHA-256 digest buffer. */
function chakraSignatureFragmentToDigestBuf(fragment: string): Buffer | null {
  let s = fragment.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (s.toLowerCase().startsWith("sha256=")) {
    s = s.slice(7).trim();
  }
  s = s.replace(/\s+/g, "");

  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    try {
      const b = Buffer.from(s, "hex");
      return b.length === 32 ? b : null;
    } catch {
      return null;
    }
  }

  try {
    const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
    let pad = normalized;
    const mod = normalized.length % 4;
    if (mod !== 0) pad += "=".repeat(4 - mod);
    const b = Buffer.from(pad, "base64");
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

/** Split on comma — use first parseable digest. */
function chakraHeaderToDigestBuf(signatureHeader: string): Buffer | null {
  const trimmed = signatureHeader.trim();
  for (const part of trimmed.split(",")) {
    const buf = chakraSignatureFragmentToDigestBuf(part);
    if (buf) return buf;
  }
  return null;
}

/** @internal For debug logging when signatures disagree. */
export function computeExpectedChakraHmacHex(
  rawBody: string,
  secret: string,
): string | null {
  const s = secret.trim();
  if (!s) return null;
  return createHmac("sha256", s).update(rawBody, "utf8").digest("hex");
}

export function verifyChakraWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  const s = secret.trim();
  if (!s || !signatureHeader?.trim()) return false;
  const recvBuf = chakraHeaderToDigestBuf(signatureHeader);
  if (!recvBuf) return false;
  const expectedHex = createHmac("sha256", s)
    .update(rawBody, "utf8")
    .digest("hex");
  return timingSafeDigestEqual(expectedHex, recvBuf);
}
