/**
 * `FEATURE_SET=core`: production MVP — contacts, CTWA, orders/CAPI, catalog only.
 * Unset or any other value (e.g. `full`): all staff surfaces enabled.
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
  if (pathname.startsWith("/campaigns")) return true;
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
 * WhatsApp webhook: skip Marketing API enrichment of CTWA → meta_ads hierarchy.
 * Set `CTWA_LINK_META_AD=false` in minimal prod if you omit ads.read permissions.
 */
export function shouldLinkCtwaSessionToMetaAd(): boolean {
  const raw = process.env.CTWA_LINK_META_AD?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}
