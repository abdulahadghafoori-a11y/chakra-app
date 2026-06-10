import { and, eq, gte, lte, sql } from "drizzle-orm";

import {
  metaAds,
  orderItems,
  orders,
  products,
  ctwaSessions,
} from "@/drizzle/schema";
import { getPeriodAdSpendScale } from "@/lib/period-ad-spend-scale";
import { rollupSpendByCampaign } from "@/lib/campaigns-rollups";
import { db } from "@/lib/db";
import { APP_CURRENCY } from "@/lib/validations/order";
import { ORDER_SALES_CHANNELS } from "@/lib/sales-channel";

const CARD_MARKETING_SLUGS = [
  "marketing-non-meta",
  "software",
  "bank-fees",
] as const;

export type ProductFinanceRow = {
  productId: string;
  productName: string;
  sku: string;
  unitsSold: number;
  orderCount: number;
  revenueUsd: number;
  cogsUsd: number;
  deliveryUsd: number;
  grossProfitUsd: number;
  /** Meta Ads Manager spend allocated by revenue share within each campaign. */
  allocatedInsightsSpendUsd: number;
  /** Insights allocation × period cash scale (bank charge vs Insights, FX-aware). */
  allocatedCashAdjustedSpendUsd: number;
  contributionAfterInsightsUsd: number;
  contributionAfterCashAdjustedUsd: number;
  onlineAttributedRevenueUsd: number;
  campaignCount: number;
};

export type ProductFinanceReport = {
  periodLabel: string;
  sinceDate: string;
  untilDate: string;
  rows: ProductFinanceRow[];
  totals: {
    revenueUsd: number;
    grossProfitUsd: number;
    allocatedInsightsSpendUsd: number;
    allocatedCashAdjustedSpendUsd: number;
    totalInsightsSpendUsd: number;
    cardMarketingUsd: number;
    cashScaleFactor: number;
    fxGapUsd: number;
    scaleMethod: "reconciled" | "fallback";
  };
  unallocatedInsightsSpendUsd: number;
};

function num(s: string | null | undefined): number {
  if (s == null || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function ordersSoldInKabulRange(sinceDate: string, untilDate: string) {
  return and(
    eq(orders.currency, APP_CURRENCY),
    sql`${orders.status} not in ('cancelled', 'returned')`,
    gte(
      sql`(${orders.orderEventAt} at time zone 'Asia/Kabul')::date`,
      sql`${sinceDate}::date`,
    ),
    lte(
      sql`(${orders.orderEventAt} at time zone 'Asia/Kabul')::date`,
      sql`${untilDate}::date`,
    ),
  );
}

const sqlMetaCampaignId = sql<string | null>`coalesce(${metaAds.metaCampaignId}, ${orders.manualMetaCampaignId})`;

/**
 * Product P&amp;L by **sale date** (Kabul). Meta spend is **estimated**: Insights spend per
 * campaign in the period is split by each product's share of attributed online revenue
 * in that campaign (orders sold in the period with a campaign link). Card spend uses the
 * same proportions against total marketing card charges — cash basis, not per-campaign truth.
 */
export async function getProductFinanceReport(input: {
  sinceDate: string;
  untilDate: string;
  label: string;
}): Promise<ProductFinanceReport> {
  const lineRows = await db
    .select({
      productId: orderItems.productId,
      productName: products.name,
      sku: products.sku,
      quantity: orderItems.quantity,
      lineValue: orderItems.lineValue,
      lineCogs: orderItems.lineCogs,
      orderId: orders.id,
      orderValue: orders.value,
      deliveryCost: orders.deliveryCost,
      salesChannel: orders.salesChannel,
      metaCampaignId: sqlMetaCampaignId,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .leftJoin(metaAds, eq(ctwaSessions.metaAdId, metaAds.id))
    .where(ordersSoldInKabulRange(input.sinceDate, input.untilDate));

  type ProductAcc = {
    productId: string;
    productName: string;
    sku: string;
    unitsSold: number;
    orderIds: Set<string>;
    revenueUsd: number;
    cogsUsd: number;
    deliveryUsd: number;
    onlineAttributedRevenueUsd: number;
    byCampaign: Map<string, number>;
    campaignIds: Set<string>;
  };

  const byProduct = new Map<string, ProductAcc>();
  const campaignRevenueInPeriod = new Map<string, number>();

  for (const row of lineRows) {
    const lineVal = num(String(row.lineValue));
    const lineCogs = num(String(row.lineCogs));
    const orderVal = num(String(row.orderValue));
    const delivery = num(String(row.deliveryCost));
    const deliveryShare =
      orderVal > 0 ? delivery * (lineVal / orderVal) : 0;

    let acc = byProduct.get(row.productId);
    if (!acc) {
      acc = {
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        unitsSold: 0,
        orderIds: new Set(),
        revenueUsd: 0,
        cogsUsd: 0,
        deliveryUsd: 0,
        onlineAttributedRevenueUsd: 0,
        byCampaign: new Map(),
        campaignIds: new Set(),
      };
      byProduct.set(row.productId, acc);
    }

    acc.unitsSold += row.quantity;
    acc.orderIds.add(row.orderId);
    acc.revenueUsd += lineVal;
    acc.cogsUsd += lineCogs;
    acc.deliveryUsd += deliveryShare;

    const campId = row.metaCampaignId?.trim() || null;
    const isOnline = row.salesChannel === ORDER_SALES_CHANNELS[0];
    if (isOnline && campId) {
      acc.onlineAttributedRevenueUsd += lineVal;
      acc.campaignIds.add(campId);
      acc.byCampaign.set(campId, (acc.byCampaign.get(campId) ?? 0) + lineVal);
      campaignRevenueInPeriod.set(
        campId,
        (campaignRevenueInPeriod.get(campId) ?? 0) + lineVal,
      );
    }
  }

  const spendByCampaign = await rollupSpendByCampaign(
    input.sinceDate,
    input.untilDate,
  );

  let allocatedInsightsTotal = 0;

  const productRows: ProductFinanceRow[] = [];

  for (const acc of byProduct.values()) {
    let allocatedInsights = 0;
    for (const [campId, prodRev] of acc.byCampaign) {
      const campRev = campaignRevenueInPeriod.get(campId) ?? 0;
      const campSpend = spendByCampaign.get(campId) ?? 0;
      if (campRev > 0 && campSpend > 0) {
        allocatedInsights += (prodRev / campRev) * campSpend;
      }
    }

    const grossProfit = acc.revenueUsd - acc.cogsUsd - acc.deliveryUsd;
    productRows.push({
      productId: acc.productId,
      productName: acc.productName,
      sku: acc.sku,
      unitsSold: acc.unitsSold,
      orderCount: acc.orderIds.size,
      revenueUsd: acc.revenueUsd,
      cogsUsd: acc.cogsUsd,
      deliveryUsd: acc.deliveryUsd,
      grossProfitUsd: grossProfit,
      allocatedInsightsSpendUsd: allocatedInsights,
      allocatedCashAdjustedSpendUsd: 0,
      contributionAfterInsightsUsd: grossProfit - allocatedInsights,
      contributionAfterCashAdjustedUsd: 0,
      onlineAttributedRevenueUsd: acc.onlineAttributedRevenueUsd,
      campaignCount: acc.campaignIds.size,
    });
    allocatedInsightsTotal += allocatedInsights;
  }

  // Correct total insights (sum campaigns once)
  let totalInsightsSpend = 0;
  for (const spend of spendByCampaign.values()) {
    totalInsightsSpend += spend;
  }

  const adScale = await getPeriodAdSpendScale(
    input.sinceDate,
    input.untilDate,
  );

  for (const row of productRows) {
    row.allocatedCashAdjustedSpendUsd =
      row.allocatedInsightsSpendUsd * adScale.scale;
    row.contributionAfterCashAdjustedUsd =
      row.grossProfitUsd - row.allocatedCashAdjustedSpendUsd;
    row.contributionAfterInsightsUsd =
      row.grossProfitUsd - row.allocatedInsightsSpendUsd;
  }

  productRows.sort((a, b) => b.revenueUsd - a.revenueUsd);

  const totals = productRows.reduce(
    (t, r) => ({
      revenueUsd: t.revenueUsd + r.revenueUsd,
      grossProfitUsd: t.grossProfitUsd + r.grossProfitUsd,
      allocatedInsightsSpendUsd:
        t.allocatedInsightsSpendUsd + r.allocatedInsightsSpendUsd,
      allocatedCashAdjustedSpendUsd:
        t.allocatedCashAdjustedSpendUsd + r.allocatedCashAdjustedSpendUsd,
      totalInsightsSpendUsd: totalInsightsSpend,
      cardMarketingUsd: adScale.cardUsd,
      cashScaleFactor: adScale.scale,
      fxGapUsd: adScale.fxGapUsd,
      scaleMethod: adScale.method,
    }),
    {
      revenueUsd: 0,
      grossProfitUsd: 0,
      allocatedInsightsSpendUsd: 0,
      allocatedCashAdjustedSpendUsd: 0,
      totalInsightsSpendUsd: totalInsightsSpend,
      cardMarketingUsd: adScale.cardUsd,
      cashScaleFactor: adScale.scale,
      fxGapUsd: adScale.fxGapUsd,
      scaleMethod: adScale.method,
    },
  );

  const unallocatedInsightsSpendUsd = Math.max(
    0,
    totalInsightsSpend - allocatedInsightsTotal,
  );

  return {
    periodLabel: input.label,
    sinceDate: input.sinceDate,
    untilDate: input.untilDate,
    rows: productRows,
    totals,
    unallocatedInsightsSpendUsd,
  };
}
