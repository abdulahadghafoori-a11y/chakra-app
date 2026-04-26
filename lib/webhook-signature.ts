import { verifyChakraWebhookSignature } from "@/lib/chakra-webhook-signature";
import { verifyMetaWebhookSignature } from "@/lib/meta-whatsapp-signature";

/**
 * Accept POST if Meta signature, Chakra signature, or neither secret is configured (dev only).
 */
export function verifyWhatsAppWebhookPost(
  rawBody: string,
  headers: Headers,
): { ok: true } | { ok: false; reason: string } {
  const metaSecret = process.env.META_APP_SECRET?.trim();
  const chakraSecret = process.env.CHAKRA_WEBHOOK_SECRET?.trim();

  const metaSig =
    headers.get("X-Hub-Signature-256") ??
    headers.get("x-hub-signature-256");
  const chakraSig =
    headers.get("X-Chakra-Signature-256") ??
    headers.get("x-chakra-signature-256");

  if (metaSecret) {
    if (verifyMetaWebhookSignature(rawBody, metaSig, metaSecret)) {
      return { ok: true };
    }
  }

  if (chakraSecret) {
    if (verifyChakraWebhookSignature(rawBody, chakraSig, chakraSecret)) {
      return { ok: true };
    }
  }

  if (!metaSecret && !chakraSecret) {
    return { ok: true };
  }

  return { ok: false, reason: "Invalid or missing webhook signature" };
}
