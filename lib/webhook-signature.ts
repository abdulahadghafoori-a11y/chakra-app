import { verifyChakraWebhookSignature } from "@/lib/chakra-webhook-signature";
import { verifyMetaWebhookSignature } from "@/lib/meta-whatsapp-signature";

/**
 * Secrets to try for `X-Hub-Signature-256` (order matters).
 * Instagram Graph API webhooks are signed with that **Instagram app’s** App Secret (Basic settings).
 * Page / Messenger / WhatsApp use `META_APP_SECRET`.
 */
function metaWebhookAppSecrets(): string[] {
  const instagramProductSecrets = [
    process.env.META_INSTAGRAM_APP_SECRET?.trim(),
    process.env.META_INSTAGRAM_LOGIN_APP_SECRET?.trim(),
  ].filter((s): s is string => Boolean(s));
  const pageAppSecret = process.env.META_APP_SECRET?.trim();
  const ordered: string[] = [];
  for (const s of instagramProductSecrets) {
    if (!ordered.includes(s)) ordered.push(s);
  }
  if (pageAppSecret && !ordered.includes(pageAppSecret)) {
    ordered.push(pageAppSecret);
  }
  return ordered;
}

/**
 * Accept POST if Meta signature, Chakra signature, or neither secret is configured (dev only).
 */
export function verifyWhatsAppWebhookPost(
  rawBody: string,
  headers: Headers,
): { ok: true } | { ok: false; reason: string; detail?: string } {
  const metaSecrets = metaWebhookAppSecrets();
  const chakraSecret = process.env.CHAKRA_WEBHOOK_SECRET?.trim();

  const metaSig =
    headers.get("X-Hub-Signature-256") ??
    headers.get("x-hub-signature-256");
  const chakraSig =
    headers.get("X-Chakra-Signature-256") ??
    headers.get("x-chakra-signature-256");

  if (metaSecrets.length > 0) {
    if (!metaSig?.startsWith("sha256=")) {
      return {
        ok: false,
        reason: "Invalid or missing webhook signature",
        detail:
          "Missing or malformed X-Hub-Signature-256 (Meta sends sha256=<hex>).",
      };
    }
    for (const secret of metaSecrets) {
      if (verifyMetaWebhookSignature(rawBody, metaSig, secret)) {
        return { ok: true };
      }
    }
    return {
      ok: false,
      reason: "Invalid or missing webhook signature",
      detail:
        "No configured Meta app secret verified this signature. Set META_APP_SECRET for your Page/Messenger/WhatsApp app. For Instagram Graph API webhooks (separate Meta app), set META_INSTAGRAM_APP_SECRET to that app’s Basic → App secret (alias: META_INSTAGRAM_LOGIN_APP_SECRET). Restart after editing .env.",
    };
  }

  if (chakraSecret) {
    if (verifyChakraWebhookSignature(rawBody, chakraSig, chakraSecret)) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: "Invalid or missing webhook signature",
      detail:
        "CHAKRA_WEBHOOK_SECRET is set but X-Chakra-Signature-256 did not verify.",
    };
  }

  return { ok: true };
}
