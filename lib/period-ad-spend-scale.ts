import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { cardPayments, expenseCategories } from "@/drizzle/schema";
import { sumCardPaymentsUsd } from "@/lib/card-payments-list";
import { sumMetaInsightsSpendUsd } from "@/lib/meta-insights-spend";
import { db } from "@/lib/db";

const MARKETING_SLUGS = [
  "marketing-non-meta",
  "software",
  "bank-fees",
] as const;

export type PeriodAdSpendScale = {
  /** Multiply Insights-based ad allocations by this for cash/FX-adjusted totals. */
  scale: number;
  insightsUsd: number;
  cardUsd: number;
  fxGapUsd: number;
  /** reconciled = card rows with insights period; fallback = calendar dates only */
  method: "reconciled" | "fallback";
};

function parseNum(s: string | null | undefined): number {
  const n = Number.parseFloat(s ?? "0");
  return Number.isFinite(n) ? n : 0;
}

/**
 * Prefer card charges that declare an Insights billing window overlapping the report
 * period; scale = sum(card USD) / sum(snapshot Insights USD on those rows).
 */
export async function getPeriodAdSpendScale(
  sinceDate: string,
  untilDate: string,
): Promise<PeriodAdSpendScale> {
  const reconciledRows = await db
    .select({
      amount: cardPayments.amount,
      insightsSpendUsd: cardPayments.insightsSpendUsd,
    })
    .from(cardPayments)
    .innerJoin(
      expenseCategories,
      eq(cardPayments.categoryId, expenseCategories.id),
    )
    .where(
      and(
        inArray(expenseCategories.slug, [...MARKETING_SLUGS]),
        sql`${cardPayments.insightsPeriodStart} is not null`,
        sql`${cardPayments.insightsPeriodEnd} is not null`,
        lte(cardPayments.insightsPeriodStart, untilDate),
        gte(cardPayments.insightsPeriodEnd, sinceDate),
      ),
    );

  let cardUsd = 0;
  let insightsFromCards = 0;
  for (const r of reconciledRows) {
    cardUsd += parseNum(String(r.amount));
    insightsFromCards += parseNum(
      r.insightsSpendUsd != null ? String(r.insightsSpendUsd) : "0",
    );
  }

  if (insightsFromCards > 0.0001 && cardUsd > 0) {
    return {
      scale: cardUsd / insightsFromCards,
      insightsUsd: insightsFromCards,
      cardUsd,
      fxGapUsd: cardUsd - insightsFromCards,
      method: "reconciled",
    };
  }

  const [insightsUsd, cardUsdFallback] = await Promise.all([
    sumMetaInsightsSpendUsd(sinceDate, untilDate),
    sumCardPaymentsUsd({
      sinceDate,
      untilDate,
      categorySlugs: [...MARKETING_SLUGS],
    }),
  ]);
  const card = parseNum(cardUsdFallback);
  const insights = insightsUsd;

  return {
    scale: insights > 0.0001 ? card / insights : 1,
    insightsUsd: insights,
    cardUsd: card,
    fxGapUsd: card - insights,
    method: "fallback",
  };
}
