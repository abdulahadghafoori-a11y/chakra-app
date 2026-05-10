/**
 * `FEATURE_SET=core`: production MVP — contacts, CTWA, orders/CAPI, campaigns, catalog (no
 * expenses, Meta comments surface, or AI sales). Unset or another value (`full`): enable all staff
 * surfaces.
 */

export function isCoreFeatureSet(): boolean {
  return process.env.FEATURE_SET?.trim().toLowerCase() === "core";
}

/** User-facing messages for gated APIs and middleware. */
export const FULL_FEATURE_UNAVAILABLE =
  "This feature is unavailable in core production mode.";

/**
 * Staff routes blocked in core mode (middleware + nav). Webhooks except
 * `/api/webhooks/meta` stay reachable unless handled separately.
 */
export function isPathRestrictedInCoreMode(pathname: string): boolean {
  if (!isCoreFeatureSet()) return false;

  if (pathname.startsWith("/expenses")) return true;
  if (pathname.startsWith("/meta-engagement")) return true;

  if (pathname.startsWith("/sales/login")) return false;
  if (pathname === "/sales" || pathname.startsWith("/sales/")) return true;

  if (/^\/products\/[^/]+\/agent(?:\/|$)/.test(pathname)) return true;

  return false;
}

/** Page/Instagram webhook: fail closed in core mode unless you intentionally enable it elsewhere. */
export function isMetaSocialWebhookDisabledInCoreMode(): boolean {
  return isCoreFeatureSet();
}

/**
 * WhatsApp webhook: CTWA sessions with referral `source_id` always upsert/link `meta_ads`
 * hierarchy via Marketing API (requires token access to Ads).
 */
export function shouldLinkCtwaSessionToMetaAd(): boolean {
  return true;
}
