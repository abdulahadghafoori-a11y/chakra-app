import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import {
  adInsightsDaily,
  campaignActivity,
  ctwaSessions,
  metaAds,
  metaAdSets,
  metaCampaigns,
  metaMarketingActivities,
  orders,
} from "@/drizzle/schema";
import { META_MARKETING_API_ACTIVITY_EMAIL } from "@/lib/campaign-activity";
import {
  sqlCampaignConvertedOrdersCount,
  sqlCampaignConvertedRevenueSum,
  sqlCampaignTotalOrdersCount,
} from "@/lib/campaign-order-counts";
import {
  addUtcDaysToDateOnly,
  daysBetweenInclusive,
} from "@/lib/campaign-insights-range";
import type { CampaignPnLFractions } from "@/lib/campaign-pnl-params";
import {
  DEFAULT_CAMPAIGN_CARD_FEE_PERCENT,
  DEFAULT_CAMPAIGN_SALES_COMMISSION_PERCENT,
} from "@/lib/campaign-pnl-params";
import {
  mergeDayEconomyMaps,
  rollupConvertedEconomyByCampaignByDayCtwa,
  rollupConvertedEconomyByCampaignByDayManual,
  rollupSpendByCampaignByDay,
  listUtcDaysInclusive,
  getCampaignPerformanceRollups,
  rollupCtwaSessionsByAdForCampaign,
  rollupAttributedOrdersAggByAdForCampaign,
  rollupLineCogsByAdForCampaign,
  rollupPaidOperationalCostsByAdForCampaign,
  rollupAdMetaEngagementSignalsForCampaign,
  type CampaignPerformanceRow,
} from "@/lib/campaigns-rollups";
import { getCampaignThresholds } from "@/lib/campaign-thresholds";
import type {
  CampaignVerdict,
  CampaignVerdictResult,
} from "@/lib/campaign-verdict";
import { evaluateCampaign } from "@/lib/campaign-verdict";
import { db } from "@/lib/db";
import {
  metaQualityRankingToScore0to1,
  parseInsightsFrequencyRaw,
} from "@/lib/meta-insights-quality";

function num(s: string | null | undefined): number {
  if (s == null || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Neon/driver may return aggregates as strings; normalize for `.toISOString()` callers. */
function coercePgDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const d =
    typeof raw === "string" || typeof raw === "number"
      ? new Date(raw)
      : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

export type CampaignDailyPerformanceRow = {
  day: string;
  spend: number;
  impressions: number;
  clicks: number;
  /** clicks / impressions when impressions > 0 */
  ctr: number | null;
  messagingStarted: number;
  metaPurchases: number;
  /** Distinct app orders attributed to this campaign (UTC day). */
  attributedOrdersCount: number;
  convertedRevenue: number;
  convertedCogs: number;
  deliveryCost: number;
  payableAdSpend: number;
  salesCommission: number;
  dailyNetProfit: number;
  weightedFrequency: number | null;
  weightedQualityScore: number | null;
};

function emptyAdAttributedOrderAgg(): {
  ordersCount: number;
  paidOrdersCount: number;
  pendingOrdersCount: number;
  confirmedOrdersCount: number;
  shippedOrdersCount: number;
  cancelledOrdersCount: number;
  returnedOrdersCount: number;
  totalRevenue: number;
  paidRevenue: number;
  convertedOrdersCount: number;
  convertedRevenue: number;
  capiSentCount: number;
} {
  return {
    ordersCount: 0,
    paidOrdersCount: 0,
    pendingOrdersCount: 0,
    confirmedOrdersCount: 0,
    shippedOrdersCount: 0,
    cancelledOrdersCount: 0,
    returnedOrdersCount: 0,
    totalRevenue: 0,
    paidRevenue: 0,
    convertedOrdersCount: 0,
    convertedRevenue: 0,
    capiSentCount: 0,
  };
}

export type CampaignAdBreakdownRow = {
  metaAdId: string;
  adName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  costPerCtwa: number | null;
  ctwaSessions: number;
  metaMessagingConversationsStarted: number;
  metaPurchases: number;
  ordersCount: number;
  paidOrdersCount: number;
  pendingOrdersCount: number;
  confirmedOrdersCount: number;
  shippedOrdersCount: number;
  convertedOrdersCount: number;
  convertedRevenue: number;
  grossProfitPaid: number;
  paidAdSpend: number;
  salesCommissionPaid: number;
  paidOperationalCosts: number;
  netProfitPaid: number;
  verdict: CampaignVerdict;
  verdictDetail: CampaignVerdictResult;
  metaWeeklyAvgFrequency: number | null;
  metaQualityScore7d: number | null;
  metaQualityLowStreakDays: number | null;
  metaFirstImpressionShare7d: number | null;
};

export type CampaignAttributedOrderRow = {
  orderId: string;
  orderEventAt: Date;
  status: string;
  valueUsd: string;
  path: "ctwa" | "manual";
  metaAdId: string | null;
  /**
   * Latest CTWA referral `send_time` for this buyer (`orders.contact_id`), across all sessions —
   * use as “when they last messaged from an ad.”
   */
  buyerLatestCtwaSendAt: Date | null;
};

export type AttributionSplit = {
  path: "ctwa" | "manual";
  ordersCount: number;
  convertedOrdersCount: number;
  convertedRevenue: number;
};

export function priorEqualUtcWindowBounds(sinceDay: string, untilDay: string): {
  prevSinceDay: string;
  prevUntilDay: string;
  prevSinceIso: string;
  prevUntilIso: string;
} {
  const spanDays = daysBetweenInclusive(sinceDay, untilDay);
  const prevUntilDay = addUtcDaysToDateOnly(sinceDay, -1);
  const prevSinceDay = addUtcDaysToDateOnly(prevUntilDay, -(spanDays - 1));
  const prevSinceIso = `${prevSinceDay}T00:00:00.000Z`;
  const prevUntilIso = `${prevUntilDay}T23:59:59.999Z`;
  return { prevSinceDay, prevUntilDay, prevSinceIso, prevUntilIso };
}

export async function loadCampaignMetaHeader(metaCampaignId: string) {
  const [row] = await db
    .select()
    .from(metaCampaigns)
    .where(eq(metaCampaigns.id, metaCampaignId))
    .limit(1);
  return row ?? null;
}

export async function loadCampaignStructureSubtree(metaCampaignId: string) {
  const sets = await db
    .select()
    .from(metaAdSets)
    .where(eq(metaAdSets.metaCampaignId, metaCampaignId))
    .orderBy(asc(metaAdSets.name));

  const ads = await db
    .select()
    .from(metaAds)
    .where(eq(metaAds.metaCampaignId, metaCampaignId))
    .orderBy(asc(metaAds.name));

  const adsByAdSet = new Map<string, typeof ads>();
  for (const ad of ads) {
    const list = adsByAdSet.get(ad.metaAdSetId) ?? [];
    list.push(ad);
    adsByAdSet.set(ad.metaAdSetId, list);
  }

  return sets.map((s) => ({
    ...s,
    ads: adsByAdSet.get(s.id) ?? [],
  }));
}

export async function getCampaignPerformanceSlice(
  metaCampaignId: string,
  sinceIso: string,
  untilIso: string,
  sinceDay: string,
  untilDay: string,
  pnl: CampaignPnLFractions,
): Promise<CampaignPerformanceRow | null> {
  const rows = await getCampaignPerformanceRollups(
    sinceIso,
    untilIso,
    sinceDay,
    untilDay,
    pnl,
  );
  return rows.find((r) => r.metaCampaignId === metaCampaignId) ?? null;
}

export function computeCampaignOperationalWarnings(
  primary: CampaignPerformanceRow | null,
  prior: CampaignPerformanceRow | null,
): string[] {
  const w: string[] = [];
  if (!primary) {
    w.push("No cockpit rollup row for this campaign in the selected window.");
    return w;
  }
  if (primary.spend > 0 && primary.convertedOrdersCount === 0) {
    w.push(
      "Meta spend recorded but zero converted orders (paid, confirmed, shipped) in this window.",
    );
  }
  if (primary.convertedRevenue > 0 && primary.spend <= 0) {
    w.push(
      "Converted revenue without Meta spend in this window — confirm dates and Insights sync.",
    );
  }
  if (
    prior &&
    primary.impressions > 500 &&
    prior.impressions > 500 &&
    primary.ctr != null &&
    prior.ctr != null &&
    prior.ctr > 1e-9 &&
    primary.ctr < prior.ctr * 0.5
  ) {
    w.push(
      "CTR is roughly half or less vs the prior equal-length UTC window.",
    );
  }
  return w;
}

export async function getCampaignAttributionSplit(
  metaCampaignId: string,
  sinceIso: string,
  untilIso: string,
): Promise<{ ctwa: AttributionSplit; manual: AttributionSplit }> {
  const since = new Date(sinceIso);
  const until = new Date(untilIso);

  const [ctwaRow] = await db
    .select({
      ordersCount: sqlCampaignTotalOrdersCount,
      convertedOrdersCount: sqlCampaignConvertedOrdersCount,
      convertedRevenue: sqlCampaignConvertedRevenueSum,
    })
    .from(orders)
    .innerJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .innerJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .where(
      and(
        eq(metaAds.metaCampaignId, metaCampaignId),
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
      ),
    );

  const [manualRow] = await db
    .select({
      ordersCount: sqlCampaignTotalOrdersCount,
      convertedOrdersCount: sqlCampaignConvertedOrdersCount,
      convertedRevenue: sqlCampaignConvertedRevenueSum,
    })
    .from(orders)
    .where(
      and(
        isNull(orders.ctwaSessionId),
        eq(orders.manualMetaCampaignId, metaCampaignId),
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
      ),
    );

  return {
    ctwa: {
      path: "ctwa",
      ordersCount: ctwaRow?.ordersCount ?? 0,
      convertedOrdersCount: ctwaRow?.convertedOrdersCount ?? 0,
      convertedRevenue: num(ctwaRow?.convertedRevenue),
    },
    manual: {
      path: "manual",
      ordersCount: manualRow?.ordersCount ?? 0,
      convertedOrdersCount: manualRow?.convertedOrdersCount ?? 0,
      convertedRevenue: num(manualRow?.convertedRevenue),
    },
  };
}

export async function getCampaignDailyPerformanceForCampaign(
  metaCampaignId: string,
  sinceDay: string,
  untilDay: string,
  pnl: CampaignPnLFractions = {
    cardFeePercent: DEFAULT_CAMPAIGN_CARD_FEE_PERCENT,
    salesCommissionPercentOfConvertedRevenue:
      DEFAULT_CAMPAIGN_SALES_COMMISSION_PERCENT,
  },
): Promise<CampaignDailyPerformanceRow[]> {
  const [spendByCampDay, ctwaEcon, manualEcon, insightRows] = await Promise.all([
    rollupSpendByCampaignByDay(sinceDay, untilDay),
    rollupConvertedEconomyByCampaignByDayCtwa(sinceDay, untilDay),
    rollupConvertedEconomyByCampaignByDayManual(sinceDay, untilDay),
    db
      .select({
        insightDate: adInsightsDaily.insightDate,
        impressions: adInsightsDaily.impressions,
        clicks: adInsightsDaily.clicks,
        spend: adInsightsDaily.spend,
        messagingConversationsStarted:
          adInsightsDaily.messagingConversationsStarted,
        metaPurchases: adInsightsDaily.metaPurchases,
        frequency: adInsightsDaily.frequency,
        qualityRanking: adInsightsDaily.qualityRanking,
      })
      .from(adInsightsDaily)
      .where(
        and(
          eq(adInsightsDaily.metaCampaignId, metaCampaignId),
          gte(adInsightsDaily.insightDate, sinceDay),
          lte(adInsightsDaily.insightDate, untilDay),
        ),
      ),
  ]);

  const econByCampDay = mergeDayEconomyMaps(ctwaEcon, manualEcon);
  const spendDays = spendByCampDay.get(metaCampaignId) ?? new Map();
  const econDays =
    econByCampDay.get(metaCampaignId) ??
    new Map<
      string,
      {
        convertedRevenue: number;
        convertedCogs: number;
        deliveryCost: number;
        ordersCount: number;
      }
    >();

  type InsightAgg = {
    impressions: number;
    clicks: number;
    spend: number;
    messagingStarted: number;
    metaPurchases: number;
    freqNum: number;
    freqDenom: number;
    qualNum: number;
    qualDenom: number;
  };

  const insightByDay = new Map<string, InsightAgg>();
  for (const r of insightRows) {
    let agg = insightByDay.get(r.insightDate);
    if (!agg) {
      agg = {
        impressions: 0,
        clicks: 0,
        spend: 0,
        messagingStarted: 0,
        metaPurchases: 0,
        freqNum: 0,
        freqDenom: 0,
        qualNum: 0,
        qualDenom: 0,
      };
      insightByDay.set(r.insightDate, agg);
    }
    const im = r.impressions ?? 0;
    agg.impressions += im;
    agg.clicks += r.clicks ?? 0;
    agg.spend += num(r.spend != null ? String(r.spend) : "0");
    agg.messagingStarted += r.messagingConversationsStarted ?? 0;
    agg.metaPurchases += r.metaPurchases ?? 0;

    const fqRaw =
      r.frequency == null
        ? ""
        : typeof r.frequency === "string"
          ? r.frequency
          : String(r.frequency);
    const fq = parseInsightsFrequencyRaw(fqRaw || null);
    if (fq != null && im > 0) {
      agg.freqNum += fq * im;
      agg.freqDenom += im;
    }
    const qs = metaQualityRankingToScore0to1(r.qualityRanking ?? null);
    if (qs != null && im > 0) {
      agg.qualNum += qs * im;
      agg.qualDenom += im;
    }
  }

  const fee = Math.max(0, pnl.cardFeePercent) / 100;
  const comm = Math.max(0, pnl.salesCommissionPercentOfConvertedRevenue) / 100;
  const days = listUtcDaysInclusive(sinceDay, untilDay);

  return days.map((day): CampaignDailyPerformanceRow => {
    const spend = spendDays.get(day) ?? 0;
    const econ = econDays.get(day) ?? {
      convertedRevenue: 0,
      convertedCogs: 0,
      deliveryCost: 0,
      ordersCount: 0,
    };
    const ins = insightByDay.get(day);
    const impressions = ins?.impressions ?? 0;
    const clicks = ins?.clicks ?? 0;
    const ctr = impressions > 0 ? clicks / impressions : null;
    const messagingStarted = ins?.messagingStarted ?? 0;
    const metaPurchases = ins?.metaPurchases ?? 0;
    const payableAdSpend = spend * (1 + fee);
    const commission = econ.convertedRevenue * comm;
    const dailyNetProfit =
      econ.convertedRevenue -
      econ.convertedCogs -
      payableAdSpend -
      commission -
      econ.deliveryCost;

    const weightedFrequency =
      ins && ins.freqDenom > 0 ? ins.freqNum / ins.freqDenom : null;
    const weightedQualityScore =
      ins && ins.qualDenom > 0 ? ins.qualNum / ins.qualDenom : null;

    return {
      day,
      spend,
      impressions,
      clicks,
      ctr,
      messagingStarted,
      metaPurchases,
      attributedOrdersCount: econ.ordersCount,
      convertedRevenue: econ.convertedRevenue,
      convertedCogs: econ.convertedCogs,
      deliveryCost: econ.deliveryCost,
      payableAdSpend,
      salesCommission: commission,
      dailyNetProfit,
      weightedFrequency,
      weightedQualityScore,
    };
  });
}

export async function getCampaignAdBreakdown(
  metaCampaignId: string,
  sinceDay: string,
  untilDay: string,
  sinceIso: string,
  untilIso: string,
  pnl: CampaignPnLFractions = {
    cardFeePercent: DEFAULT_CAMPAIGN_CARD_FEE_PERCENT,
    salesCommissionPercentOfConvertedRevenue:
      DEFAULT_CAMPAIGN_SALES_COMMISSION_PERCENT,
  },
): Promise<CampaignAdBreakdownRow[]> {
  const thresholds = getCampaignThresholds();

  const [
    insightRows,
    ctwaByAd,
    ordersByAd,
    cogsByAd,
    deliveryByAd,
    metaEngByAd,
  ] = await Promise.all([
    db
      .select({
        metaAdId: adInsightsDaily.metaAdId,
        adName: metaAds.name,
        spend: sql<string>`coalesce(sum(${adInsightsDaily.spend}::numeric), 0)::text`,
        impressions:
          sql<number>`coalesce(sum(${adInsightsDaily.impressions}::numeric), 0)::int`,
        clicks:
          sql<number>`coalesce(sum(${adInsightsDaily.clicks}::numeric), 0)::int`,
        messagingStarted:
          sql<number>`coalesce(sum(${adInsightsDaily.messagingConversationsStarted}::numeric), 0)::int`,
        metaPurchases:
          sql<number>`coalesce(sum(${adInsightsDaily.metaPurchases}::numeric), 0)::int`,
      })
      .from(adInsightsDaily)
      .innerJoin(metaAds, eq(adInsightsDaily.metaAdId, metaAds.id))
      .where(
        and(
          eq(adInsightsDaily.metaCampaignId, metaCampaignId),
          gte(adInsightsDaily.insightDate, sinceDay),
          lte(adInsightsDaily.insightDate, untilDay),
        ),
      )
      .groupBy(adInsightsDaily.metaAdId, metaAds.name)
      .orderBy(desc(sql`coalesce(sum(${adInsightsDaily.spend}::numeric), 0)`)),
    rollupCtwaSessionsByAdForCampaign(metaCampaignId, sinceIso, untilIso),
    rollupAttributedOrdersAggByAdForCampaign(
      metaCampaignId,
      sinceIso,
      untilIso,
    ),
    rollupLineCogsByAdForCampaign(metaCampaignId, sinceIso, untilIso),
    rollupPaidOperationalCostsByAdForCampaign(
      metaCampaignId,
      sinceIso,
      untilIso,
    ),
    rollupAdMetaEngagementSignalsForCampaign(
      metaCampaignId,
      untilDay,
      thresholds.minQualityRankScore,
    ),
  ]);

  const adIds = new Set<string>();
  for (const r of insightRows) adIds.add(r.metaAdId);
  for (const id of ctwaByAd.keys()) adIds.add(id);
  for (const id of ordersByAd.keys()) adIds.add(id);

  const insightByAd = new Map(
    insightRows.map((r) => [r.metaAdId, r] as const),
  );

  const extraAdNames = new Map<string, string | null>();
  const missingInsightAdIds = [...adIds].filter((id) => !insightByAd.has(id));
  if (missingInsightAdIds.length) {
    const nm = await db
      .select({ id: metaAds.id, name: metaAds.name })
      .from(metaAds)
      .where(
        and(
          eq(metaAds.metaCampaignId, metaCampaignId),
          inArray(metaAds.id, missingInsightAdIds),
        ),
      );
    for (const r of nm) extraAdNames.set(r.id, r.name);
  }

  const rows: CampaignAdBreakdownRow[] = [];

  for (const metaAdId of adIds) {
    const ir = insightByAd.get(metaAdId);
    const adName = ir?.adName ?? extraAdNames.get(metaAdId) ?? null;
    const spend = ir ? num(ir.spend) : 0;
    const impressions = ir?.impressions ?? 0;
    const clicks = ir?.clicks ?? 0;
    const metaMessagingConversationsStarted = ir?.messagingStarted ?? 0;
    const metaPurchases = ir?.metaPurchases ?? 0;

    const o = ordersByAd.get(metaAdId) ?? emptyAdAttributedOrderAgg();
    const cogs = cogsByAd.get(metaAdId) ?? {
      totalLineCogs: 0,
      paidLineCogs: 0,
      convertedLineCogs: 0,
    };
    const paidOperationalCosts = deliveryByAd.get(metaAdId) ?? 0;
    const ctwaSessions = ctwaByAd.get(metaAdId) ?? 0;

    const ctr = impressions > 0 ? clicks / impressions : null;

    const verdictDetail = evaluateCampaign(
      {
        spend,
        paymentCardFeePercent: pnl.cardFeePercent,
        salesCommissionPercentOfConvertedRevenue:
          pnl.salesCommissionPercentOfConvertedRevenue,
        ctwaSessions,
        ordersCount: o.ordersCount,
        paidOrdersCount: o.paidOrdersCount,
        pendingOrdersCount: o.pendingOrdersCount,
        totalRevenue: o.totalRevenue,
        paidRevenue: o.paidRevenue,
        convertedOrdersCount: o.convertedOrdersCount,
        convertedRevenue: o.convertedRevenue,
        totalLineCogs: cogs.totalLineCogs,
        paidLineCogs: cogs.paidLineCogs,
        convertedLineCogs: cogs.convertedLineCogs,
        paidOperationalCosts,
        capiSentCount: o.capiSentCount,
        metaMessagingConversationsStarted,
        metaPurchases,
        shippedOrdersCount: o.shippedOrdersCount,
        returnedOrdersCount: o.returnedOrdersCount,
      },
      thresholds,
      {
        unattributedOrdersInWindow: 0,
        logContext: `${metaCampaignId}:${metaAdId}`,
        signals: {
          linkCtr: ctr,
          outboundCtr:
            clicks > 0 ? metaMessagingConversationsStarted / clicks : null,
          weeklyAvgFrequency:
            metaEngByAd.get(metaAdId)?.weeklyAvgFrequency ?? null,
          firstImpressionShare:
            metaEngByAd.get(metaAdId)?.firstImpressionShare ?? null,
          qualityRankingScore0to1:
            metaEngByAd.get(metaAdId)?.qualityRankingScore0to1 ?? null,
          qualityRankingLowStreakDays:
            metaEngByAd.get(metaAdId)?.qualityRankingLowStreakDays ?? null,
          dailyNetProfitCv7d: null,
          returnRate:
            o.shippedOrdersCount > 0
              ? o.returnedOrdersCount / o.shippedOrdersCount
              : null,
          avgDaysOrderToConfirmRecent: null,
          avgDaysOrderToConfirmBaseline: null,
        },
      },
    );

    const paidAdSpend = verdictDetail.paidAdSpend;
    const cpc = clicks > 0 ? paidAdSpend / clicks : null;
    const cpm =
      impressions > 0 ? (1000 * paidAdSpend) / impressions : null;
    const costPerCtwa =
      ctwaSessions > 0 ? paidAdSpend / ctwaSessions : null;

    const metaEng = metaEngByAd.get(metaAdId);

    rows.push({
      metaAdId,
      adName,
      spend,
      impressions,
      clicks,
      ctr,
      cpc,
      cpm,
      costPerCtwa,
      ctwaSessions,
      metaMessagingConversationsStarted,
      metaPurchases,
      ordersCount: o.ordersCount,
      paidOrdersCount: o.paidOrdersCount,
      pendingOrdersCount: o.pendingOrdersCount,
      confirmedOrdersCount: o.confirmedOrdersCount,
      shippedOrdersCount: o.shippedOrdersCount,
      convertedOrdersCount: o.convertedOrdersCount,
      convertedRevenue: o.convertedRevenue,
      grossProfitPaid: verdictDetail.grossProfitPaid,
      paidAdSpend: verdictDetail.paidAdSpend,
      salesCommissionPaid: verdictDetail.salesCommissionPaid,
      paidOperationalCosts,
      netProfitPaid: verdictDetail.netProfitPaid,
      verdict: verdictDetail.verdict,
      verdictDetail,
      metaWeeklyAvgFrequency: metaEng?.weeklyAvgFrequency ?? null,
      metaQualityScore7d: metaEng?.qualityRankingScore0to1 ?? null,
      metaQualityLowStreakDays: metaEng?.qualityRankingLowStreakDays ?? null,
      metaFirstImpressionShare7d: metaEng?.firstImpressionShare ?? null,
    });
  }

  rows.sort((a, b) => b.spend - a.spend);
  return rows;
}

export async function listAttributedOrdersForCampaign(
  metaCampaignId: string,
  sinceIso: string,
  untilIso: string,
  limit = 200,
): Promise<CampaignAttributedOrderRow[]> {
  const since = new Date(sinceIso);
  const until = new Date(untilIso);

  const ctwaOrders = await db
    .select({
      orderId: orders.id,
      orderEventAt: orders.orderEventAt,
      status: orders.status,
      value: orders.value,
      metaAdId: ctwaSessions.metaAdId,
      contactId: orders.contactId,
    })
    .from(orders)
    .innerJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .innerJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .where(
      and(
        eq(metaAds.metaCampaignId, metaCampaignId),
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
      ),
    );

  const manualOrders = await db
    .select({
      orderId: orders.id,
      orderEventAt: orders.orderEventAt,
      status: orders.status,
      value: orders.value,
      contactId: orders.contactId,
    })
    .from(orders)
    .where(
      and(
        isNull(orders.ctwaSessionId),
        eq(orders.manualMetaCampaignId, metaCampaignId),
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
      ),
    );

  const contactIds = [
    ...new Set([
      ...ctwaOrders.map((r) => r.contactId),
      ...manualOrders.map((r) => r.contactId),
    ]),
  ];

  const latestCtwaSendByContact = new Map<string, Date>();
  if (contactIds.length) {
    const latestRows = await db
      .select({
        contactId: ctwaSessions.contactId,
        latestSend: sql<Date>`max(${ctwaSessions.sendTime})`,
      })
      .from(ctwaSessions)
      .where(inArray(ctwaSessions.contactId, contactIds))
      .groupBy(ctwaSessions.contactId);

    for (const row of latestRows) {
      const ts = coercePgDate(row.latestSend);
      if (ts) latestCtwaSendByContact.set(row.contactId, ts);
    }
  }

  const merged: CampaignAttributedOrderRow[] = [
    ...ctwaOrders.map((r) => ({
      orderId: r.orderId,
      orderEventAt: r.orderEventAt,
      status: r.status,
      valueUsd: r.value,
      path: "ctwa" as const,
      metaAdId: r.metaAdId,
      buyerLatestCtwaSendAt:
        latestCtwaSendByContact.get(r.contactId) ?? null,
    })),
    ...manualOrders.map((r) => ({
      orderId: r.orderId,
      orderEventAt: r.orderEventAt,
      status: r.status,
      valueUsd: r.value,
      path: "manual" as const,
      metaAdId: null as string | null,
      buyerLatestCtwaSendAt:
        latestCtwaSendByContact.get(r.contactId) ?? null,
    })),
  ];

  merged.sort((a, b) => b.orderEventAt.getTime() - a.orderEventAt.getTime());
  return merged.slice(0, limit);
}

function metaMarketingActivityBody(
  row: typeof metaMarketingActivities.$inferSelect,
): string {
  const t = row.translatedEventType?.trim();
  if (t) return t;
  return row.eventType.replace(/_/g, " ");
}

function metaMarketingActivityMetadata(
  row: typeof metaMarketingActivities.$inferSelect,
): Record<string, unknown> {
  return {
    subtype: "marketing_api_activity",
    event_type: row.eventType,
    translated_event_type: row.translatedEventType,
    object_id: row.objectId,
    object_name: row.objectName,
    object_type: row.objectType,
    extra_data: row.extraData,
    actor_id: row.actorId,
    actor_name: row.actorName,
    application_name: row.applicationName,
  };
}

function activityUnionExecuteRows(result: unknown): Array<{
  sort_ts: string | Date;
  src: string;
  row_id: string;
}> {
  if (Array.isArray(result)) {
    return result as Array<{
      sort_ts: string | Date;
      src: string;
      row_id: string;
    }>;
  }
  const boxed = result as { rows?: unknown[] };
  return (boxed.rows ?? []) as Array<{
    sort_ts: string | Date;
    src: string;
    row_id: string;
  }>;
}

export type ListCampaignActivityOptions = {
  /** Only archived Meta Marketing API `/activities` rows (no notes, structure sync, or attribution). */
  metaMarketingApiOnly?: boolean;
};

export async function listCampaignActivityRows(
  metaCampaignId: string,
  limit = 400,
  options?: ListCampaignActivityOptions,
) {
  if (options?.metaMarketingApiOnly) {
    const metaRows = await db
      .select()
      .from(metaMarketingActivities)
      .where(eq(metaMarketingActivities.metaCampaignId, metaCampaignId))
      .orderBy(desc(metaMarketingActivities.eventTime))
      .limit(limit);
    return metaRows.map((row) => ({
      id: row.id,
      metaCampaignId: row.metaCampaignId,
      createdAt: row.eventTime,
      createdByEmail: META_MARKETING_API_ACTIVITY_EMAIL,
      kind: "meta_activity",
      body: metaMarketingActivityBody(row),
      metadata: metaMarketingActivityMetadata(row),
    }));
  }

  const ordered = await db.execute(sql`
    SELECT sort_ts AS sort_ts, src, row_id AS row_id
    FROM (
      SELECT created_at AS sort_ts, 'internal'::text AS src, id::text AS row_id
      FROM campaign_activity
      WHERE meta_campaign_id = ${metaCampaignId}
      AND (
        kind <> 'system'
        OR coalesce(metadata->>'subtype','') <> 'insights_sync'
      )
      UNION ALL
      SELECT event_time AS sort_ts, 'meta'::text AS src, id::text AS row_id
      FROM meta_marketing_activities
      WHERE meta_campaign_id = ${metaCampaignId}
    ) x
    ORDER BY sort_ts DESC
    LIMIT ${limit}
  `);

  const orderRows = activityUnionExecuteRows(ordered);
  const internalIds = orderRows
    .filter((r) => r.src === "internal")
    .map((r) => r.row_id);
  const metaIds = orderRows
    .filter((r) => r.src === "meta")
    .map((r) => r.row_id);

  const [internals, metaRows] = await Promise.all([
    internalIds.length
      ? db
          .select()
          .from(campaignActivity)
          .where(inArray(campaignActivity.id, internalIds))
      : [],
    metaIds.length
      ? db
          .select()
          .from(metaMarketingActivities)
          .where(inArray(metaMarketingActivities.id, metaIds))
      : [],
  ]);

  const internalMap = new Map(internals.map((r) => [r.id, r]));
  const metaMap = new Map(metaRows.map((r) => [r.id, r]));

  type CaRow = typeof campaignActivity.$inferSelect;
  type Unified =
    | CaRow
    | {
        id: string;
        metaCampaignId: string;
        createdAt: Date;
        createdByEmail: string;
        kind: string;
        body: string;
        metadata: Record<string, unknown> | null;
      };

  const out: Unified[] = [];

  for (const ref of orderRows) {
    if (ref.src === "internal") {
      const row = internalMap.get(ref.row_id);
      if (row) out.push(row);
      continue;
    }
    const row = metaMap.get(ref.row_id);
    if (!row) continue;
    out.push({
      id: row.id,
      metaCampaignId: row.metaCampaignId,
      createdAt: row.eventTime,
      createdByEmail: META_MARKETING_API_ACTIVITY_EMAIL,
      kind: "meta_activity",
      body: metaMarketingActivityBody(row),
      metadata: metaMarketingActivityMetadata(row),
    });
  }

  return out;
}
