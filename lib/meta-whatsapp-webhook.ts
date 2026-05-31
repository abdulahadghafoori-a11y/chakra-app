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

/**
 * Relays sometimes wrap Meta’s WhatsApp webhook JSON (`payload`, `body`, …)
 * or send it as a stringified object. Peel one layer so `object` is
 * `whatsapp_business_account` at the root.
 */
export function coerceToMetaWhatsAppWebhookBody(parsed: unknown): unknown {
  if (parsed === null || typeof parsed !== "object") return parsed;
  const r = parsed as Record<string, unknown>;
  if (r.object === "whatsapp_business_account") return parsed;

  const outerKeys = ["payload", "body", "data", "webhook", "event"] as const;

  const isWabaEnvelope = (
    inner: unknown,
  ): inner is Record<string, unknown> =>
    inner !== null &&
    typeof inner === "object" &&
    !Array.isArray(inner) &&
    (inner as Record<string, unknown>).object === "whatsapp_business_account";

  for (const k of outerKeys) {
    let inner: unknown = r[k];
    if (typeof inner === "string") {
      const t = inner.trim();
      if (!t.startsWith("{") && !t.startsWith("[")) continue;
      try {
        inner = JSON.parse(t) as unknown;
      } catch {
        continue;
      }
    }
    if (isWabaEnvelope(inner)) return inner;
  }

  return parsed;
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

/** One inbound customer message (`messages[]`): upsert {@link contacts} even without CTWA. */
export type MetaInboundContactJob = {
  wabaId: string;
  phoneNumberId: string | null;
  phoneDigits: string;
  name: string | null;
  sendTime: Date;
};

/**
 * All inbound webhook `messages[]` rows that have `from` (customer).
 * Used to ensure `contacts` exist for organic chat as well as CTWA.
 */
export function extractMetaInboundContactJobs(body: unknown): MetaInboundContactJob[] {
  const root = asRecord(body);
  if (root?.object !== "whatsapp_business_account") return [];

  const entry = root.entry;
  if (!Array.isArray(entry)) return [];

  const jobs: MetaInboundContactJob[] = [];

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

        const sendTime = new Date(messageTimestampSeconds(message) * 1000);
        const name = contactNameFromValue(value, from);

        jobs.push({
          wabaId,
          phoneNumberId: phoneNumberId?.length ? phoneNumberId : null,
          phoneDigits,
          name,
          sendTime,
        });
      }
    }
  }

  return jobs;
}

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

/** Per-request counts from `messages[]` (coexistence / attribution debugging). */
export type MetaWhatsAppInboundMessageStats = {
  /** Customer rows in `messages[]` with `from`. */
  inboundWithFrom: number;
  /** `type: "unsupported"` and Meta error code 131060 (message unavailable). */
  unavailable131060: number;
  /** Payload includes `ctwa_clid` on that message (may still fail ingest). */
  withCtwaClidInPayload: number;
  /** Has `from` but no `ctwa_clid` in payload (organic or lost CTWA attribution). */
  inboundWithFromNoClid: number;
  /** 131060 unavailable rows that also lack `ctwa_clid` (likely lost ad click). */
  unavailable131060NoClid: number;
  /** Decodable `type: "text"` with non-empty body (sales agent eligible). */
  textWithBody: number;
};

function errorCode131060(message: Record<string, unknown>): boolean {
  const errors = message.errors;
  if (!Array.isArray(errors)) return false;
  for (const err of errors) {
    const rec = asRecord(err);
    if (rec == null) continue;
    const code = rec.code;
    if (code === 131060 || code === "131060") return true;
  }
  return false;
}

function isInboundTextWithBody(message: Record<string, unknown>): boolean {
  if (message.type !== "text") return false;
  const text = asRecord(message.text);
  const body =
    text && typeof text.body === "string" ? text.body.trim() : "";
  return body.length > 0;
}

/**
 * Counts inbound customer messages for webhook metrics (131060 vs CTWA vs text).
 */
export function extractMetaInboundMessageStats(
  body: unknown,
): MetaWhatsAppInboundMessageStats {
  const empty: MetaWhatsAppInboundMessageStats = {
    inboundWithFrom: 0,
    unavailable131060: 0,
    withCtwaClidInPayload: 0,
    inboundWithFromNoClid: 0,
    unavailable131060NoClid: 0,
    textWithBody: 0,
  };

  const root = asRecord(body);
  if (root?.object !== "whatsapp_business_account") return empty;

  const entry = root.entry;
  if (!Array.isArray(entry)) return empty;

  const stats = { ...empty };

  for (const ent of entry) {
    const entRec = asRecord(ent);
    const changes = entRec?.changes;
    if (!Array.isArray(changes)) continue;

    for (const ch of changes) {
      const chRec = asRecord(ch);
      if (chRec?.field !== "messages") continue;
      const value = asRecord(chRec?.value);
      if (!value) continue;

      const messages = value.messages;
      if (!Array.isArray(messages)) continue;

      for (const msg of messages) {
        const message = asRecord(msg);
        if (!message) continue;

        const from = typeof message.from === "string" ? message.from.trim() : "";
        if (!from || !from.replace(/\D/g, "")) continue;

        stats.inboundWithFrom++;

        const unavailable =
          message.type === "unsupported" && errorCode131060(message);
        if (unavailable) stats.unavailable131060++;

        const hasClid = Boolean(findCtwaClid(message)?.trim());
        if (hasClid) stats.withCtwaClidInPayload++;
        else stats.inboundWithFromNoClid++;

        if (unavailable && !hasClid) stats.unavailable131060NoClid++;

        if (isInboundTextWithBody(message)) stats.textWithBody++;
      }
    }
  }

  return stats;
}
