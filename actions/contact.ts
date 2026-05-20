"use server";

import { eq } from "drizzle-orm";

import { contacts } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { contactPhoneKeyFromRaw } from "@/lib/contact-phone";
import { enforcePublicActionRateLimit } from "@/lib/rate-limit";

export type ContactLookup = {
  id: string;
  phoneNumber: string;
  name: string | null;
  countryCode: string | null;
  countryName: string | null;
  createTime: string;
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
  };
}
