/**
 * Meta CAPI — funnel events (Lead, ViewContent, AddToCart) for WhatsApp / CTWA.
 * Purchase stays in lib/meta-capi.ts only.
 */

import {
  hashCountryForMeta,
  hashExternalIdForMeta,
  hashPhoneForMeta,
} from "@/lib/phone";

const GRAPH_API_VERSION = "v25.0";

function normalizeMetaEnvId(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^=+/, "");
}

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

function resolveWabaId(wabaId: string | null): string {
  return (
    normalizeMetaEnvId(wabaId ?? undefined) ||
    normalizeMetaEnvId(process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID)
  );
}

export function buildMetaFunnelPayload(
  params: MetaFunnelBaseParams,
): { payload: Record<string, unknown>; graphEventName: string } {
  const testEventCode = readTestEventCodeForPayload();
  const graphEventName = testEventCode ? "TestEvent" : params.eventName;
  const eventTime = Math.floor(params.eventTime.getTime() / 1000);
  const wabaId = resolveWabaId(params.whatsappBusinessAccountId);
  const clid = params.ctwaClid?.trim() || null;

  const phHash = hashPhoneForMeta(params.phoneDigits);
  const externalIdHash = hashExternalIdForMeta(params.contactId);
  const userData: Record<string, unknown> = {
    ph: [phHash],
    external_id: [externalIdHash],
  };
  const countryHash = params.countryCode
    ? hashCountryForMeta(params.countryCode)
    : null;
  if (countryHash) userData.country = [countryHash];
  if (clid) userData.ctwa_clid = clid;
  if (wabaId) userData.whatsapp_business_account_id = wabaId;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: graphEventName,
        event_time: eventTime,
        event_id: params.eventId,
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: userData,
        custom_data: params.customData,
      },
    ],
  };

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  return { payload, graphEventName };
}

export async function postMetaEventsPayload(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; body: string }> {
  const datasetId =
    normalizeMetaEnvId(process.env.META_DATASET_ID) ||
    normalizeMetaEnvId(process.env.META_PIXEL_ID);
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();

  if (!datasetId || !accessToken) {
    throw new Error(
      "META_DATASET_ID and META_ACCESS_TOKEN must be set for CAPI funnel",
    );
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
