import { sql } from "drizzle-orm";

import {
  adInsightsDaily,
  metaAdSets,
  metaAds,
  metaCampaigns,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import {
  metaPurchasesFromActions,
  messagingConversationsStartedFromActions,
  parseActionsFromInsight,
} from "@/lib/meta-insights-actions";
import {
  fetchAdById,
  fetchAdInsightsDailyRange,
  fetchAdSetById,
  fetchAdsForAdSet,
  fetchAdSetsForCampaign,
  fetchCampaignById,
  fetchCampaignsForAccount,
  getMetaAdAccountId,
  type MetaAdNode,
  type MetaAdSetNode,
  type MetaCampaignNode,
} from "@/lib/meta-marketing-api";

const nowSync = () => new Date();

export async function upsertMetaCampaign(row: {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  effectiveStatus: string | null;
}): Promise<void> {
  const t = nowSync();
  await db
    .insert(metaCampaigns)
    .values({
      id: row.id,
      name: row.name,
      objective: row.objective,
      status: row.status,
      effectiveStatus: row.effectiveStatus,
      syncedAt: t,
    })
    .onConflictDoUpdate({
      target: metaCampaigns.id,
      set: {
        name: sql`excluded.name`,
        objective: sql`excluded.objective`,
        status: sql`excluded.status`,
        effectiveStatus: sql`excluded.effective_status`,
        syncedAt: t,
      },
    });
}

export async function upsertMetaAdSet(row: {
  id: string;
  metaCampaignId: string;
  name: string | null;
  status: string | null;
  effectiveStatus: string | null;
}): Promise<void> {
  const t = nowSync();
  await db
    .insert(metaAdSets)
    .values({
      id: row.id,
      metaCampaignId: row.metaCampaignId,
      name: row.name,
      status: row.status,
      effectiveStatus: row.effectiveStatus,
      syncedAt: t,
    })
    .onConflictDoUpdate({
      target: metaAdSets.id,
      set: {
        metaCampaignId: sql`excluded.meta_campaign_id`,
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        effectiveStatus: sql`excluded.effective_status`,
        syncedAt: t,
      },
    });
}

export async function upsertMetaAd(row: {
  id: string;
  metaAdSetId: string;
  metaCampaignId: string;
  name: string | null;
  status: string | null;
  effectiveStatus: string | null;
}): Promise<void> {
  const t = nowSync();
  await db
    .insert(metaAds)
    .values({
      id: row.id,
      metaAdSetId: row.metaAdSetId,
      metaCampaignId: row.metaCampaignId,
      name: row.name,
      status: row.status,
      effectiveStatus: row.effectiveStatus,
      syncedAt: t,
    })
    .onConflictDoUpdate({
      target: metaAds.id,
      set: {
        metaAdSetId: sql`excluded.meta_ad_set_id`,
        metaCampaignId: sql`excluded.meta_campaign_id`,
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        effectiveStatus: sql`excluded.effective_status`,
        syncedAt: t,
      },
    });
}

function mapCampaign(c: MetaCampaignNode) {
  return {
    id: c.id,
    name: c.name ?? null,
    objective: c.objective ?? null,
    status: c.status ?? null,
    effectiveStatus: c.effective_status ?? null,
  };
}

function mapAdSet(a: MetaAdSetNode) {
  return {
    id: a.id,
    metaCampaignId: a.campaign_id,
    name: a.name ?? null,
    status: a.status ?? null,
    effectiveStatus: a.effective_status ?? null,
  };
}

function mapAd(ad: MetaAdNode) {
  return {
    id: ad.id,
    metaAdSetId: ad.adset_id,
    metaCampaignId: ad.campaign_id,
    name: ad.name ?? null,
    status: ad.status ?? null,
    effectiveStatus: ad.effective_status ?? null,
  };
}

export type BulkSyncStats = {
  campaigns: number;
  adSets: number;
  ads: number;
  errors: string[];
};

/** Walk ad account and upsert campaigns → ad sets → ads. */
export async function bulkSyncAdAccountStructure(): Promise<BulkSyncStats> {
  const actId = getMetaAdAccountId();
  const stats: BulkSyncStats = { campaigns: 0, adSets: 0, ads: 0, errors: [] };
  let campaignList: MetaCampaignNode[] = [];
  try {
    campaignList = await fetchCampaignsForAccount(actId);
  } catch (e) {
    stats.errors.push(
      e instanceof Error ? e.message : "Failed to list campaigns",
    );
    return stats;
  }

  for (const c of campaignList) {
    try {
      await upsertMetaCampaign(mapCampaign(c));
      stats.campaigns++;
    } catch (e) {
      stats.errors.push(
        `campaign ${c.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  for (const c of campaignList) {
    let adsets: MetaAdSetNode[] = [];
    try {
      adsets = await fetchAdSetsForCampaign(c.id);
    } catch (e) {
      stats.errors.push(
        `adsets for campaign ${c.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }
    for (const a of adsets) {
      try {
        await upsertMetaAdSet(mapAdSet(a));
        stats.adSets++;
      } catch (e) {
        stats.errors.push(
          `adset ${a.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    for (const a of adsets) {
      let ads: MetaAdNode[] = [];
      try {
        ads = await fetchAdsForAdSet(a.id);
      } catch (e) {
        stats.errors.push(
          `ads for adset ${a.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }
      for (const ad of ads) {
        try {
          await upsertMetaAd(mapAd(ad));
          stats.ads++;
        } catch (e) {
          stats.errors.push(
            `ad ${ad.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }

  return stats;
}

/**
 * Ensure FK chain exists (minimal rows) — used before inserting insights or when CTWA references an unknown ad.
 */
export async function ensureMetaHierarchyIds(
  campaignId: string,
  adsetId: string,
  adId: string,
): Promise<void> {
  const t = nowSync();
  await db
    .insert(metaCampaigns)
    .values({
      id: campaignId,
      name: null,
      objective: null,
      status: null,
      effectiveStatus: null,
      syncedAt: t,
    })
    .onConflictDoUpdate({
      target: metaCampaigns.id,
      set: { syncedAt: t },
    });

  await db
    .insert(metaAdSets)
    .values({
      id: adsetId,
      metaCampaignId: campaignId,
      name: null,
      status: null,
      effectiveStatus: null,
      syncedAt: t,
    })
    .onConflictDoUpdate({
      target: metaAdSets.id,
      set: {
        metaCampaignId: sql`excluded.meta_campaign_id`,
        syncedAt: t,
      },
    });

  await db
    .insert(metaAds)
    .values({
      id: adId,
      metaAdSetId: adsetId,
      metaCampaignId: campaignId,
      name: null,
      status: null,
      effectiveStatus: null,
      syncedAt: t,
    })
    .onConflictDoUpdate({
      target: metaAds.id,
      set: {
        metaAdSetId: sql`excluded.meta_ad_set_id`,
        metaCampaignId: sql`excluded.meta_campaign_id`,
        syncedAt: t,
      },
    });
}

/** Fetch ad + parents from Graph and upsert full rows. */
export async function ensureAdHierarchyFromGraph(adId: string): Promise<boolean> {
  const trimmed = adId.trim();
  if (!trimmed) return false;
  let ad;
  try {
    ad = await fetchAdById(trimmed);
  } catch {
    return false;
  }
  const adsetId = ad.adset_id?.trim();
  const campaignId = ad.campaign_id?.trim();
  if (!adsetId || !campaignId) return false;

  const [adset, campaign] = await Promise.all([
    fetchAdSetById(adsetId),
    fetchCampaignById(campaignId),
  ]);

  await upsertMetaCampaign({
    id: campaign.id,
    name: campaign.name ?? null,
    objective: campaign.objective ?? null,
    status: campaign.status ?? null,
    effectiveStatus: campaign.effective_status ?? null,
  });
  await upsertMetaAdSet({
    id: adset.id,
    metaCampaignId: campaign.id,
    name: adset.name ?? null,
    status: adset.status ?? null,
    effectiveStatus: adset.effective_status ?? null,
  });
  await upsertMetaAd({
    id: ad.id,
    metaAdSetId: adset.id,
    metaCampaignId: campaign.id,
    name: ad.name ?? null,
    status: ad.status ?? null,
    effectiveStatus: ad.effective_status ?? null,
  });
  return true;
}

export type InsightsSyncStats = {
  rowsUpserted: number;
  errors: string[];
};

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pull daily ad-level insights for [since, until] inclusive (YYYY-MM-DD). */
export async function syncAdInsightsDailyRange(
  since: string,
  until: string,
): Promise<InsightsSyncStats> {
  const actId = getMetaAdAccountId();
  const stats: InsightsSyncStats = { rowsUpserted: 0, errors: [] };
  let rows: Awaited<ReturnType<typeof fetchAdInsightsDailyRange>> = [];
  try {
    rows = await fetchAdInsightsDailyRange(actId, since, until);
  } catch (e) {
    stats.errors.push(e instanceof Error ? e.message : String(e));
    return stats;
  }

  const t = nowSync();
  for (const row of rows) {
    const adId = row.ad_id?.trim();
    const adsetId = row.adset_id?.trim();
    const campaignId = row.campaign_id?.trim();
    const day = row.date_start?.trim();
    if (!adId || !day || !adsetId || !campaignId) continue;

    try {
      await ensureMetaHierarchyIds(campaignId, adsetId, adId);
    } catch (e) {
      stats.errors.push(
        `hierarchy ${adId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }

    const spend = row.spend ? Number(row.spend) : 0;
    const impressions = row.impressions ? parseInt(row.impressions, 10) : 0;
    const clicks = row.clicks ? parseInt(row.clicks, 10) : 0;
    const currency = row.account_currency?.trim() || "USD";
    const actionRows = parseActionsFromInsight(row.actions);
    const messagingStarted =
      messagingConversationsStartedFromActions(actionRows);
    const metaPurchases = metaPurchasesFromActions(actionRows);

    try {
      await db
        .insert(adInsightsDaily)
        .values({
          insightDate: day,
          metaAdId: adId,
          metaAdSetId: adsetId,
          metaCampaignId: campaignId,
          spend: String(spend),
          impressions: Number.isFinite(impressions) ? impressions : 0,
          clicks: Number.isFinite(clicks) ? clicks : 0,
          messagingConversationsStarted: messagingStarted,
          metaPurchases,
          currency,
          syncedAt: t,
        })
        .onConflictDoUpdate({
          target: [adInsightsDaily.insightDate, adInsightsDaily.metaAdId],
          set: {
            metaAdSetId: sql`excluded.meta_ad_set_id`,
            metaCampaignId: sql`excluded.meta_campaign_id`,
            spend: sql`excluded.spend`,
            impressions: sql`excluded.impressions`,
            clicks: sql`excluded.clicks`,
            messagingConversationsStarted: sql`excluded.messaging_conversations_started`,
            metaPurchases: sql`excluded.meta_purchases`,
            currency: sql`excluded.currency`,
            syncedAt: t,
          },
        });
      stats.rowsUpserted++;
    } catch (e) {
      stats.errors.push(
        `insight ${adId} ${day}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return stats;
}

/** Last n days including today (UTC). */
export async function syncAdInsightsLastDays(days: number): Promise<InsightsSyncStats> {
  const until = isoDateOnly(new Date());
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1));
  const since = isoDateOnly(start);
  return syncAdInsightsDailyRange(since, until);
}
