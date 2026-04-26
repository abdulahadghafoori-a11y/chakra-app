"use server";

import { desc, eq } from "drizzle-orm";

import { contacts, ctwaSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { contactPhoneKeyFromRaw } from "@/lib/contact-phone";

export type CtwaSessionRow = {
  id: string;
  contactId: string;
  contactName: string | null;
  ctwaClid: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  sendTime: string;
};

export async function getCtwaSessionsByPhone(
  rawPhone: string,
): Promise<CtwaSessionRow[]> {
  const phoneKey = contactPhoneKeyFromRaw(rawPhone);
  if (!phoneKey) return [];

  const rows = await db
    .select({
      id: ctwaSessions.id,
      contactId: ctwaSessions.contactId,
      contactName: contacts.name,
      ctwaClid: ctwaSessions.ctwaClid,
      wabaId: ctwaSessions.wabaId,
      phoneNumberId: ctwaSessions.phoneNumberId,
      sourceId: ctwaSessions.sourceId,
      sourceUrl: ctwaSessions.sourceUrl,
      sourceType: ctwaSessions.sourceType,
      sendTime: ctwaSessions.sendTime,
    })
    .from(ctwaSessions)
    .innerJoin(contacts, eq(ctwaSessions.contactId, contacts.id))
    .where(eq(contacts.phoneNumber, phoneKey))
    .orderBy(desc(ctwaSessions.sendTime));

  return rows.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    contactName: r.contactName,
    ctwaClid: r.ctwaClid,
    wabaId: r.wabaId,
    phoneNumberId: r.phoneNumberId,
    sourceId: r.sourceId,
    sourceUrl: r.sourceUrl,
    sourceType: r.sourceType,
    sendTime: r.sendTime.toISOString(),
  }));
}
