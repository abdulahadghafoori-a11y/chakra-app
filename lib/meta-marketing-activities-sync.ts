import { createHash } from "node:crypto";

import { inArray, lt, sql } from "drizzle-orm";

import {
  metaAds,
  metaAdSets,
  metaCampaigns,
  metaMarketingActivities,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import {
  fetchAdAccountActivities,
  type MetaMarketingActivityNode,
} from "@/lib/meta-marketing-api";

/** Cap table growth: prune archived rows whose event is older than this many days. */
export const META_ACTIVITY_RETENTION_DAYS = 120;

function normalizeExtraRaw(extra: MetaMarketingActivityNode["extra_data"]): string {
  if (extra == null) return "";
  if (typeof extra === "string") return extra;
  try {
    return JSON.stringify(extra);
  } catch {
    return "";
  }
}

function parseExtraJson(
  extra: MetaMarketingActivityNode["extra_data"],
): Record<string, unknown> | null {
  if (extra == null) return null;
  if (typeof extra === "object" && !Array.isArray(extra)) {
    return extra as Record<string, unknown>;
  }
  if (typeof extra === "string") {
    try {
      const p = JSON.parse(extra) as unknown;
      return typeof p === "object" && p !== null && !Array.isArray(p)
        ? (p as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function computeDedupeKey(parts: {
  eventTimeIso: string;
  eventType: string;
  objectId: string;
  extraRaw: string;
}): string {
  return createHash("sha256")
    .update(
      `${parts.eventTimeIso}|${parts.eventType}|${parts.objectId}|${parts.extraRaw}`,
    )
    .digest("hex");
}

/**
 * Fetch `/{act-id}/activities`, attach rows to campaigns we already store (FK-resolvable object ids),
 * dedupe via `dedupe_key`, prune rows older than {@link META_ACTIVITY_RETENTION_DAYS} by event time.
 */
export async function syncMarketingApiActivities(actId: string): Promise<{
  fetched: number;
  inserted: number;
  error?: string;
}> {
  try {
    await db.delete(metaMarketingActivities).where(
      lt(
        metaMarketingActivities.eventTime,
        sql`(now() - (${META_ACTIVITY_RETENTION_DAYS} * interval '1 day'))`,
      ),
    );
  } catch {
    /* retention best-effort */
  }

  let rows: MetaMarketingActivityNode[];
  try {
    rows = await fetchAdAccountActivities(actId);
  } catch (e) {
    return {
      fetched: 0,
      inserted: 0,
      error:
        e instanceof Error ? e.message : "Failed to fetch Meta ad account activities",
    };
  }

  const fetched = rows.length;
  if (!fetched) return { fetched: 0, inserted: 0 };

  const objectIds = [
    ...new Set(
      rows.map((r) => r.object_id?.trim()).filter((x): x is string => !!x),
    ),
  ];

  const campaignSet = new Set<string>();
  if (objectIds.length) {
    const camps = await db
      .select({ id: metaCampaigns.id })
      .from(metaCampaigns)
      .where(inArray(metaCampaigns.id, objectIds));
    for (const c of camps) campaignSet.add(c.id);
  }

  const remainingAfterCampaign = objectIds.filter((id) => !campaignSet.has(id));
  const adSetMap = new Map<string, string>();
  if (remainingAfterCampaign.length) {
    const sets = await db
      .select({ id: metaAdSets.id, cid: metaAdSets.metaCampaignId })
      .from(metaAdSets)
      .where(inArray(metaAdSets.id, remainingAfterCampaign));
    for (const s of sets) adSetMap.set(s.id, s.cid);
  }

  const remainingAfterAdSet = remainingAfterCampaign.filter(
    (id) => !adSetMap.has(id),
  );
  const adMap = new Map<string, string>();
  if (remainingAfterAdSet.length) {
    const ads = await db
      .select({ id: metaAds.id, cid: metaAds.metaCampaignId })
      .from(metaAds)
      .where(inArray(metaAds.id, remainingAfterAdSet));
    for (const a of ads) adMap.set(a.id, a.cid);
  }

  function resolveCampaignId(objectId: string | undefined): string | null {
    if (!objectId?.trim()) return null;
    const oid = objectId.trim();
    if (campaignSet.has(oid)) return oid;
    const fromAdSet = adSetMap.get(oid);
    if (fromAdSet) return fromAdSet;
    const fromAd = adMap.get(oid);
    return fromAd ?? null;
  }

  type InsertRow = typeof metaMarketingActivities.$inferInsert;
  const toInsert: InsertRow[] = [];

  for (const r of rows) {
    const eventType = r.event_type?.trim();
    const etRaw = r.event_time?.trim();
    if (!eventType || !etRaw) continue;
    const eventAt = new Date(etRaw);
    if (Number.isNaN(eventAt.getTime())) continue;

    const objectId = r.object_id?.trim() ?? "";
    const metaCampaignId = resolveCampaignId(r.object_id);
    if (!metaCampaignId) continue;

    const extraRaw = normalizeExtraRaw(r.extra_data);
    const dedupeKey = computeDedupeKey({
      eventTimeIso: eventAt.toISOString(),
      eventType,
      objectId,
      extraRaw,
    });

    toInsert.push({
      dedupeKey,
      metaCampaignId,
      eventTime: eventAt,
      eventType,
      translatedEventType: r.translated_event_type?.trim() ?? null,
      actorId: r.actor_id?.trim() ?? null,
      actorName: r.actor_name?.trim() ?? null,
      applicationName: r.application_name?.trim() ?? null,
      objectId: objectId || null,
      objectName: r.object_name?.trim() ?? null,
      objectType: r.object_type?.trim() ?? null,
      extraData: parseExtraJson(r.extra_data),
    });
  }

  let inserted = 0;
  const CHUNK = 120;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK);
    if (!slice.length) continue;
    const returning = await db
      .insert(metaMarketingActivities)
      .values(slice)
      .onConflictDoNothing({ target: metaMarketingActivities.dedupeKey })
      .returning({ id: metaMarketingActivities.id });
    inserted += returning.length;
  }

  return { fetched, inserted };
}
