/**
 * Outbound WhatsApp via Meta Cloud API (same WABA as webhooks).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */

const GRAPH_API_VERSION = "v25.0";

export type SendWhatsAppTextParams = {
  /** International digits only (no +), same as `wa_id` / `from` in webhooks. */
  toWaIdDigits: string;
  body: string;
  /** Cloud API phone number id (path segment). Defaults to WHATSAPP_PHONE_NUMBER_ID. */
  phoneNumberId?: string | null;
};

export type SendWhatsAppTextResult =
  | { ok: true; messageId: string | null; raw: unknown }
  | { ok: false; error: string; status?: number };

function readAccessToken(): string {
  const t =
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
    process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
  if (!t) {
    throw new Error(
      "Missing WHATSAPP_ACCESS_TOKEN (or META_WHATSAPP_ACCESS_TOKEN)",
    );
  }
  return t.replace(/^=+/, "");
}

function defaultPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!id) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  }
  return id.replace(/^=+/, "");
}

/**
 * Sends a plain text message (session message; user must be inside 24h care window unless using templates).
 */
export async function sendWhatsAppText(
  params: SendWhatsAppTextParams,
): Promise<SendWhatsAppTextResult> {
  const to = params.toWaIdDigits.replace(/\D/g, "");
  if (!to) {
    return { ok: false, error: "Invalid recipient phone" };
  }
  const text = params.body?.trim();
  if (!text) {
    return { ok: false, error: "Empty message body" };
  }

  let token: string;
  let phoneId: string;
  try {
    token = readAccessToken();
    phoneId = (params.phoneNumberId?.trim() || defaultPhoneNumberId()).replace(
      /^=+/,
      "",
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Config error",
    };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text.slice(0, 4096) },
    }),
  });

  const raw = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!res.ok) {
    const err =
      raw && typeof raw.error === "object" && raw.error !== null
        ? JSON.stringify(raw.error)
        : res.statusText;
    return { ok: false, error: err || "Graph request failed", status: res.status };
  }

  const messages = raw?.messages;
  const first =
    Array.isArray(messages) && messages[0] && typeof messages[0] === "object"
      ? (messages[0] as Record<string, unknown>)
      : null;
  const messageId =
    typeof first?.id === "string" ? first.id : null;

  return { ok: true, messageId, raw };
}
