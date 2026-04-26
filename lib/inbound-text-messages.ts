/**
 * Extract inbound user text messages from Meta `whatsapp_business_account` webhooks.
 * One row per `messages[]` entry with type `text` and a non-empty body.
 */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function contactNameFromValue(
  value: Record<string, unknown>,
  waId: string,
): string | null {
  const contacts = value.contacts;
  if (!Array.isArray(contacts)) return null;
  const normalized = waId.replace(/\D/g, "");
  for (const c of contacts) {
    const rec = asRecord(c);
    const id = typeof rec?.wa_id === "string" ? rec.wa_id.replace(/\D/g, "") : "";
    if (id && id === normalized) {
      const profile = asRecord(rec?.profile);
      const name =
        profile && typeof profile.name === "string" ? profile.name.trim() : "";
      return name || null;
    }
  }
  return null;
}

function messageTimestampSeconds(message: Record<string, unknown>): number {
  const raw = message.timestamp;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
  }
  return Math.floor(Date.now() / 1000);
}

export type InboundTextMessage = {
  wamid: string;
  waIdDigits: string;
  wabaId: string;
  phoneNumberId: string | null;
  textBody: string;
  sendTime: Date;
  profileName: string | null;
};

export function extractInboundTextMessages(body: unknown): InboundTextMessage[] {
  const root = asRecord(body);
  if (root?.object !== "whatsapp_business_account") return [];

  const entry = root.entry;
  if (!Array.isArray(entry)) return [];

  const out: InboundTextMessage[] = [];

  for (const ent of entry) {
    const entRec = asRecord(ent);
    const wabaId = typeof entRec?.id === "string" ? entRec.id.trim() : "";
    if (!wabaId) continue;

    const changes = entRec?.changes;
    if (!Array.isArray(changes)) continue;

    for (const ch of changes) {
      const chRec = asRecord(ch);
      if (chRec?.field !== "messages") continue;
      const value = asRecord(chRec?.value);
      if (!value) continue;

      const meta = asRecord(value.metadata);
      const phoneNumberId =
        meta && typeof meta.phone_number_id === "string"
          ? meta.phone_number_id.trim()
          : null;

      const messages = value.messages;
      if (!Array.isArray(messages)) continue;

      for (const msg of messages) {
        const message = asRecord(msg);
        if (!message) continue;
        if (message.type !== "text") continue;

        const wamid = typeof message.id === "string" ? message.id.trim() : "";
        if (!wamid) continue;

        const from = typeof message.from === "string" ? message.from.trim() : "";
        if (!from) continue;

        const waIdDigits = from.replace(/\D/g, "");
        if (!waIdDigits) continue;

        const text = asRecord(message.text);
        const textBody =
          text && typeof text.body === "string" ? text.body.trim() : "";
        if (!textBody) continue;

        const sendTime = new Date(messageTimestampSeconds(message) * 1000);
        const profileName = contactNameFromValue(value, from);

        out.push({
          wamid,
          waIdDigits,
          wabaId,
          phoneNumberId: phoneNumberId?.length ? phoneNumberId : null,
          textBody,
          sendTime,
          profileName,
        });
      }
    }
  }

  return out;
}
