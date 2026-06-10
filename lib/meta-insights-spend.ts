import { and, gte, lte, sql } from "drizzle-orm";

import { adInsightsDaily } from "@/drizzle/schema";
import { db } from "@/lib/db";

function parseSum(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? "0");
  return Number.isFinite(n) ? n : 0;
}

/** Total Meta Ads Manager spend (USD) from synced daily insights in a calendar range. */
export async function sumMetaInsightsSpendUsd(
  sinceDate: string,
  untilDate: string,
): Promise<number> {
  const [row] = await db
    .select({
      s: sql<string>`coalesce(sum(${adInsightsDaily.spend}::numeric), 0)::text`,
    })
    .from(adInsightsDaily)
    .where(
      and(
        gte(adInsightsDaily.insightDate, sinceDate),
        lte(adInsightsDaily.insightDate, untilDate),
      ),
    );
  return parseSum(row?.s);
}
