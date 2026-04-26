/**
 * Parses Meta WhatsApp webhook POST bodies (Graph / Cloud API format).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
import { findCtwaClid, referralSourceFields } from "@/lib/ctwa-referral";

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

export type MetaInboundMessageJob = {
  wabaId: string;
  phoneNumberId: string | null;
  phoneDigits: string;
  name: string | null;
  ctwaClid: string;
  sourceId: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  sendTime: Date;
};

/**
 * Flattens Meta `whatsapp_business_account` webhook JSON into per-message jobs.
 * Only messages that include a `ctwa_clid` are included (caller may still filter).
 */
export function extractMetaInboundMessageJobs(body: unknown): MetaInboundMessageJob[] {
  const root = asRecord(body);
  if (root?.object !== "whatsapp_business_account") return [];

  const entry = root.entry;
  if (!Array.isArray(entry)) return [];

  const jobs: MetaInboundMessageJob[] = [];

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
        const from = typeof message.from === "string" ? message.from.trim() : "";
        if (!from) continue;

        const phoneDigits = from.replace(/\D/g, "");
        if (!phoneDigits) continue;

        const ctwaRaw = findCtwaClid(message);
        const ctwaClid = ctwaRaw?.trim() ?? "";
        if (!ctwaClid) continue;

        const { sourceId, sourceUrl, sourceType } = referralSourceFields(message);
        const sendTime = new Date(messageTimestampSeconds(message) * 1000);
        const name = contactNameFromValue(value, from);

        jobs.push({
          wabaId,
          phoneNumberId: phoneNumberId?.length ? phoneNumberId : null,
          phoneDigits,
          name,
          ctwaClid,
          sourceId,
          sourceUrl,
          sourceType,
          sendTime,
        });
      }
    }
  }

  return jobs;
}
