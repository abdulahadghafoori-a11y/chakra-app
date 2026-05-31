/**
 * Shared Conversions API helpers for `business_messaging` + `whatsapp` payloads.
 */

/** Dotenv `KEY==value` yields a leading `=`; strip so Graph ids stay valid. */
export function normalizeMetaEnvId(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^=+/, "");
}

/** Facebook Page id linked to WhatsApp / CTWA (plain value in CAPI `user_data.page_id`). */
export function resolveMetaFacebookPageId(): string {
  return (
    normalizeMetaEnvId(process.env.META_FACEBOOK_PAGE_ID) ||
    normalizeMetaEnvId(process.env.META_PAGE_ID)
  );
}

export function requireMetaFacebookPageIdForBusinessMessaging(): string {
  const pageId = resolveMetaFacebookPageId();
  if (!pageId) {
    throw new Error(
      "META_FACEBOOK_PAGE_ID is required for WhatsApp business_messaging CAPI. Use the Facebook Page id linked to your WhatsApp Business Account (Business settings → Accounts → Pages, or Page Settings → About).",
    );
  }
  return pageId;
}

export type BusinessMessagingUserDataInput = {
  phHash: string;
  externalIdHash: string;
  countryHash?: string | null;
  ctwaClid?: string | null;
  wabaId?: string | null;
};

/** Graph path when `ctwa_clid` is present (CTWA ad attribution). */
export function buildBusinessMessagingUserData(
  input: BusinessMessagingUserDataInput,
): Record<string, unknown> {
  const clid = input.ctwaClid?.trim();
  if (!clid) {
    throw new Error(
      "ctwa_clid is required for business_messaging WhatsApp CAPI events",
    );
  }

  const pageId = requireMetaFacebookPageIdForBusinessMessaging();
  const userData: Record<string, unknown> = {
    ph: [input.phHash],
    external_id: [input.externalIdHash],
    page_id: pageId,
    ctwa_clid: clid,
  };
  if (input.countryHash) {
    userData.country = [input.countryHash];
  }
  if (input.wabaId) {
    userData.whatsapp_business_account_id = input.wabaId;
  }
  return userData;
}

export type StandardCapiUserDataInput = {
  phHash: string;
  externalIdHash: string;
  countryHash?: string | null;
};

/** Hashed customer keys for `action_source: other` when there is no CTWA click id. */
export function buildStandardCapiUserData(
  input: StandardCapiUserDataInput,
): Record<string, unknown> {
  const userData: Record<string, unknown> = {
    ph: [input.phHash],
    external_id: [input.externalIdHash],
  };
  if (input.countryHash) {
    userData.country = [input.countryHash];
  }
  return userData;
}

export type MetaPurchaseCapiPath = "ctwa_whatsapp" | "other";

export function resolveMetaPurchaseCapiPath(
  ctwaClid: string | null | undefined,
): MetaPurchaseCapiPath {
  return ctwaClid?.trim() ? "ctwa_whatsapp" : "other";
}
