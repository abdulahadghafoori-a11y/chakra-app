import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";

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
  const rows = await db
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
    .where(
      and(
        gte(orders.createdAt, new Date(sinceIso)),
        lte(orders.createdAt, new Date(untilIso)),
      ),
    )
    .groupBy(metaAds.metaCampaignId, metaCampaigns.name);

  const m = new Map<
    string,
    { campaignName: string | null; revenue: number; ordersCount: number }
  >();
  for (const r of rows) {
    m.set(r.metaCampaignId, {
      campaignName: r.campaignName,
      revenue: num(r.revenue),
      ordersCount: r.ordersCount,
    });
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
 * Sum delivery cost (`orders.delivery_cost`) for paid + confirmed attributed orders in the window.
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
    .where(
      and(
        gte(orders.createdAt, since),
        lte(orders.createdAt, until),
      ),
    )
    .groupBy(metaAds.metaCampaignId);

  const m = new Map<string, number>();
  for (const r of feeRows) {
    m.set(r.metaCampaignId, num(r.fees));
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

export async function rollupAttributedOrdersAggByCampaign(
  sinceIso: string,
  untilIso: string,
): Promise<Map<string, OrderAggRow>> {
  const rows = await db
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
    .where(
      and(
        gte(orders.createdAt, new Date(sinceIso)),
        lte(orders.createdAt, new Date(untilIso)),
      ),
    )
    .groupBy(metaAds.metaCampaignId, metaCampaigns.name);

  const m = new Map<string, OrderAggRow>();
  for (const r of rows) {
    m.set(r.metaCampaignId, {
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
  return m;
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
    .where(
      and(
        gte(orders.createdAt, new Date(sinceIso)),
        lte(orders.createdAt, new Date(untilIso)),
      ),
    )
    .groupBy(metaAds.metaCampaignId);

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
  /** Delivery costs on paid + confirmed orders (COD cockpit). */
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
  contributionProfit: number;
  contributionRoas: number | null;
  roasPaid: number | null;
  roasTotal: number | null;
  verdict: CampaignVerdict;
  verdictDetail: CampaignVerdictResult;
  verdictReasons: CampaignVerdictResult["reasons"];
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
        gte(orders.createdAt, new Date(sinceIso)),
        lte(orders.createdAt, new Date(untilIso)),
        isNull(orders.ctwaSessionId),
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
        gte(orders.createdAt, new Date(sinceIso)),
        lte(orders.createdAt, new Date(untilIso)),
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
): Promise<CampaignPerformanceRow[]> {
  const thresholds = getCampaignThresholds();
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
  ]);

  const ids = new Set<string>([
    ...spendMap.keys(),
    ...ctwaMap.keys(),
    ...orderAggMap.keys(),
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
    const ctr =
      impressions > 0 ? clicks / impressions : null;
    const cpc = clicks > 0 ? spend / clicks : null;
    const cpm = impressions > 0 ? (1000 * spend) / impressions : null;
    const costPerCtwa =
      ctwaSessionsCount > 0 ? spend / ctwaSessionsCount : null;

    const metaAct = metaActionsMap.get(id) ?? {
      messagingConversationsStarted: 0,
      metaPurchases: 0,
    };
    const metaMessagingConversationsStarted =
      metaAct.messagingConversationsStarted;
    const metaPurchases = metaAct.metaPurchases;

    const grossProfitPaid =
      convertedRevenue - convertedLineCogs - paidOperationalCosts;
    const contributionProfit = grossProfitPaid - spend;
    const contributionRoas = spend > 0 ? contributionProfit / spend : null;
    const roasPaid =
      spend > 0 && convertedRevenue > 0
        ? convertedRevenue / spend
        : spend > 0
          ? 0
          : null;
    const roasTotal =
      spend > 0 && totalRevenue > 0
        ? totalRevenue / spend
        : spend > 0
          ? 0
          : null;

    const verdictDetail = evaluateCampaign(
      {
        spend,
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
      },
      thresholds,
      {
        unattributedOrdersInWindow: unattributedTotals.ordersCount,
      },
    );

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
      contributionProfit,
      contributionRoas,
      roasPaid,
      roasTotal,
      verdict: verdictDetail.verdict,
      verdictDetail,
      verdictReasons: verdictDetail.reasons,
    });
  }

  out.sort((a, b) => b.contributionProfit - a.contributionProfit);
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
