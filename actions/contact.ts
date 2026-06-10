"use server";

import { eq } from "drizzle-orm";

import { contacts } from "@/drizzle/schema";
import { createOfflineContactByPhone } from "@/lib/contacts";
import { db } from "@/lib/db";
import { contactPhoneKeyFromRaw } from "@/lib/contact-phone";
import { isOfflinePlaceholderPhone } from "@/lib/offline-contact-phone";
import { enforcePublicActionRateLimit } from "@/lib/rate-limit";
import {
  contactSourceFromDb,
  type ContactSource,
  type OrderSalesChannel,
} from "@/lib/sales-channel";

export type ContactLookup = {
  id: string;
  phoneNumber: string;
  name: string | null;
  countryCode: string | null;
  countryName: string | null;
  createTime: string;
  source: ContactSource;
};

export async function getContactByPhone(
  rawPhone: string,
): Promise<ContactLookup | null> {
  const limited = await enforcePublicActionRateLimit("contact_lookup", {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limited.ok) return null;

  const phoneKey = contactPhoneKeyFromRaw(rawPhone);
  if (!phoneKey) return null;

  const [row] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phoneNumber, phoneKey))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    phoneNumber: row.phoneNumber,
    name: row.name,
    countryCode: row.countryCode,
    countryName: row.countryName,
    createTime: row.createTime.toISOString(),
    source: contactSourceFromDb(row.source),
  };
}

export type ContactNewOrderPrefill = {
  contactId: string;
  name: string | null;
  /** E.164 suitable for the new-order phone field; null when no real number. */
  phoneE164: string | null;
  source: ContactSource;
  salesChannel: OrderSalesChannel;
};

export async function getContactForNewOrderPrefill(
  contactId: string,
): Promise<ContactNewOrderPrefill | null> {
  const limited = await enforcePublicActionRateLimit("contact_new_order_prefill", {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limited.ok) return null;

  const id = contactId.trim();
  if (!id) return null;

  const [row] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  if (!row) return null;

  const source = contactSourceFromDb(row.source);
  let phoneE164: string | null = null;
  if (!isOfflinePlaceholderPhone(row.phoneNumber)) {
    const digits = row.phoneNumber.replace(/\D/g, "");
    phoneE164 = digits ? `+${digits}` : null;
  }

  return {
    contactId: row.id,
    name: row.name,
    phoneE164,
    source,
    salesChannel: source === "offline" ? "offline" : "online",
  };
}

export type RegisterOfflineContactResult =
  | { ok: true; contact: ContactLookup }
  | { ok: false; error: string };

/** Register an in-store customer by phone when they are not in the contact list yet. */
export async function registerOfflineContactForNewOrder(
  rawPhone: string,
  name?: string,
): Promise<RegisterOfflineContactResult> {
  const limited = await enforcePublicActionRateLimit("register_offline_contact", {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.ok) return { ok: false, error: limited.error };

  const phoneKey = contactPhoneKeyFromRaw(rawPhone);
  if (rawPhone.trim() && !phoneKey) {
    return {
      ok: false,
      error: "Enter a valid phone number (with country code), or leave blank.",
    };
  }

  try {
    const created = await createOfflineContactByPhone({
      phoneNumber: phoneKey ?? undefined,
      name: name?.trim() || undefined,
    });
    const [row] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, created.id))
      .limit(1);
    if (!row) {
      return { ok: false, error: "Contact was created but could not be loaded." };
    }
    return {
      ok: true,
      contact: {
        id: row.id,
        phoneNumber: row.phoneNumber,
        name: row.name,
        countryCode: row.countryCode,
        countryName: row.countryName,
        createTime: row.createTime.toISOString(),
        source: contactSourceFromDb(row.source),
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not register contact.",
    };
  }
}
