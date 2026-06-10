import { sumMetaInsightsSpendUsd } from "@/lib/meta-insights-spend";

export type CardFxReconciliation = {
  insightsPeriodStart: string;
  insightsPeriodEnd: string;
  insightsSpendUsd: number;
  cardAmountUsd: number;
  cardAmountAfn: number;
  afnPerUsdSnapshot: number;
  /** Bank-implied AFN per 1 USD from this charge (AFN ÷ USD at your logged rate). */
  impliedBankAfnPerUsd: number;
  /** USD gap: card (your FX) − Insights total. Positive = you paid more USD-equivalent than Insights. */
  fxGapUsd: number;
  /** Multiply Insights-based allocations by this to match cash charged (card USD ÷ Insights USD). */
  cashScaleFactor: number;
  /** Percent difference vs Insights (for display). */
  fxGapPercent: number | null;
};

export function computeCardFxReconciliation(input: {
  insightsPeriodStart: string;
  insightsPeriodEnd: string;
  insightsSpendUsd: number;
  cardAmountUsd: number;
  cardAmountAfn: number;
  afnPerUsdSnapshot: number;
}): CardFxReconciliation {
  const insights = input.insightsSpendUsd;
  const cardUsd = input.cardAmountUsd;
  const afn = input.cardAmountAfn;
  const appRate = input.afnPerUsdSnapshot;

  const impliedBankAfnPerUsd = cardUsd > 0 ? afn / cardUsd : appRate;
  const fxGapUsd = cardUsd - insights;
  const cashScaleFactor = insights > 0 ? cardUsd / insights : 1;
  const fxGapPercent =
    insights > 0 ? ((cardUsd - insights) / insights) * 100 : null;

  return {
    insightsPeriodStart: input.insightsPeriodStart,
    insightsPeriodEnd: input.insightsPeriodEnd,
    insightsSpendUsd: insights,
    cardAmountUsd: cardUsd,
    cardAmountAfn: afn,
    afnPerUsdSnapshot: appRate,
    impliedBankAfnPerUsd,
    fxGapUsd,
    cashScaleFactor,
    fxGapPercent,
  };
}

export async function buildCardFxReconciliation(input: {
  insightsPeriodStart: string;
  insightsPeriodEnd: string;
  cardAmountUsd: number;
  cardAmountAfn: number;
  afnPerUsdSnapshot: number;
}): Promise<CardFxReconciliation> {
  const insightsSpendUsd = await sumMetaInsightsSpendUsd(
    input.insightsPeriodStart,
    input.insightsPeriodEnd,
  );
  return computeCardFxReconciliation({
    ...input,
    insightsSpendUsd,
  });
}
