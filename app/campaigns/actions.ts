"use server";

import { revalidatePath } from "next/cache";

import { FULL_FEATURE_UNAVAILABLE, isCoreFeatureSet } from "@/lib/feature-set";
import { assertStaffSession } from "@/lib/staff-auth/guard";
import {
  assertValidCampaignInsightRange,
  clampCampaignInsightsDays,
} from "@/lib/campaign-insights-range";
import {
  bulkSyncAdAccountStructure,
  syncAdInsightsDailyRange,
  type BulkSyncStats,
  type InsightsSyncStats,
} from "@/lib/meta-ads-sync";

export type CampaignsFullSyncResult = {
  structure: BulkSyncStats;
  insights: InsightsSyncStats;
};

/**
 * Structure + insights for the selected UTC date window; one revalidation.
 */
export async function syncCampaignsFromMetaAction(
  sinceDay: string,
  untilDay: string,
) {
  await assertStaffSession();
  if (isCoreFeatureSet()) throw new Error(FULL_FEATURE_UNAVAILABLE);
  assertValidCampaignInsightRange(sinceDay, untilDay);
  const structure = await bulkSyncAdAccountStructure();
  const insights = await syncAdInsightsDailyRange(sinceDay, untilDay);
  revalidatePath("/campaigns");
  return { structure, insights };
}

export async function syncMetaStructureAction() {
  await assertStaffSession();
  if (isCoreFeatureSet()) throw new Error(FULL_FEATURE_UNAVAILABLE);
  const stats = await bulkSyncAdAccountStructure();
  revalidatePath("/campaigns");
  return stats;
}

export async function syncMetaInsightsAction(days: number) {
  await assertStaffSession();
  if (isCoreFeatureSet()) throw new Error(FULL_FEATURE_UNAVAILABLE);
  const d = clampCampaignInsightsDays(Math.floor(days || 7));
  const until = new Date();
  const untilDay = until.toISOString().slice(0, 10);
  const start = new Date(
    Date.UTC(
      until.getUTCFullYear(),
      until.getUTCMonth(),
      until.getUTCDate() - (d - 1),
    ),
  );
  const sinceDay = start.toISOString().slice(0, 10);
  assertValidCampaignInsightRange(sinceDay, untilDay);
  const stats = await syncAdInsightsDailyRange(sinceDay, untilDay);
  revalidatePath("/campaigns");
  return stats;
}

