import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { ctwaSessions, metaAds } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { ensureAdHierarchyFromGraph } from "@/lib/meta-ads-sync";

/**
 * Link a CTWA session row to Meta `meta_ads` using referral `source_id` as ad id.
 * Creates campaign / ad set / ad rows via Graph when missing.
 */
export async function linkCtwaSessionToMetaAd(
  sessionId: string,
  sourceId: string | null | undefined,
): Promise<void> {
  const adId = sourceId?.trim();
  if (!adId) return;

  const [existing] = await db
    .select({ id: metaAds.id })
    .from(metaAds)
    .where(eq(metaAds.id, adId))
    .limit(1);

  if (!existing) {
    const ok = await ensureAdHierarchyFromGraph(adId);
    if (!ok) {
      console.warn("[ctwa-meta] could not resolve ad from Graph", {
        sessionId,
        adId,
      });
      return;
    }
  }

  await db
    .update(ctwaSessions)
    .set({ metaAdId: adId })
    .where(eq(ctwaSessions.id, sessionId));
}

export async function backfillUnlinkedCtwaSessions(limit: number): Promise<{
  processed: number;
  linked: number;
  failed: number;
}> {
  const cap = Math.min(200, Math.max(1, Math.floor(limit)));
  const rows = await db
    .select({
      id: ctwaSessions.id,
      sourceId: ctwaSessions.sourceId,
    })
    .from(ctwaSessions)
    .where(
      and(isNotNull(ctwaSessions.sourceId), isNull(ctwaSessions.metaAdId)),
    )
    .limit(cap);

  let linked = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await linkCtwaSessionToMetaAd(row.id, row.sourceId);
      const [check] = await db
        .select({ metaAdId: ctwaSessions.metaAdId })
        .from(ctwaSessions)
        .where(eq(ctwaSessions.id, row.id))
        .limit(1);
      if (check?.metaAdId) linked++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { processed: rows.length, linked, failed };
}
