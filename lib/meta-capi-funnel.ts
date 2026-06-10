/**
 * Meta CAPI — funnel events (Lead, ViewContent, AddToCart) for WhatsApp / CTWA.
 * Purchase stays in lib/meta-capi.ts only.
 */

import {
  buildBusinessMessagingUserData,
  buildStandardCapiUserData,
  normalizeMetaEnvId,
  resolveMetaPurchaseCapiPath,
} from "@/lib/meta-capi-shared";
import { resolveMetaDatasetIdForWaba } from "@/lib/whatsapp-waba-registry";
import {
  hashCountryForMeta,
  hashExternalIdForMeta,
  hashPhoneForMeta,
} from "@/lib/phone";

const GRAPH_API_VERSION = "v25.0";

function isProductionNodeEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

function readTestEventCodeForPayload(): string {
  if (isProductionNodeEnv()) return "";
  return process.env.META_TEST_EVENT_CODE?.trim() ?? "";
}

export type MetaFunnelBaseParams = {
  /** Graph event name in production (Lead, ViewContent, AddToCart). */
  eventName: "Lead" | "ViewContent" | "AddToCart";
  eventTime: Date;
  contactId: string;
  phoneDigits: string;
  countryCode: string | null;
  ctwaClid: string | null;
  whatsappBusinessAccountId: string | null;
  /** Deduplication id (hashed if too long). */
  eventId: string;
  customData: Record<string, unknown>;
};

function requireWabaId(wabaId: string | null): string {
  const id = normalizeMetaEnvId(wabaId ?? undefined);
  if (!id) {
    throw new Error(
      "WhatsApp business account id is required for Meta funnel CAPI.",
    );
  }
  return id;
}

export function buildMetaFunnelPayload(
  params: MetaFunnelBaseParams,
): { payload: Record<string, unknown>; graphEventName: string } {
  const testEventCode = readTestEventCodeForPayload();
  const graphEventName = testEventCode ? "TestEvent" : params.eventName;
  const eventTime = Math.floor(params.eventTime.getTime() / 1000);
  const clid = params.ctwaClid?.trim() || null;
  const capiPath = resolveMetaPurchaseCapiPath(clid);

  const phHash = hashPhoneForMeta(params.phoneDigits);
  const externalIdHash = hashExternalIdForMeta(params.contactId);
  const countryHash = params.countryCode
    ? hashCountryForMeta(params.countryCode)
    : null;

  const userData =
    capiPath === "ctwa_whatsapp"
      ? buildBusinessMessagingUserData({
          phHash,
          externalIdHash,
          countryHash,
          ctwaClid: clid,
          wabaId: requireWabaId(params.whatsappBusinessAccountId),
        })
      : buildStandardCapiUserData({
          phHash,
          externalIdHash,
          countryHash,
        });

  const event: Record<string, unknown> = {
    event_name: graphEventName,
    event_time: eventTime,
    event_id: params.eventId,
    action_source:
      capiPath === "ctwa_whatsapp" ? "business_messaging" : "other",
    user_data: userData,
    custom_data: params.customData,
  };
  if (capiPath === "ctwa_whatsapp") {
    event.messaging_channel = "whatsapp";
  }

  const payload: Record<string, unknown> = {
    data: [event],
  };

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  return { payload, graphEventName };
}

export async function postMetaEventsPayload(
  payload: Record<string, unknown>,
  wabaId: string,
): Promise<{ ok: boolean; body: string }> {
  const datasetId = resolveMetaDatasetIdForWaba(wabaId);
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new Error("META_ACCESS_TOKEN must be set for CAPI funnel.");
  }

  if (!isProductionNodeEnv()) {
    const code = process.env.META_TEST_EVENT_CODE?.trim();
    if (!code) {
      throw new Error(
        "META_TEST_EVENT_CODE is required when NODE_ENV is not production",
      );
    }
  }

  const payloadJson = JSON.stringify(payload);
  const url = new URL(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${datasetId}/events`,
  );
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payloadJson,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Meta CAPI funnel failed (${res.status}): ${text}`);
  }
  return { ok: true, body: text };
}
