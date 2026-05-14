import { and, asc, eq, gte, inArray, isNull, isNotNull, lte, sql } from "drizzle-orm";

import {
  addUtcDaysToDateOnly,
} from "@/lib/campaign-insights-range";

import {
  adInsightsDaily,
  metaAds,
  metaAdSets,
  metaCampaigns,
  orderItems,
  orders,
  ctwaSessions,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import { getCampaignThresholds } from "@/lib/campaign-thresholds";
import { metaQualityRankingToScore0to1 } from "@/lib/meta-insights-quality";
import type { CampaignPnLFractions } from "@/lib/campaign-pnl-params";
import {
  DEFAULT_CAMPAIGN_CARD_FEE_PERCENT,
  DEFAULT_CAMPAIGN_SALES_COMMISSION_PERCENT,
} from "@/lib/campaign-pnl-params";
import {
  evaluateCampaign,
  type CampaignVerdict,
  type CampaignVerdictResult,
} from "@/lib/campaign-verdict";

function num(s: string | null | undefined): number {
  if (s == null || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Revenue and order count by campaign for orders in the date window (UTC). */
export async function rollupRevenueByCampaign(
  sinceIso: string,
  untilIso: string,
): Promise<
  Map<
    string,
    { campaignName: string | null; revenue: number; ordersCount: number }
  >
> {
  const since = new Date(sinceIso);
  const until = new Date(untilIso);

  const ctwaRows = await db
    .select({
      metaCampaignId: metaAds.metaCampaignId,
      campaignName: metaCampaigns.name,
      revenue: sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
      ordersCount: sql<number>`count(${orders.id})::int`,
    })
    .from(orders)
    .innerJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .innerJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .innerJoin(metaCampaigns, eq(metaAds.metaCampaignId, metaCampaigns.id))
    .where(and(gte(orders.orderEventAt, since), lte(orders.orderEventAt, until)))
    .groupBy(metaAds.metaCampaignId, metaCampaigns.name);

  const manualRows = await db
    .select({
      metaCampaignId: metaCampaigns.id,
      campaignName: metaCampaigns.name,
      revenue: sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
      ordersCount: sql<number>`count(${orders.id})::int`,
    })
    .from(orders)
    .innerJoin(
      metaCampaigns,
      eq(orders.manualMetaCampaignId, metaCampaigns.id),
    )
    .where(
      and(
        isNull(orders.ctwaSessionId),
        isNotNull(orders.manualMetaCampaignId),
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
      ),
    )
    .groupBy(metaCampaigns.id, metaCampaigns.name);

  const m = new Map<
    string,
    { campaignName: string | null; revenue: number; ordersCount: number }
  >();
  for (const r of ctwaRows) {
    m.set(r.metaCampaignId, {
      campaignName: r.campaignName,
      revenue: num(r.revenue),
      ordersCount: r.ordersCount,
    });
  }
  for (const r of manualRows) {
    const prev = m.get(r.metaCampaignId);
    if (!prev) {
      m.set(r.metaCampaignId, {
        campaignName: r.campaignName,
        revenue: num(r.revenue),
        ordersCount: r.ordersCount,
      });
    } else {
      m.set(r.metaCampaignId, {
        campaignName: prev.campaignName ?? r.campaignName,
        revenue: prev.revenue + num(r.revenue),
        ordersCount: prev.ordersCount + r.ordersCount,
      });
    }
  }
  return m;
}

/** Sum spend by campaign from daily ad insights. */
export async function rollupSpendByCampaign(
  sinceDay: string,
  untilDay: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      metaCampaignId: adInsightsDaily.metaCampaignId,
      spend: sql<string>`coalesce(sum(${adInsightsDaily.spend}::numeric), 0)::text`,
    })
    .from(adInsightsDaily)
    .where(
      and(
        gte(adInsightsDaily.insightDate, sinceDay),
        lte(adInsightsDaily.insightDate, untilDay),
        sql`${adInsightsDaily.metaCampaignId} is not null`,
      ),
    )
    .groupBy(adInsightsDaily.metaCampaignId);

  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.metaCampaignId) m.set(r.metaCampaignId, num(r.spend));
  }
  return m;
}

/**
 * CTWA sessions attributed to a Meta ad and campaign in the UTC window.
 */
export async function rollupCtwaSessionsByCampaign(
  sinceIso: string,
  untilIso: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      metaCampaignId: metaAds.metaCampaignId,
      sessionsCount: sql<number>`count(${ctwaSessions.id})::int`,
    })
    .from(ctwaSessions)
    .innerJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .where(
      and(
        gte(ctwaSessions.sendTime, new Date(sinceIso)),
        lte(ctwaSessions.sendTime, new Date(untilIso)),
      ),
    )
    .groupBy(metaAds.metaCampaignId);

  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.metaCampaignId, r.sessionsCount);
  }
  return m;
}

/** Sum impressions + clicks by campaign from daily ad insights. */
export async function rollupAdInsightsDeliveryByCampaign(
  sinceDay: string,
  untilDay: string,
): Promise<
  Map<
    string,
    {
      impressions: number;
      clicks: number;
    }
  >
> {
  const rows = await db
    .select({
      metaCampaignId: adInsightsDaily.metaCampaignId,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions}::numeric), 0)::int`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks}::numeric), 0)::int`,
    })
    .from(adInsightsDaily)
    .where(
      and(
        gte(adInsightsDaily.insightDate, sinceDay),
        lte(adInsightsDaily.insightDate, untilDay),
        sql`${adInsightsDaily.metaCampaignId} is not null`,
      ),
    )
    .groupBy(adInsightsDaily.metaCampaignId);

  const m = new Map<string, { impressions: number; clicks: number }>();
  for (const r of rows) {
    if (r.metaCampaignId) {
      m.set(r.metaCampaignId, {
        impressions: r.impressions,
        clicks: r.clicks,
      });
    }
  }
  return m;
}

/**
 * Sum `orders.delivery_cost` for paid + confirmed CTWA-attributed orders in the window
 * (used as delivery deduction in net profit).
 */
export async function rollupPaidOperationalCostsByCampaign(
  sinceIso: string,
  untilIso: string,
): Promise<Map<string, number>> {
  const since = new Date(sinceIso);
  const until = new Date(untilIso);

  const feeRows = await db
    .select({
      metaCampaignId: metaAds.metaCampaignId,
      fees: sql<string>`coalesce(sum(coalesce(${orders.deliveryCost}::numeric, 0)) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
    })
    .from(orders)
    .innerJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .innerJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .where(and(gte(orders.orderEventAt, since), lte(orders.orderEventAt, until)))
    .groupBy(metaAds.metaCampaignId);

  const manualFeeRows = await db
    .select({
      metaCampaignId: metaCampaigns.id,
      fees: sql<string>`coalesce(sum(coalesce(${orders.deliveryCost}::numeric, 0)) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
    })
    .from(orders)
    .innerJoin(
      metaCampaigns,
      eq(orders.manualMetaCampaignId, metaCampaigns.id),
    )
    .where(
      and(
        isNull(orders.ctwaSessionId),
        isNotNull(orders.manualMetaCampaignId),
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
      ),
    )
    .groupBy(metaCampaigns.id);

  const m = new Map<string, number>();
  for (const r of feeRows) {
    m.set(r.metaCampaignId, num(r.fees));
  }
  for (const r of manualFeeRows) {
    const prev = m.get(r.metaCampaignId) ?? 0;
    m.set(r.metaCampaignId, prev + num(r.fees));
  }
  return m;
}

export type OrderAggRow = {
  metaCampaignId: string;
  campaignName: string | null;
  ordersCount: number;
  paidOrdersCount: number;
  pendingOrdersCount: number;
  confirmedOrdersCount: number;
  shippedOrdersCount: number;
  cancelledOrdersCount: number;
  returnedOrdersCount: number;
  totalRevenue: number;
  paidRevenue: number;
  /** Orders with status paid or confirmed — used with revenue/cogs for COD decisions. */
  convertedOrdersCount: number;
  convertedRevenue: number;
  capiSentCount: number;
};

function mergeOrderAggMaps(
  ctwa: Map<string, OrderAggRow>,
  manual: Map<string, OrderAggRow>,
): Map<string, OrderAggRow> {
  const out = new Map(ctwa);
  for (const [id, row] of manual) {
    const ex = out.get(id);
    if (!ex) {
      out.set(id, row);
      continue;
    }
    out.set(id, {
      metaCampaignId: id,
      campaignName: ex.campaignName ?? row.campaignName,
      ordersCount: ex.ordersCount + row.ordersCount,
      paidOrdersCount: ex.paidOrdersCount + row.paidOrdersCount,
      pendingOrdersCount: ex.pendingOrdersCount + row.pendingOrdersCount,
      confirmedOrdersCount: ex.confirmedOrdersCount + row.confirmedOrdersCount,
      shippedOrdersCount: ex.shippedOrdersCount + row.shippedOrdersCount,
      cancelledOrdersCount: ex.cancelledOrdersCount + row.cancelledOrdersCount,
      returnedOrdersCount: ex.returnedOrdersCount + row.returnedOrdersCount,
      totalRevenue: ex.totalRevenue + row.totalRevenue,
      paidRevenue: ex.paidRevenue + row.paidRevenue,
      convertedOrdersCount: ex.convertedOrdersCount + row.convertedOrdersCount,
      convertedRevenue: ex.convertedRevenue + row.convertedRevenue,
      capiSentCount: ex.capiSentCount + row.capiSentCount,
    });
  }
  return out;
}

export async function rollupAttributedOrdersAggByCampaign(
  sinceIso: string,
  untilIso: string,
): Promise<Map<string, OrderAggRow>> {
  const since = new Date(sinceIso);
  const until = new Date(untilIso);

  const ctwaRows = await db
    .select({
      metaCampaignId: metaAds.metaCampaignId,
      campaignName: metaCampaigns.name,
      ordersCount: sql<number>`count(${orders.id})::int`,
      paidOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'paid')::int`,
      pendingOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'pending')::int`,
      confirmedOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'confirmed')::int`,
      shippedOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'shipped')::int`,
      cancelledOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'cancelled')::int`,
      returnedOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'returned')::int`,
      totalRevenue:
        sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
      paidRevenue:
        sql<string>`coalesce(sum(${orders.value}::numeric) filter (where ${orders.status} = 'paid'), 0)::text`,
      convertedOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} in ('paid', 'confirmed'))::int`,
      convertedRevenue:
        sql<string>`coalesce(sum(${orders.value}::numeric) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
      capiSentCount:
        sql<number>`count(${orders.id}) filter (where ${orders.capiSent} = true)::int`,
    })
    .from(orders)
    .innerJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .innerJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .innerJoin(metaCampaigns, eq(metaAds.metaCampaignId, metaCampaigns.id))
    .where(and(gte(orders.orderEventAt, since), lte(orders.orderEventAt, until)))
    .groupBy(metaAds.metaCampaignId, metaCampaigns.name);

  const manualRows = await db
    .select({
      metaCampaignId: metaCampaigns.id,
      campaignName: metaCampaigns.name,
      ordersCount: sql<number>`count(${orders.id})::int`,
      paidOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'paid')::int`,
      pendingOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'pending')::int`,
      confirmedOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'confirmed')::int`,
      shippedOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'shipped')::int`,
      cancelledOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'cancelled')::int`,
      returnedOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} = 'returned')::int`,
      totalRevenue:
        sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
      paidRevenue:
        sql<string>`coalesce(sum(${orders.value}::numeric) filter (where ${orders.status} = 'paid'), 0)::text`,
      convertedOrdersCount:
        sql<number>`count(${orders.id}) filter (where ${orders.status} in ('paid', 'confirmed'))::int`,
      convertedRevenue:
        sql<string>`coalesce(sum(${orders.value}::numeric) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
      capiSentCount:
        sql<number>`count(${orders.id}) filter (where ${orders.capiSent} = true)::int`,
    })
    .from(orders)
    .innerJoin(
      metaCampaigns,
      eq(orders.manualMetaCampaignId, metaCampaigns.id),
    )
    .where(
      and(
        isNull(orders.ctwaSessionId),
        isNotNull(orders.manualMetaCampaignId),
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
      ),
    )
    .groupBy(metaCampaigns.id, metaCampaigns.name);

  const ctwaMap = new Map<string, OrderAggRow>();
  for (const r of ctwaRows) {
    ctwaMap.set(r.metaCampaignId, {
      metaCampaignId: r.metaCampaignId,
      campaignName: r.campaignName,
      ordersCount: r.ordersCount,
      paidOrdersCount: r.paidOrdersCount,
      pendingOrdersCount: r.pendingOrdersCount,
      confirmedOrdersCount: r.confirmedOrdersCount,
      shippedOrdersCount: r.shippedOrdersCount,
      cancelledOrdersCount: r.cancelledOrdersCount,
      returnedOrdersCount: r.returnedOrdersCount,
      totalRevenue: num(r.totalRevenue),
      paidRevenue: num(r.paidRevenue),
      convertedOrdersCount: r.convertedOrdersCount,
      convertedRevenue: num(r.convertedRevenue),
      capiSentCount: r.capiSentCount,
    });
  }

  const manualMap = new Map<string, OrderAggRow>();
  for (const r of manualRows) {
    manualMap.set(r.metaCampaignId, {
      metaCampaignId: r.metaCampaignId,
      campaignName: r.campaignName,
      ordersCount: r.ordersCount,
      paidOrdersCount: r.paidOrdersCount,
      pendingOrdersCount: r.pendingOrdersCount,
      confirmedOrdersCount: r.confirmedOrdersCount,
      shippedOrdersCount: r.shippedOrdersCount,
      cancelledOrdersCount: r.cancelledOrdersCount,
      returnedOrdersCount: r.returnedOrdersCount,
      totalRevenue: num(r.totalRevenue),
      paidRevenue: num(r.paidRevenue),
      convertedOrdersCount: r.convertedOrdersCount,
      convertedRevenue: num(r.convertedRevenue),
      capiSentCount: r.capiSentCount,
    });
  }

  return mergeOrderAggMaps(ctwaMap, manualMap);
}

/** Sum COGS snapshots on line items for attributed orders in the window. */
export async function rollupLineCogsByCampaign(
  sinceIso: string,
  untilIso: string,
): Promise<
  Map<
    string,
    {
      totalLineCogs: number;
      paidLineCogs: number;
      convertedLineCogs: number;
    }
  >
> {
  const since = new Date(sinceIso);
  const until = new Date(untilIso);

  const rows = await db
    .select({
      metaCampaignId: metaAds.metaCampaignId,
      totalLineCogs:
        sql<string>`coalesce(sum(${orderItems.lineCogs}::numeric), 0)::text`,
      paidLineCogs:
        sql<string>`coalesce(sum(${orderItems.lineCogs}::numeric) filter (where ${orders.status} = 'paid'), 0)::text`,
      convertedLineCogs:
        sql<string>`coalesce(sum(${orderItems.lineCogs}::numeric) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .innerJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .where(and(gte(orders.orderEventAt, since), lte(orders.orderEventAt, until)))
    .groupBy(metaAds.metaCampaignId);

  const manualRows = await db
    .select({
      metaCampaignId: metaCampaigns.id,
      totalLineCogs:
        sql<string>`coalesce(sum(${orderItems.lineCogs}::numeric), 0)::text`,
      paidLineCogs:
        sql<string>`coalesce(sum(${orderItems.lineCogs}::numeric) filter (where ${orders.status} = 'paid'), 0)::text`,
      convertedLineCogs:
        sql<string>`coalesce(sum(${orderItems.lineCogs}::numeric) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(
      metaCampaigns,
      eq(orders.manualMetaCampaignId, metaCampaigns.id),
    )
    .where(
      and(
        isNull(orders.ctwaSessionId),
        isNotNull(orders.manualMetaCampaignId),
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
      ),
    )
    .groupBy(metaCampaigns.id);

  const m = new Map<
    string,
    { totalLineCogs: number; paidLineCogs: number; convertedLineCogs: number }
  >();
  for (const r of rows) {
    m.set(r.metaCampaignId, {
      totalLineCogs: num(r.totalLineCogs),
      paidLineCogs: num(r.paidLineCogs),
      convertedLineCogs: num(r.convertedLineCogs),
    });
  }
  for (const r of manualRows) {
    const prev = m.get(r.metaCampaignId);
    if (!prev) {
      m.set(r.metaCampaignId, {
        totalLineCogs: num(r.totalLineCogs),
        paidLineCogs: num(r.paidLineCogs),
        convertedLineCogs: num(r.convertedLineCogs),
      });
    } else {
      m.set(r.metaCampaignId, {
        totalLineCogs: prev.totalLineCogs + num(r.totalLineCogs),
        paidLineCogs: prev.paidLineCogs + num(r.paidLineCogs),
        convertedLineCogs: prev.convertedLineCogs + num(r.convertedLineCogs),
      });
    }
  }
  return m;
}

export type CampaignPerformanceRow = {
  metaCampaignId: string;
  campaignName: string | null;
  /** Meta Ads Manager effective_status from last structure sync (ACTIVE, PAUSED, etc.). */
  campaignEffectiveStatus: string | null;
  spend: number;
  ctwaSessions: number;
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
  totalLineCogs: number;
  paidLineCogs: number;
  convertedLineCogs: number;
  /** Sum of `orders.delivery_cost` on paid + confirmed orders in this window (deducted from net). */
  paidOperationalCosts: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  costPerCtwa: number | null;
  /** Meta Ads Insights — messaging conversations started (optimization signal). */
  metaMessagingConversationsStarted: number;
  /** Meta Ads Insights — purchase actions (optimization signal; app paid is truth). */
  metaPurchases: number;
  grossProfitPaid: number;
  /** Payable ads = Insights spend × (1 + fee%). */
  paidAdSpend: number;
  /** Payable − Insights (card surcharge). */
  cardSurchargeAmount: number;
  salesCommissionPaid: number;
  /** Gross profit − payable ads − commission − delivery (converted orders). */
  netProfitPaid: number;
  /** Gross profit − Insights spend only (before fee & commission). */
  preFeeContribution: number;
  /** Same as netProfitPaid — kept for table/sort naming parity. */
  contributionProfit: number;
  contributionRoas: number | null;
  roasPaid: number | null;
  roasTotal: number | null;
  verdict: CampaignVerdict;
  verdictDetail: CampaignVerdictResult;
  verdictReasons: CampaignVerdictResult["reasons"];
  /**
   * Trailing 7 UTC days through report `untilDay`: impression-weighted Meta `frequency`
   * (from synced `ad_insights_daily`).
   */
  metaWeeklyAvgFrequency: number | null;
  /** 7d impression-weighted mapped `quality_ranking` score (0–1). */
  metaQualityScore7d: number | null;
  /** Consecutive days ending `untilDay` with daily quality below env threshold; null if no signal. */
  metaQualityLowStreakDays: number | null;
  /** First-time impression share weighted 7d — only if API/backfill provides `first_time_impression_ratio`. */
  metaFirstImpressionShare7d: number | null;
};

/** id → name + delivery status from last Meta structure sync. */
export async function loadMetaCampaignLookup(): Promise<
  Map<
    string,
    {
      name: string | null;
      effectiveStatus: string | null;
    }
  >
> {
  const rows = await db
    .select({
      id: metaCampaigns.id,
      name: metaCampaigns.name,
      effectiveStatus: metaCampaigns.effectiveStatus,
    })
    .from(metaCampaigns);

  const m = new Map<
    string,
    { name: string | null; effectiveStatus: string | null }
  >();
  for (const r of rows) {
    m.set(r.id, { name: r.name, effectiveStatus: r.effectiveStatus });
  }
  return m;
}

/** Sum Meta insights messaging starts + purchase actions by campaign (ad → campaign id on row). */
export async function rollupMetaAttributedActionsByCampaign(
  sinceDay: string,
  untilDay: string,
): Promise<
  Map<
    string,
    {
      messagingConversationsStarted: number;
      metaPurchases: number;
    }
  >
> {
  const rows = await db
    .select({
      metaCampaignId: adInsightsDaily.metaCampaignId,
      messaging: sql<number>`coalesce(sum(${adInsightsDaily.messagingConversationsStarted}::numeric), 0)::int`,
      purchases: sql<number>`coalesce(sum(${adInsightsDaily.metaPurchases}::numeric), 0)::int`,
    })
    .from(adInsightsDaily)
    .where(
      and(
        gte(adInsightsDaily.insightDate, sinceDay),
        lte(adInsightsDaily.insightDate, untilDay),
        sql`${adInsightsDaily.metaCampaignId} is not null`,
      ),
    )
    .groupBy(adInsightsDaily.metaCampaignId);

  const m = new Map<
    string,
    { messagingConversationsStarted: number; metaPurchases: number }
  >();
  for (const r of rows) {
    if (r.metaCampaignId) {
      m.set(r.metaCampaignId, {
        messagingConversationsStarted: r.messaging,
        metaPurchases: r.purchases,
      });
    }
  }
  return m;
}

type DayEconomy = {
  convertedRevenue: number;
  convertedCogs: number;
  deliveryCost: number;
};

function listUtcDaysInclusive(sinceDay: string, untilDay: string): string[] {
  const out: string[] = [];
  let d = sinceDay;
  for (let i = 0; i < 400; i++) {
    out.push(d);
    if (d === untilDay) break;
    d = addUtcDaysToDateOnly(d, 1);
  }
  return out;
}

function populationCvOfDailyNet(values: number[]): number | null {
  if (values.length < 3) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (Math.abs(mean) < 1e-9) return null;
  const varPop =
    values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  return Math.sqrt(varPop) / Math.abs(mean);
}

async function rollupSpendByCampaignByDay(
  sinceDay: string,
  untilDay: string,
): Promise<Map<string, Map<string, number>>> {
  const rows = await db
    .select({
      metaCampaignId: adInsightsDaily.metaCampaignId,
      day: adInsightsDaily.insightDate,
      spend: sql<string>`coalesce(sum(${adInsightsDaily.spend}::numeric), 0)::text`,
    })
    .from(adInsightsDaily)
    .where(
      and(
        gte(adInsightsDaily.insightDate, sinceDay),
        lte(adInsightsDaily.insightDate, untilDay),
        sql`${adInsightsDaily.metaCampaignId} is not null`,
      ),
    )
    .groupBy(adInsightsDaily.metaCampaignId, adInsightsDaily.insightDate);

  const m = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.metaCampaignId) continue;
    let inner = m.get(r.metaCampaignId);
    if (!inner) {
      inner = new Map();
      m.set(r.metaCampaignId, inner);
    }
    inner.set(r.day, num(r.spend));
  }
  return m;
}

function mergeDayEconomyMaps(
  ctwa: Map<string, Map<string, DayEconomy>>,
  manual: Map<string, Map<string, DayEconomy>>,
): Map<string, Map<string, DayEconomy>> {
  const out = new Map(ctwa);
  for (const [cid, days] of manual) {
    const ex = out.get(cid) ?? new Map<string, DayEconomy>();
    for (const [day, econ] of days) {
      const cur = ex.get(day) ?? {
        convertedRevenue: 0,
        convertedCogs: 0,
        deliveryCost: 0,
      };
      ex.set(day, {
        convertedRevenue: cur.convertedRevenue + econ.convertedRevenue,
        convertedCogs: cur.convertedCogs + econ.convertedCogs,
        deliveryCost: cur.deliveryCost + econ.deliveryCost,
      });
    }
    out.set(cid, ex);
  }
  return out;
}

async function rollupConvertedEconomyByCampaignByDayCtwa(
  sinceDay: string,
  untilDay: string,
): Promise<Map<string, Map<string, DayEconomy>>> {
  const since = new Date(`${sinceDay}T00:00:00.000Z`);
  const until = new Date(`${untilDay}T23:59:59.999Z`);
  const rows = await db
    .select({
      metaCampaignId: metaAds.metaCampaignId,
      day: sql<string>`((${orders.orderEventAt} at time zone 'utc')::date)::text`,
      convertedRevenue:
        sql<string>`coalesce(sum(${orders.value}::numeric) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
      convertedCogs:
        sql<string>`coalesce(sum(${orderItems.lineCogs}::numeric) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
      deliveryCost:
        sql<string>`coalesce(sum(${orders.deliveryCost}::numeric) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .innerJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .where(and(gte(orders.orderEventAt, since), lte(orders.orderEventAt, until)))
    .groupBy(
      metaAds.metaCampaignId,
      sql`((${orders.orderEventAt} at time zone 'utc')::date)`,
    );

  const m = new Map<string, Map<string, DayEconomy>>();
  for (const r of rows) {
    let inner = m.get(r.metaCampaignId);
    if (!inner) {
      inner = new Map();
      m.set(r.metaCampaignId, inner);
    }
    inner.set(r.day, {
      convertedRevenue: num(r.convertedRevenue),
      convertedCogs: num(r.convertedCogs),
      deliveryCost: num(r.deliveryCost),
    });
  }
  return m;
}

async function rollupConvertedEconomyByCampaignByDayManual(
  sinceDay: string,
  untilDay: string,
): Promise<Map<string, Map<string, DayEconomy>>> {
  const since = new Date(`${sinceDay}T00:00:00.000Z`);
  const until = new Date(`${untilDay}T23:59:59.999Z`);
  const rows = await db
    .select({
      metaCampaignId: metaCampaigns.id,
      day: sql<string>`((${orders.orderEventAt} at time zone 'utc')::date)::text`,
      convertedRevenue:
        sql<string>`coalesce(sum(${orders.value}::numeric) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
      convertedCogs:
        sql<string>`coalesce(sum(${orderItems.lineCogs}::numeric) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
      deliveryCost:
        sql<string>`coalesce(sum(${orders.deliveryCost}::numeric) filter (where ${orders.status} in ('paid', 'confirmed')), 0)::text`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(
      metaCampaigns,
      eq(orders.manualMetaCampaignId, metaCampaigns.id),
    )
    .where(
      and(
        isNull(orders.ctwaSessionId),
        isNotNull(orders.manualMetaCampaignId),
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
      ),
    )
    .groupBy(
      metaCampaigns.id,
      sql`((${orders.orderEventAt} at time zone 'utc')::date)`,
    );

  const m = new Map<string, Map<string, DayEconomy>>();
  for (const r of rows) {
    let inner = m.get(r.metaCampaignId);
    if (!inner) {
      inner = new Map();
      m.set(r.metaCampaignId, inner);
    }
    inner.set(r.day, {
      convertedRevenue: num(r.convertedRevenue),
      convertedCogs: num(r.convertedCogs),
      deliveryCost: num(r.deliveryCost),
    });
  }
  return m;
}

/**
 * Coefficient of variation of daily net profit (UTC) for each campaign, over inclusive [sinceDay, untilDay].
 * Net ≈ converted revenue − COGs − payable spend (card fee) − sales commission − delivery on converted orders.
 */
export async function computeDailyNetProfitCvByCampaign(
  sinceDay: string,
  untilDay: string,
  pnl: CampaignPnLFractions,
): Promise<Map<string, number | null>> {
  const [spendByCampDay, ctwaEcon, manualEcon] = await Promise.all([
    rollupSpendByCampaignByDay(sinceDay, untilDay),
    rollupConvertedEconomyByCampaignByDayCtwa(sinceDay, untilDay),
    rollupConvertedEconomyByCampaignByDayManual(sinceDay, untilDay),
  ]);
  const econByCampDay = mergeDayEconomyMaps(ctwaEcon, manualEcon);
  const days = listUtcDaysInclusive(sinceDay, untilDay);
  const fee = Math.max(0, pnl.cardFeePercent) / 100;
  const comm = Math.max(0, pnl.salesCommissionPercentOfConvertedRevenue) / 100;
  const ids = new Set<string>([
    ...spendByCampDay.keys(),
    ...econByCampDay.keys(),
  ]);
  const out = new Map<string, number | null>();
  for (const id of ids) {
    const spendDays = spendByCampDay.get(id);
    const econDays = econByCampDay.get(id);
    const series: number[] = [];
    for (const day of days) {
      const spend = spendDays?.get(day) ?? 0;
      const e =
        econDays?.get(day) ?? {
          convertedRevenue: 0,
          convertedCogs: 0,
          deliveryCost: 0,
        };
      const paidSpend = spend * (1 + fee);
      const commission = e.convertedRevenue * comm;
      const net =
        e.convertedRevenue -
        e.convertedCogs -
        paidSpend -
        commission -
        e.deliveryCost;
      series.push(net);
    }
    out.set(id, populationCvOfDailyNet(series));
  }
  return out;
}

type LagPartial = { avg: number; n: number };

async function rollupAvgOrderToConfirmLagByCampaignCtwa(
  sinceIso: string,
  untilIso: string,
): Promise<Map<string, LagPartial>> {
  const since = new Date(sinceIso);
  const until = new Date(untilIso);
  const rows = await db
    .select({
      metaCampaignId: metaAds.metaCampaignId,
      avgLag: sql<string>`coalesce(avg((extract(epoch from (${orders.updatedAt} - ${orders.orderEventAt})) / 86400.0)), null)::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(orders)
    .innerJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .innerJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .where(
      and(
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
        inArray(orders.status, ["paid", "confirmed"]),
      ),
    )
    .groupBy(metaAds.metaCampaignId);

  const m = new Map<string, LagPartial>();
  for (const r of rows) {
    const v = num(r.avgLag);
    if (Number.isFinite(v) && r.n > 0) {
      m.set(r.metaCampaignId, { avg: v, n: r.n });
    }
  }
  return m;
}

async function rollupAvgOrderToConfirmLagByCampaignManual(
  sinceIso: string,
  untilIso: string,
): Promise<Map<string, LagPartial>> {
  const since = new Date(sinceIso);
  const until = new Date(untilIso);
  const rows = await db
    .select({
      metaCampaignId: metaCampaigns.id,
      avgLag: sql<string>`coalesce(avg((extract(epoch from (${orders.updatedAt} - ${orders.orderEventAt})) / 86400.0)), null)::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(orders)
    .innerJoin(
      metaCampaigns,
      eq(orders.manualMetaCampaignId, metaCampaigns.id),
    )
    .where(
      and(
        isNull(orders.ctwaSessionId),
        isNotNull(orders.manualMetaCampaignId),
        gte(orders.orderEventAt, since),
        lte(orders.orderEventAt, until),
        inArray(orders.status, ["paid", "confirmed"]),
      ),
    )
    .groupBy(metaCampaigns.id);

  const m = new Map<string, LagPartial>();
  for (const r of rows) {
    const v = num(r.avgLag);
    if (Number.isFinite(v) && r.n > 0) {
      m.set(r.metaCampaignId, { avg: v, n: r.n });
    }
  }
  return m;
}

/** Mean days from order `order_event_at` to `updated_at` for paid+confirmed (proxy for confirmation delay). */
export async function rollupAvgOrderToConfirmLagByCampaign(
  sinceIso: string,
  untilIso: string,
): Promise<Map<string, number>> {
  const ctwa = await rollupAvgOrderToConfirmLagByCampaignCtwa(
    sinceIso,
    untilIso,
  );
  const manual = await rollupAvgOrderToConfirmLagByCampaignManual(
    sinceIso,
    untilIso,
  );
  const agg = new Map<string, { sum: number; n: number }>();
  for (const [id, { avg, n }] of ctwa) {
    agg.set(id, { sum: avg * n, n });
  }
  for (const [id, { avg, n }] of manual) {
    const ex = agg.get(id) ?? { sum: 0, n: 0 };
    agg.set(id, { sum: ex.sum + avg * n, n: ex.n + n });
  }
  const out = new Map<string, number>();
  for (const [id, { sum, n }] of agg) {
    if (n > 0) out.set(id, sum / n);
  }
  return out;
}

/** Trailing-7d UTC Meta delivery metrics (impression-weighted across ads), for verdict guards. */
export type CampaignMetaEngagementSignals = {
  weeklyAvgFrequency: number | null;
  firstImpressionShare: number | null;
  qualityRankingScore0to1: number | null;
  /** Consecutive UTC days ending `untilDay` with daily weighted quality below threshold; null if no signal. */
  qualityRankingLowStreakDays: number | null;
};

/**
 * Last 7 UTC days inclusive ending `untilDay`: frequency, first-time impression share,
 * quality score (week-weighted), and consecutive low-quality day count vs `minQualityRankScore`.
 */
export async function rollupCampaignMetaEngagementSignals(
  untilDay: string,
  minQualityRankScore: number,
): Promise<Map<string, CampaignMetaEngagementSignals>> {
  const since7 = addUtcDaysToDateOnly(untilDay, -6);
  const days: string[] = [];
  {
    let d = since7;
    for (let i = 0; i < 400; i++) {
      days.push(d);
      if (d === untilDay) break;
      d = addUtcDaysToDateOnly(d, 1);
    }
  }

  const rows = await db
    .select({
      metaCampaignId: adInsightsDaily.metaCampaignId,
      insightDate: adInsightsDaily.insightDate,
      impressions: adInsightsDaily.impressions,
      frequency: adInsightsDaily.frequency,
      qualityRanking: adInsightsDaily.qualityRanking,
      firstTimeImpressionRatio: adInsightsDaily.firstTimeImpressionRatio,
    })
    .from(adInsightsDaily)
    .where(
      and(
        gte(adInsightsDaily.insightDate, since7),
        lte(adInsightsDaily.insightDate, untilDay),
        sql`${adInsightsDaily.metaCampaignId} is not null`,
      ),
    );

  type Acc = {
    freqNum: number;
    freqDen: number;
    firNum: number;
    firDen: number;
    qualNum: number;
    qualDen: number;
    byDay: Map<
      string,
      { qualNum: number; qualDen: number }
    >;
  };

  const byCamp = new Map<string, Acc>();

  for (const r of rows) {
    const cid = r.metaCampaignId;
    if (!cid) continue;
    const imps = r.impressions;
    if (imps <= 0) continue;

    let acc = byCamp.get(cid);
    if (!acc) {
      acc = {
        freqNum: 0,
        freqDen: 0,
        firNum: 0,
        firDen: 0,
        qualNum: 0,
        qualDen: 0,
        byDay: new Map(),
      };
      byCamp.set(cid, acc);
    }

    const f = r.frequency != null ? num(r.frequency) : null;
    if (f != null && Number.isFinite(f)) {
      acc.freqNum += imps * f;
      acc.freqDen += imps;
    }

    const fir =
      r.firstTimeImpressionRatio != null
        ? num(r.firstTimeImpressionRatio)
        : null;
    if (fir != null && Number.isFinite(fir)) {
      acc.firNum += imps * fir;
      acc.firDen += imps;
    }

    const q = metaQualityRankingToScore0to1(r.qualityRanking);
    if (q != null) {
      acc.qualNum += imps * q;
      acc.qualDen += imps;
      let dayAcc = acc.byDay.get(r.insightDate);
      if (!dayAcc) {
        dayAcc = { qualNum: 0, qualDen: 0 };
        acc.byDay.set(r.insightDate, dayAcc);
      }
      dayAcc.qualNum += imps * q;
      dayAcc.qualDen += imps;
    }
  }

  const out = new Map<string, CampaignMetaEngagementSignals>();
  for (const [cid, acc] of byCamp) {
    const weeklyAvgFrequency =
      acc.freqDen > 0 ? acc.freqNum / acc.freqDen : null;
    const firstImpressionShare =
      acc.firDen > 0 ? acc.firNum / acc.firDen : null;
    const qualityRankingScore0to1 =
      acc.qualDen > 0 ? acc.qualNum / acc.qualDen : null;

    let qualityRankingLowStreakDays: number | null = null;
    if (acc.qualDen > 0) {
      let streak = 0;
      for (let i = days.length - 1; i >= 0; i--) {
        const day = days[i]!;
        const da = acc.byDay.get(day);
        const dailyQ =
          da != null && da.qualDen > 0 ? da.qualNum / da.qualDen : null;
        if (dailyQ == null) break;
        if (dailyQ < minQualityRankScore) streak++;
        else break;
      }
      qualityRankingLowStreakDays = streak > 0 ? streak : null;
    }

    out.set(cid, {
      weeklyAvgFrequency,
      firstImpressionShare,
      qualityRankingScore0to1,
      qualityRankingLowStreakDays,
    });
  }

  return out;
}

export async function getUnattributedOrderTotals(
  sinceIso: string,
  untilIso: string,
): Promise<{ ordersCount: number; revenue: number }> {
  const [row] = await db
    .select({
      c: sql<number>`count(${orders.id})::int`,
      rev: sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
    })
    .from(orders)
    .where(
      and(
        gte(orders.orderEventAt, new Date(sinceIso)),
        lte(orders.orderEventAt, new Date(untilIso)),
        isNull(orders.ctwaSessionId),
        isNull(orders.manualMetaCampaignId),
      ),
    );
  return {
    ordersCount: row?.c ?? 0,
    revenue: num(row?.rev),
  };
}

/** Orders with CTWA but ad not linked (attribution gap). */
export async function getUnlinkedCtwaOrderTotals(
  sinceIso: string,
  untilIso: string,
): Promise<{ ordersCount: number; revenue: number }> {
  const [row] = await db
    .select({
      c: sql<number>`count(${orders.id})::int`,
      rev: sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
    })
    .from(orders)
    .innerJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .where(
      and(
        gte(orders.orderEventAt, new Date(sinceIso)),
        lte(orders.orderEventAt, new Date(untilIso)),
        isNull(ctwaSessions.metaAdId),
      ),
    );
  return {
    ordersCount: row?.c ?? 0,
    revenue: num(row?.rev),
  };
}

export async function getCampaignPerformanceRollups(
  sinceIso: string,
  untilIso: string,
  sinceDay: string,
  untilDay: string,
  pnl: CampaignPnLFractions = {
    cardFeePercent: DEFAULT_CAMPAIGN_CARD_FEE_PERCENT,
    salesCommissionPercentOfConvertedRevenue:
      DEFAULT_CAMPAIGN_SALES_COMMISSION_PERCENT,
  },
): Promise<CampaignPerformanceRow[]> {
  const thresholds = getCampaignThresholds();
  const cvSinceDay = addUtcDaysToDateOnly(untilDay, -6);
  const baselineSinceDay = addUtcDaysToDateOnly(sinceDay, -7);
  const baselineUntilDay = addUtcDaysToDateOnly(sinceDay, -1);
  const baselineSinceIso = `${baselineSinceDay}T00:00:00.000Z`;
  const baselineUntilIso = `${baselineUntilDay}T23:59:59.999Z`;

  const [
    spendMap,
    ctwaMap,
    orderAggMap,
    cogsMap,
    feesMap,
    deliveryMap,
    metaActionsMap,
    unattributedTotals,
    campaignLookup,
    cvByCampaign,
    lagRecentMap,
    lagBaselineMap,
    metaEngagementByCampaign,
  ] = await Promise.all([
    rollupSpendByCampaign(sinceDay, untilDay),
    rollupCtwaSessionsByCampaign(sinceIso, untilIso),
    rollupAttributedOrdersAggByCampaign(sinceIso, untilIso),
    rollupLineCogsByCampaign(sinceIso, untilIso),
    rollupPaidOperationalCostsByCampaign(sinceIso, untilIso),
    rollupAdInsightsDeliveryByCampaign(sinceDay, untilDay),
    rollupMetaAttributedActionsByCampaign(sinceDay, untilDay),
    getUnattributedOrderTotals(sinceIso, untilIso),
    loadMetaCampaignLookup(),
    computeDailyNetProfitCvByCampaign(cvSinceDay, untilDay, pnl),
    rollupAvgOrderToConfirmLagByCampaign(sinceIso, untilIso),
    rollupAvgOrderToConfirmLagByCampaign(baselineSinceIso, baselineUntilIso),
    rollupCampaignMetaEngagementSignals(untilDay, thresholds.minQualityRankScore),
  ]);

  const ids = new Set<string>([
    ...spendMap.keys(),
    ...ctwaMap.keys(),
    ...orderAggMap.keys(),
    ...feesMap.keys(),
    ...deliveryMap.keys(),
    ...metaActionsMap.keys(),
  ]);

  const out: CampaignPerformanceRow[] = [];

  for (const id of ids) {
    const cat = campaignLookup.get(id);

    const spend = spendMap.get(id) ?? 0;
    const ctwaSessionsCount = ctwaMap.get(id) ?? 0;
    const o = orderAggMap.get(id);
    const cogs = cogsMap.get(id) ?? {
      totalLineCogs: 0,
      paidLineCogs: 0,
      convertedLineCogs: 0,
    };

    const ordersCount = o?.ordersCount ?? 0;
    const paidOrdersCount = o?.paidOrdersCount ?? 0;
    const pendingOrdersCount = o?.pendingOrdersCount ?? 0;
    const confirmedOrdersCount = o?.confirmedOrdersCount ?? 0;
    const shippedOrdersCount = o?.shippedOrdersCount ?? 0;
    const cancelledOrdersCount = o?.cancelledOrdersCount ?? 0;
    const returnedOrdersCount = o?.returnedOrdersCount ?? 0;
    const totalRevenue = o?.totalRevenue ?? 0;
    const paidRevenue = o?.paidRevenue ?? 0;
    const convertedOrdersCount = o?.convertedOrdersCount ?? 0;
    const convertedRevenue = o?.convertedRevenue ?? 0;
    const capiSentCount = o?.capiSentCount ?? 0;
    const totalLineCogs = cogs.totalLineCogs;
    const paidLineCogs = cogs.paidLineCogs;
    const convertedLineCogs = cogs.convertedLineCogs;
    const paidOperationalCosts = feesMap.get(id) ?? 0;
    const del = deliveryMap.get(id) ?? { impressions: 0, clicks: 0 };
    const impressions = del.impressions;
    const clicks = del.clicks;
    const metaAct = metaActionsMap.get(id) ?? {
      messagingConversationsStarted: 0,
      metaPurchases: 0,
    };
    const metaMessagingConversationsStarted =
      metaAct.messagingConversationsStarted;
    const metaPurchases = metaAct.metaPurchases;

    const ctr =
      impressions > 0 ? clicks / impressions : null;

    const outboundCtr =
      clicks > 0 ? metaMessagingConversationsStarted / clicks : null;

    const returnRate =
      shippedOrdersCount > 0
        ? returnedOrdersCount / shippedOrdersCount
        : null;

    const metaEng = metaEngagementByCampaign.get(id);

    const verdictDetail = evaluateCampaign(
      {
        spend,
        paymentCardFeePercent: pnl.cardFeePercent,
        salesCommissionPercentOfConvertedRevenue:
          pnl.salesCommissionPercentOfConvertedRevenue,
        ctwaSessions: ctwaSessionsCount,
        ordersCount,
        paidOrdersCount,
        pendingOrdersCount,
        totalRevenue,
        paidRevenue,
        convertedOrdersCount,
        convertedRevenue,
        totalLineCogs,
        paidLineCogs,
        convertedLineCogs,
        paidOperationalCosts,
        capiSentCount,
        metaMessagingConversationsStarted,
        metaPurchases,
        shippedOrdersCount,
        returnedOrdersCount,
      },
      thresholds,
      {
        unattributedOrdersInWindow: unattributedTotals.ordersCount,
        logContext: id,
        signals: {
          linkCtr: ctr,
          outboundCtr,
          dailyNetProfitCv7d: cvByCampaign.get(id) ?? null,
          returnRate,
          avgDaysOrderToConfirmRecent: lagRecentMap.get(id) ?? null,
          avgDaysOrderToConfirmBaseline: lagBaselineMap.get(id) ?? null,
          weeklyAvgFrequency: metaEng?.weeklyAvgFrequency ?? null,
          firstImpressionShare: metaEng?.firstImpressionShare ?? null,
          qualityRankingScore0to1: metaEng?.qualityRankingScore0to1 ?? null,
          qualityRankingLowStreakDays:
            metaEng?.qualityRankingLowStreakDays ?? null,
        },
      },
    );

    const grossProfitPaid = verdictDetail.grossProfitPaid;
    const netProfitPaid = verdictDetail.netProfitPaid;
    const preFeeContribution = verdictDetail.preFeeContribution;
    const contributionProfit = verdictDetail.contributionProfit;
    const contributionRoas = verdictDetail.contributionRoas;
    const paidAdSpend = verdictDetail.paidAdSpend;
    const cardSurchargeAmount = verdictDetail.cardSurchargeAmount;
    const salesCommissionPaid = verdictDetail.salesCommissionPaid;

    const cpc =
      clicks > 0 ? paidAdSpend / clicks : null;
    const cpm =
      impressions > 0 ? (1000 * paidAdSpend) / impressions : null;
    const costPerCtwa =
      ctwaSessionsCount > 0 ? paidAdSpend / ctwaSessionsCount : null;

    const roasPaid =
      paidAdSpend > 0 && convertedRevenue > 0
        ? convertedRevenue / paidAdSpend
        : paidAdSpend > 0
          ? 0
          : null;
    const roasTotal =
      paidAdSpend > 0 && totalRevenue > 0
        ? totalRevenue / paidAdSpend
        : paidAdSpend > 0
          ? 0
          : null;

    out.push({
      metaCampaignId: id,
      campaignName: o?.campaignName ?? cat?.name ?? null,
      campaignEffectiveStatus: cat?.effectiveStatus ?? null,
      spend,
      ctwaSessions: ctwaSessionsCount,
      ordersCount,
      paidOrdersCount,
      pendingOrdersCount,
      confirmedOrdersCount,
      shippedOrdersCount,
      cancelledOrdersCount,
      returnedOrdersCount,
      totalRevenue,
      paidRevenue,
      convertedOrdersCount,
      convertedRevenue,
      totalLineCogs,
      paidLineCogs,
      convertedLineCogs,
      paidOperationalCosts,
      impressions,
      clicks,
      ctr,
      cpc,
      cpm,
      costPerCtwa,
      metaMessagingConversationsStarted,
      metaPurchases,
      grossProfitPaid,
      paidAdSpend,
      cardSurchargeAmount,
      salesCommissionPaid,
      netProfitPaid,
      preFeeContribution,
      contributionProfit,
      contributionRoas,
      roasPaid,
      roasTotal,
      verdict: verdictDetail.verdict,
      verdictDetail,
      verdictReasons: verdictDetail.reasons,
      metaWeeklyAvgFrequency: metaEng?.weeklyAvgFrequency ?? null,
      metaQualityScore7d: metaEng?.qualityRankingScore0to1 ?? null,
      metaQualityLowStreakDays: metaEng?.qualityRankingLowStreakDays ?? null,
      metaFirstImpressionShare7d: metaEng?.firstImpressionShare ?? null,
    });
  }

  out.sort((a, b) => b.netProfitPaid - a.netProfitPaid);
  return out;
}

/** @deprecated Use getCampaignPerformanceRollups */
export type CampaignRollup = {
  metaCampaignId: string;
  campaignName: string | null;
  revenue: number;
  spend: number;
  ordersCount: number;
  roas: number | null;
};

export async function getCampaignRoasRollups(
  sinceIso: string,
  untilIso: string,
  sinceDay: string,
  untilDay: string,
): Promise<CampaignRollup[]> {
  const rows = await getCampaignPerformanceRollups(
    sinceIso,
    untilIso,
    sinceDay,
    untilDay,
  );
  return rows.map((r) => ({
    metaCampaignId: r.metaCampaignId,
    campaignName: r.campaignName,
    revenue: r.totalRevenue,
    spend: r.spend,
    ordersCount: r.ordersCount,
    roas: r.roasTotal,
  }));
}

export type MetaCampaignTreeCampaign = {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  effectiveStatus: string | null;
  syncedAt: Date;
  adSets: MetaCampaignTreeAdSet[];
};

export type MetaCampaignTreeAdSet = {
  id: string;
  name: string | null;
  status: string | null;
  effectiveStatus: string | null;
  syncedAt: Date;
  ads: MetaCampaignTreeAd[];
};

export type MetaCampaignTreeAd = {
  id: string;
  name: string | null;
  status: string | null;
  effectiveStatus: string | null;
  syncedAt: Date;
};

export async function loadMetaCampaignTreeFromDb(): Promise<
  MetaCampaignTreeCampaign[]
> {
  const [campaigns, adSets, ads] = await Promise.all([
    db.select().from(metaCampaigns).orderBy(asc(metaCampaigns.name)),
    db.select().from(metaAdSets).orderBy(asc(metaAdSets.name)),
    db.select().from(metaAds).orderBy(asc(metaAds.name)),
  ]);

  const adsByAdSet = new Map<string, typeof ads>();
  for (const ad of ads) {
    const list = adsByAdSet.get(ad.metaAdSetId) ?? [];
    list.push(ad);
    adsByAdSet.set(ad.metaAdSetId, list);
  }

  const adSetsByCampaign = new Map<string, typeof adSets>();
  for (const a of adSets) {
    const list = adSetsByCampaign.get(a.metaCampaignId) ?? [];
    list.push(a);
    adSetsByCampaign.set(a.metaCampaignId, list);
  }

  return campaigns.map((c) => {
    const sets = adSetsByCampaign.get(c.id) ?? [];
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      effectiveStatus: c.effectiveStatus,
      syncedAt: c.syncedAt,
      adSets: sets.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        effectiveStatus: s.effectiveStatus,
        syncedAt: s.syncedAt,
        ads: (adsByAdSet.get(s.id) ?? []).map((ad) => ({
          id: ad.id,
          name: ad.name,
          status: ad.status,
          effectiveStatus: ad.effectiveStatus,
          syncedAt: ad.syncedAt,
        })),
      })),
    };
  });
}

export type MetaCampaignPickerOption = {
  id: string;
  name: string | null;
};

/** Labels for manual order→campaign attribution (synced Meta campaigns). */
export async function listMetaCampaignsForManualAttribution(): Promise<
  MetaCampaignPickerOption[]
> {
  return db
    .select({ id: metaCampaigns.id, name: metaCampaigns.name })
    .from(metaCampaigns)
    .orderBy(asc(metaCampaigns.name));
}
