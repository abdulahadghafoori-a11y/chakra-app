import { eq, sql } from "drizzle-orm";

import { contacts } from "@/drizzle/schema";
import { countryFromPhoneDigits } from "@/lib/contact-phone";
import { db } from "@/lib/db";
import { allocateOfflinePlaceholderPhone } from "@/lib/offline-contact-phone";

export type UpsertContactInput = {
  /** International digits only (WhatsApp `wa_id`); unique key (`contacts.phone_number`). */
  phoneNumber: string;
  name: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  /** Candidate event time; merged with LEAST on conflict. */
  createTime: Date;
};

/**
 * One contact per phone (international digits). Idempotent for concurrent webhooks (unique on phone_number).
 * Keeps existing name when a webhook sends an empty name; country only fills/wins non-null
 * updates; create_time is always the earliest seen candidate.
 */
export async function upsertContactByPhone(
  input: UpsertContactInput,
): Promise<{ id: string }> {
  const name = input.name?.trim() || null;
  const countryCode = input.countryCode?.trim() || null;
  const countryName = input.countryName?.trim() || null;

  const [row] = await db
    .insert(contacts)
    .values({
      phoneNumber: input.phoneNumber,
      name,
      countryCode: countryCode || null,
      countryName: countryName || null,
      createTime: input.createTime,
      source: "whatsapp",
    })
    .onConflictDoUpdate({
      target: contacts.phoneNumber,
      set: {
        name: sql`
          COALESCE(
            NULLIF(EXCLUDED.name, ''),
            ${contacts.name}
          )
        `,
        countryCode: sql`COALESCE(EXCLUDED.country_code, ${contacts.countryCode})`,
        countryName: sql`COALESCE(EXCLUDED.country_name, ${contacts.countryName})`,
        createTime: sql`LEAST(${contacts.createTime}, EXCLUDED.create_time)`,
        source: "whatsapp",
      },
    })
    .returning({ id: contacts.id });

  if (!row) {
    throw new Error("upsertContactByPhone: no row returned");
  }
  return row;
}

export type CreateOfflineContactInput = {
  /** International digits; omit when the customer did not provide a number. */
  phoneNumber?: string | null;
  name?: string | null;
  createTime?: Date;
};

/**
 * In-store customer without a WhatsApp thread. Idempotent on phone when a number is given.
 */
export async function createOfflineContactByPhone(
  input: CreateOfflineContactInput,
): Promise<{ id: string; created: boolean }> {
  const digits = input.phoneNumber?.replace(/\D/g, "") ?? "";
  const phoneNumber =
    digits.length > 0 ? digits : allocateOfflinePlaceholderPhone();
  const name = input.name?.trim() || null;
  const createTime = input.createTime ?? new Date();
  const { countryCode, countryName } = countryFromPhoneDigits(phoneNumber);

  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.phoneNumber, phoneNumber))
    .limit(1);

  if (existing) {
    return { id: existing.id, created: false };
  }

  const [row] = await db
    .insert(contacts)
    .values({
      phoneNumber,
      name,
      countryCode: digits.length > 0 ? countryCode : null,
      countryName: digits.length > 0 ? countryName : null,
      createTime,
      source: "offline",
    })
    .returning({ id: contacts.id });

  if (!row) {
    throw new Error("createOfflineContactByPhone: no row returned");
  }
  return { id: row.id, created: true };
}
