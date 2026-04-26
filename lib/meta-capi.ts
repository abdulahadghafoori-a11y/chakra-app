/**
 * Meta Conversions API (Graph) — server-side Purchase for Click to WhatsApp attribution.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 *
 * Inbound CTWA context comes from your own stack: configure the WhatsApp **messages** webhook
 * directly on the Meta app (see `app/api/webhooks/whatsapp`) — same JSON shape as Meta’s docs.
 */

import {
  hashCountryForMeta,
  hashExternalIdForMeta,
  hashPhoneForMeta,
} from "@/lib/phone";

/** Meta documents a practical max length for event_id; hash long business keys. */
const META_EVENT_ID_MAX_LEN = 64;

const GRAPH_API_VERSION = "v25.0";

export type MetaPurchaseLineItem = {
  sku: string;
  productName: string;
  quantity: number;
  /** Line total (value) for this SKU */
  lineValue: number;
};

export type MetaPurchaseParams = {
  /** Your internal order id (also sent as custom_data.order_id). */
  orderId: string;
  /** When the order was persisted (CAPI event_time). */
  orderCreatedAt: Date;
  /** Contact UUID — hashed into user_data.external_id for EMQ (Purchase path only). */
  contactId: string;
  /** ISO 3166-1 alpha-2 from contact; hashed into user_data.country when set. */
  countryCode: string | null;
  /** Total order value (major currency units). */
  value: number;
  currency: string;
  /** Sum of line quantities (for num_items if needed). */
  totalQuantity: number;
  lines: MetaPurchaseLineItem[];
  /** CTWA click id — omitted from user_data when null/empty. */
  ctwaClid: string | null;
  /**
   * Meta WABA from the CTWA session (`entry.id` from webhooks). Falls back to
   * `META_WHATSAPP_BUSINESS_ACCOUNT_ID` when null/empty.
   */
  whatsappBusinessAccountId: string | null;
  /** Digits-only phone (same normalization as hashing). */
  phoneDigits: string;
};

export type MetaPurchaseResult = {
  eventId: string;
  /** Pretty JSON of the POST body (for UI / sessionStorage). */
  payloadJson: string;
};

/** Dotenv `KEY==value` yields a leading `=`; strip so Graph ids stay valid. */
function normalizeMetaEnvId(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^=+/, "");
}

function isProductionNodeEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Production: never send `test_event_code` (live `Purchase` only).
 * Non-production: use `META_TEST_EVENT_CODE` (required at send time — see `sendMetaPurchaseEvent`).
 */
function readTestEventCodeForPayload(): string {
  if (isProductionNodeEnv()) {
    return "";
  }
  return process.env.META_TEST_EVENT_CODE?.trim() ?? "";
}

/** Deterministic id for deduplication with browser pixel / retries. */
export function metaPurchaseEventId(orderId: string): string {
  const candidate = `pur_${orderId}`;
  if (candidate.length <= META_EVENT_ID_MAX_LEN) return candidate;
  return hashExternalIdForMeta(orderId);
}

function resolveWabaId(params: MetaPurchaseParams): string {
  return (
    normalizeMetaEnvId(params.whatsappBusinessAccountId ?? undefined) ||
    normalizeMetaEnvId(process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID)
  );
}

/**
 * Builds the exact JSON body for POST .../events (single event in `data`).
 * Always uses hashed `user_data` and full `custom_data` (contents, order_id, etc.).
 * Production: `event_name` `Purchase`, no `test_event_code`.
 * Development: `event_name` `TestEvent` and root `test_event_code` from `META_TEST_EVENT_CODE`.
 */
export function buildMetaPurchasePayload(
  params: MetaPurchaseParams,
): { payload: Record<string, unknown>; eventId: string } {
  const testEventCode = readTestEventCodeForPayload();
  const eventName = testEventCode ? "TestEvent" : "Purchase";
  const eventTime = Math.floor(params.orderCreatedAt.getTime() / 1000);
  const eventId = metaPurchaseEventId(params.orderId);
  const wabaId = resolveWabaId(params);
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
  if (countryHash) {
    userData.country = [countryHash];
  }
  if (clid) {
    userData.ctwa_clid = clid;
  }
  if (wabaId) {
    userData.whatsapp_business_account_id = wabaId;
  }

  const contents = params.lines.map((line) => {
    const unitPrice =
      line.quantity > 0 ? line.lineValue / line.quantity : line.lineValue;
    return {
      id: line.sku,
      quantity: line.quantity,
      item_price: unitPrice,
      title: line.productName,
    };
  });
  const contentIds = params.lines.map((line) => line.sku);
  const firstLine = params.lines[0];
  const contentName =
    params.lines.length <= 1
      ? (firstLine?.productName ?? "")
      : `${firstLine?.productName ?? "Order"} (+${params.lines.length - 1} more)`;

  const customData: Record<string, unknown> = {
    currency: params.currency,
    value: params.value,
    order_id: params.orderId,
    num_items: params.totalQuantity,
    content_type: "product",
    content_ids: contentIds,
    contents,
  };
  if (contentName) {
    customData.content_name = contentName;
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId,
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  return { payload, eventId };
}

export function serializeMetaPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, null, 2);
}

export async function sendMetaPurchaseEvent(
  params: MetaPurchaseParams,
): Promise<MetaPurchaseResult> {
  const datasetId =
    normalizeMetaEnvId(process.env.META_DATASET_ID) ||
    normalizeMetaEnvId(process.env.META_PIXEL_ID);
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();

  if (!datasetId || !accessToken) {
    throw new Error(
      "META_DATASET_ID (Events Manager dataset id) and META_ACCESS_TOKEN must be set",
    );
  }

  if (!isProductionNodeEnv()) {
    const code = process.env.META_TEST_EVENT_CODE?.trim();
    if (!code) {
      throw new Error(
        "META_TEST_EVENT_CODE is required when NODE_ENV is not production (use the Test events code from Meta Events Manager).",
      );
    }
  }

  const { payload, eventId } = buildMetaPurchasePayload(params);
  const payloadJson = serializeMetaPayload(payload);

  const url = new URL(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${datasetId}/events`,
  );
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payloadJson,
  });

  const json = (await res.json()) as {
    error?: {
      message?: string;
      error_user_msg?: string;
      error_user_title?: string;
      code?: number;
      error_subcode?: number;
    };
    events_received?: number;
  };

  if (!res.ok) {
    const err = json.error;
    if (process.env.NODE_ENV === "development") {
      console.error("[Meta CAPI] Graph error:", err);
    }
    const base =
      typeof err?.message === "string"
        ? err.message
        : `Meta API error (${res.status})`;
    const detail =
      typeof err?.error_user_msg === "string" ? err.error_user_msg : "";
    const msg = detail && detail !== base ? `${base} — ${detail}` : base;
    throw new Error(msg);
  }

  return { eventId, payloadJson };
}
