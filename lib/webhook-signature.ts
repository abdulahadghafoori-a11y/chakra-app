import { verifyChakraWebhookSignature } from "@/lib/chakra-webhook-signature";
import { verifyMetaWebhookSignature } from "@/lib/meta-whatsapp-signature";

/** True if Meta sent some `X-Hub-Signature-256` value (logging / diagnostics only). */
export function hubSignaturePresent(headers: Headers): boolean {
  const v =
    headers.get("X-Hub-Signature-256") ??
    headers.get("x-hub-signature-256");
  return Boolean(v?.trim());
}

/** True if `X-Chakra-Signature-256` is present (ChakraHQ pass-through; logging only). */
export function chakraSignaturePresent(headers: Headers): boolean {
  const v =
    headers.get("X-Chakra-Signature-256") ??
    headers.get("x-chakra-signature-256");
  return Boolean(v?.trim());
}

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
 * Accept POST if Meta signature **or** Chakra pass-through signature verifies, or neither class
 * of secret is configured (dev only). When both CHAKRA_WEBHOOK_SECRET and Meta app secrets are
 * set, **either** header may authenticate (relays Meta→Chakra→you often omit `X-Hub-Signature-256`).
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

  const metaSigNorm = metaSig?.trim() ?? "";
  const chakraSigTrim = chakraSig?.trim() ?? "";

  const chakraOk = chakraSecret
    ? verifyChakraWebhookSignature(
        rawBody,
        chakraSigTrim || null,
        chakraSecret,
      )
    : false;

  const metaLooksLikeMeta =
    Boolean(metaSigNorm) &&
    metaSigNorm.toLowerCase().startsWith("sha256=");

  let metaOk = false;
  if (metaSecrets.length > 0 && metaLooksLikeMeta) {
    for (const secret of metaSecrets) {
      if (verifyMetaWebhookSignature(rawBody, metaSigNorm, secret)) {
        metaOk = true;
        break;
      }
    }
  }

  if (metaSecrets.length === 0 && !chakraSecret) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        reason: "Webhook secrets not configured",
        detail:
          "Set META_APP_SECRET and/or CHAKRA_WEBHOOK_SECRET in production. Unsigned webhook POSTs are rejected.",
      };
    }
    return { ok: true };
  }

  if (chakraOk || metaOk) {
    return { ok: true };
  }

  if (
    chakraSecret &&
    chakraSigTrim &&
    !chakraOk
  ) {
    const dbg = process.env.META_WEBHOOK_DEBUG?.trim().toLowerCase();
    if (dbg === "true" || dbg === "1" || dbg === "yes") {
      console.warn(
        "[webhook-signature] Chakra HMAC mismatch (META_WEBHOOK_DEBUG) — compare CHAKRA_WEBHOOK_SECRET to Admin → Team → Secrets; body must match signed bytes verbatim.",
        {
          headerLen: chakraSigTrim.length,
          bodyUtf8Bytes: Buffer.byteLength(rawBody, "utf8"),
          secretLen: chakraSecret.length,
        },
      );
    }
  }

  if (
    chakraSecret &&
    metaSecrets.length > 0
  ) {
    return {
      ok: false,
      reason: "Invalid or missing webhook signature",
      detail:
        "Neither Chakra nor Meta signature verified. Chakra Chat pass-through sends X-Chakra-Signature-256 (raw-body HMAC hex, no sha256= prefix): set CHAKRA_WEBHOOK_SECRET to Chakra’s secret. Direct Meta webhooks send X-Hub-Signature-256 sha256=<hex>; verify META_APP_SECRET matches your app. Relayed traffic often lacks Meta’s header even when JSON looks identical.",
    };
  }

  if (chakraSecret && !metaSecrets.length) {
    if (!chakraSigTrim) {
      return {
        ok: false,
        reason: "Invalid or missing webhook signature",
        detail:
          "Missing X-Chakra-Signature-256 — Chakra Chat pass-through expects this header (hex HMAC). If you call this URL directly instead of via Chakra, remove CHAKRA_WEBHOOK_SECRET and use Meta signatures with META_APP_SECRET.",
      };
    }
    return {
      ok: false,
      reason: "Invalid or missing webhook signature",
      detail:
        "CHAKRA_WEBHOOK_SECRET is set but X-Chakra-Signature-256 did not verify — wrong secret or the relay changed the POST body.",
    };
  }

  /* Meta-only */
  if (!metaSigNorm) {
    return {
      ok: false,
      reason: "Invalid or missing webhook signature",
      detail:
        'X-Hub-Signature-256 is absent. While META_APP_SECRET is set every direct Meta POST must include sha256=<hex>. App Dashboard "Test" is often unsigned. If you receive traffic via Chakra Chat, set CHAKRA_WEBHOOK_SECRET and verify X-Chakra-Signature-256 instead of relying on Meta’s header.',
    };
  }
  if (!metaLooksLikeMeta) {
    return {
      ok: false,
      reason: "Invalid or missing webhook signature",
      detail:
        "X-Hub-Signature-256 is present but must start with sha256= followed by hex (Meta format).",
    };
  }
  return {
    ok: false,
    reason: "Invalid or missing webhook signature",
    detail:
      "No configured Meta app secret verified this signature. Set META_APP_SECRET for your Page/Messenger/WhatsApp app. For Instagram Graph API webhooks (separate Meta app), set META_INSTAGRAM_APP_SECRET to that app’s Basic → App secret (alias: META_INSTAGRAM_LOGIN_APP_SECRET). Restart after editing .env.",
  };
}
