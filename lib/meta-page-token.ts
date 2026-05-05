/**
 * Token for Page comment moderation + Messenger / Instagram messaging (Graph).
 * Prefer `META_PAGE_ACCESS_TOKEN` when you use a dedicated Page token; otherwise
 * falls back to `META_ACCESS_TOKEN` (e.g. System User token with access to those assets).
 * The token must be authorized for each Page / IG account your webhooks reference.
 */
export function getMetaPageAccessToken(): string {
  const page = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  const shared = process.env.META_ACCESS_TOKEN?.trim();
  const t = page || shared;
  if (!t) {
    throw new Error(
      "Set META_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN for Pages messaging + comment moderation",
    );
  }
  return t;
}

/**
 * GET webhook handshake (`hub.verify_token`) for WhatsApp and `/api/webhooks/meta`.
 * Use one string everywhere in Meta’s dashboard: set any one of these env vars (same value).
 * Prefer `META_WEBHOOK_VERIFY_TOKEN` when you want a single name unrelated to WhatsApp.
 */
export function getMetaWebhookVerifyToken(): string {
  const t =
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
    process.env.META_WHATSAPP_VERIFY_TOKEN?.trim() ||
    process.env.META_PAGE_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!t) {
    throw new Error(
      "Set META_WEBHOOK_VERIFY_TOKEN or META_WHATSAPP_VERIFY_TOKEN (optional: META_PAGE_WEBHOOK_VERIFY_TOKEN) for Meta webhook GET verification",
    );
  }
  return t;
}

/** @deprecated Use getMetaWebhookVerifyToken — kept for call sites; behavior identical. */
export function getMetaPageWebhookVerifyToken(): string {
  return getMetaWebhookVerifyToken();
}
