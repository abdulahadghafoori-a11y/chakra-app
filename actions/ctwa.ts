"use server";

import { desc, eq } from "drizzle-orm";

import { contacts, ctwaSessions, metaAds, metaCampaigns } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { contactPhoneKeyFromRaw } from "@/lib/contact-phone";
import { enforcePublicActionRateLimit } from "@/lib/rate-limit";

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
  metaCampaignId: string | null;
  campaignName: string | null;
};

export async function getCtwaSessionsByPhone(
  rawPhone: string,
): Promise<CtwaSessionRow[]> {
  const limited = await enforcePublicActionRateLimit("ctwa_lookup", {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limited.ok) return [];

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
      metaCampaignId: metaCampaigns.id,
      campaignName: metaCampaigns.name,
    })
    .from(ctwaSessions)
    .innerJoin(contacts, eq(ctwaSessions.contactId, contacts.id))
    .leftJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .leftJoin(metaCampaigns, eq(metaAds.metaCampaignId, metaCampaigns.id))
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
    metaCampaignId: r.metaCampaignId,
    campaignName: r.campaignName,
  }));
}
