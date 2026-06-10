/**
 * Configured WhatsApp Business Accounts (WABAs) for CAPI dataset routing and outbound send.
 * Set `META_WABA_ACCOUNTS` — JSON array of account objects (see `.env.example`).
 */

import { normalizeMetaEnvId } from "@/lib/meta-capi-shared";

export type WhatsAppWabaAccount = {
  /** Meta WhatsApp Business Account id (`entry.id` on webhooks). */
  id: string;
  /** Staff-facing label in the new-order form. */
  label: string;
  /** Events Manager dataset id bound to this WABA. */
  datasetId: string;
  /** Cloud API phone number id for outbound Graph send on this line. */
  phoneNumberId: string;
};

function parseRegistryJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      "META_WABA_ACCOUNTS must be valid JSON (array of { id, label, datasetId, phoneNumberId }).",
    );
  }
}

function normalizeAccountRow(row: unknown, index: number): WhatsAppWabaAccount {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`META_WABA_ACCOUNTS[${index}] must be an object.`);
  }
  const rec = row as Record<string, unknown>;
  const id = normalizeMetaEnvId(
    typeof rec.id === "string" ? rec.id : undefined,
  );
  const label = typeof rec.label === "string" ? rec.label.trim() : "";
  const datasetId = normalizeMetaEnvId(
    typeof rec.datasetId === "string" ? rec.datasetId : undefined,
  );
  const phoneNumberId = normalizeMetaEnvId(
    typeof rec.phoneNumberId === "string" ? rec.phoneNumberId : undefined,
  );

  if (!id || !/^\d+$/.test(id)) {
    throw new Error(
      `META_WABA_ACCOUNTS[${index}].id must be a numeric Meta WABA id.`,
    );
  }
  if (!label) {
    throw new Error(`META_WABA_ACCOUNTS[${index}].label is required.`);
  }
  if (!datasetId || !/^\d+$/.test(datasetId)) {
    throw new Error(
      `META_WABA_ACCOUNTS[${index}].datasetId must be a numeric Events Manager dataset id.`,
    );
  }
  if (!phoneNumberId || !/^\d+$/.test(phoneNumberId)) {
    throw new Error(
      `META_WABA_ACCOUNTS[${index}].phoneNumberId must be a numeric Cloud API phone number id.`,
    );
  }

  return { id, label, datasetId, phoneNumberId };
}

let cachedAccounts: WhatsAppWabaAccount[] | null = null;

/** Parse and validate `META_WABA_ACCOUNTS` (cached per process). */
export function listWhatsAppWabaAccounts(): WhatsAppWabaAccount[] {
  if (cachedAccounts) return cachedAccounts;

  const raw = process.env.META_WABA_ACCOUNTS?.trim();
  if (!raw) {
    throw new Error(
      "META_WABA_ACCOUNTS is not set. Add a JSON array with your WhatsApp business lines (see README).",
    );
  }

  const parsed = parseRegistryJson(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("META_WABA_ACCOUNTS must be a non-empty JSON array.");
  }

  cachedAccounts = parsed.map(normalizeAccountRow);
  return cachedAccounts;
}

/** Reset cache (tests). */
export function resetWhatsAppWabaRegistryCache(): void {
  cachedAccounts = null;
}

export function getWhatsAppWabaAccount(wabaId: string): WhatsAppWabaAccount {
  const id = normalizeMetaEnvId(wabaId);
  if (!id) {
    throw new Error("WhatsApp business account id is required.");
  }
  const account = listWhatsAppWabaAccounts().find((a) => a.id === id);
  if (!account) {
    throw new Error(
      `Unknown WhatsApp business account ${id}. Add it to META_WABA_ACCOUNTS.`,
    );
  }
  return account;
}

export function resolveMetaDatasetIdForWaba(wabaId: string): string {
  return getWhatsAppWabaAccount(wabaId).datasetId;
}

export function resolvePhoneNumberIdForWaba(wabaId: string): string {
  return getWhatsAppWabaAccount(wabaId).phoneNumberId;
}

/** Serializable rows for client UI (no secrets). */
export type WhatsAppWabaAccountOption = Pick<
  WhatsAppWabaAccount,
  "id" | "label"
>;

export function listWhatsAppWabaAccountOptions(): WhatsAppWabaAccountOption[] {
  return listWhatsAppWabaAccounts().map(({ id, label }) => ({ id, label }));
}
