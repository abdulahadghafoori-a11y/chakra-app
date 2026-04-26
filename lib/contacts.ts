import { sql } from "drizzle-orm";

import { contacts } from "@/drizzle/schema";
import { db } from "@/lib/db";

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
      },
    })
    .returning({ id: contacts.id });

  if (!row) {
    throw new Error("upsertContactByPhone: no row returned");
  }
  return row;
}
