import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import {
  getCampaignAdBreakdown,
  getCampaignAttributionSplit,
  getCampaignDailyPerformanceForCampaign,
  getCampaignPerformanceSlice,
  listAttributedOrdersForCampaign,
  listCampaignActivityRows,
  loadCampaignMetaHeader,
  priorEqualUtcWindowBounds,
} from "@/lib/campaign-detail";
import {
  assertValidCampaignInsightRange,
  parseCampaignRangeSearchParams,
} from "@/lib/campaign-insights-range";
import {
  formatActivityWhenForLocale,
  presentCampaignActivityRow,
} from "@/lib/campaign-activity-present";
import { parseCampaignPnLFractions } from "@/lib/campaign-pnl-params";
import { requireStaffSession } from "@/lib/staff-auth/guard";
import { APP_CURRENCY } from "@/lib/validations/order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sliceCampaignSearchParams(sp: Record<string, string>) {
  return {
    range: sp.range,
    from: sp.from,
    to: sp.to,
    days: sp.days,
    fee_pct: sp.fee_pct,
    sales_pct: sp.sales_pct,
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    await requireStaffSession();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { campaignId } = await context.params;
  const url = new URL(req.url);
  const flatParams = Object.fromEntries(url.searchParams.entries()) as Record<
    string,
    string
  >;

  const header = await loadCampaignMetaHeader(campaignId);
  if (!header) return new NextResponse("Not found", { status: 404 });

  let parsedRange;
  try {
    parsedRange = parseCampaignRangeSearchParams(
      sliceCampaignSearchParams(flatParams),
    );
    assertValidCampaignInsightRange(parsedRange.sinceDay, parsedRange.untilDay);
  } catch {
    return new NextResponse("Invalid date range", { status: 400 });
  }

  const pnlFractions = parseCampaignPnLFractions(
    sliceCampaignSearchParams(flatParams),
  );
  const prior = priorEqualUtcWindowBounds(parsedRange.sinceDay, parsedRange.untilDay);

  const [
    primaryPerformance,
    priorPerformance,
    daily,
    adsBreakdown,
    attributedOrders,
    activityRows,
    attributionSplit,
  ] = await Promise.all([
    getCampaignPerformanceSlice(
      campaignId,
      parsedRange.sinceIso,
      parsedRange.untilIso,
      parsedRange.sinceDay,
      parsedRange.untilDay,
      pnlFractions,
    ),
    getCampaignPerformanceSlice(
      campaignId,
      prior.prevSinceIso,
      prior.prevUntilIso,
      prior.prevSinceDay,
      prior.prevUntilDay,
      pnlFractions,
    ),
    getCampaignDailyPerformanceForCampaign(
      campaignId,
      parsedRange.sinceDay,
      parsedRange.untilDay,
      pnlFractions,
    ),
    getCampaignAdBreakdown(
      campaignId,
      parsedRange.sinceDay,
      parsedRange.untilDay,
      parsedRange.sinceIso,
      parsedRange.untilIso,
      pnlFractions,
    ),
    listAttributedOrdersForCampaign(
      campaignId,
      parsedRange.sinceIso,
      parsedRange.untilIso,
      5000,
    ),
    listCampaignActivityRows(campaignId, 8000, {
      metaMarketingApiOnly: true,
    }),
    getCampaignAttributionSplit(
      campaignId,
      parsedRange.sinceIso,
      parsedRange.untilIso,
    ),
  ]);

  const generatedAt = new Date().toISOString();
  const safeId = campaignId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 48);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "chakra-app";

  const summaryKv: Array<[string, string]> = [
    ["campaign_id", campaignId],
    ["campaign_name", header.name ?? ""],
    ["objective", header.objective ?? ""],
    ["status", header.status ?? ""],
    ["effective_status", header.effectiveStatus ?? ""],
    ["structure_synced_at", header.syncedAt.toISOString()],
    ["generated_at", generatedAt],
    ["currency", APP_CURRENCY],
    ["range_since_day", parsedRange.sinceDay],
    ["range_until_day", parsedRange.untilDay],
    ["prior_since_day", prior.prevSinceDay],
    ["prior_until_day", prior.prevUntilDay],
    ["fee_pct", String(pnlFractions.cardFeePercent)],
    [
      "sales_commission_pct",
      String(pnlFractions.salesCommissionPercentOfConvertedRevenue),
    ],
    ["primary_spend", primaryPerformance ? String(primaryPerformance.spend) : ""],
    [
      "primary_converted_revenue",
      primaryPerformance ? String(primaryPerformance.convertedRevenue) : "",
    ],
    [
      "primary_net_profit",
      primaryPerformance ? String(primaryPerformance.netProfitPaid) : "",
    ],
    ["primary_verdict", primaryPerformance ? primaryPerformance.verdict : ""],
    ["prior_spend", priorPerformance ? String(priorPerformance.spend) : ""],
    [
      "prior_converted_revenue",
      priorPerformance ? String(priorPerformance.convertedRevenue) : "",
    ],
    ["prior_net_profit", priorPerformance ? String(priorPerformance.netProfitPaid) : ""],
    ["prior_verdict", priorPerformance ? priorPerformance.verdict : ""],
    ["split_ctwa_orders", String(attributionSplit.ctwa.ordersCount)],
    [
      "split_ctwa_converted_orders",
      String(attributionSplit.ctwa.convertedOrdersCount),
    ],
    [
      "split_ctwa_converted_revenue",
      String(attributionSplit.ctwa.convertedRevenue),
    ],
    ["split_manual_orders", String(attributionSplit.manual.ordersCount)],
    [
      "split_manual_converted_orders",
      String(attributionSplit.manual.convertedOrdersCount),
    ],
    [
      "split_manual_converted_revenue",
      String(attributionSplit.manual.convertedRevenue),
    ],
  ];

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.addRow(["key", "value"]);
  for (const [k, v] of summaryKv) summarySheet.addRow([k, v]);

  const dailyHeader = [
    "day",
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "messaging_started",
    "app_orders",
    "converted_revenue",
    "converted_cogs",
    "delivery_cost",
    "payable_ad_spend",
    "sales_commission",
    "daily_net_profit",
    "weighted_frequency",
    "weighted_quality_score",
  ];
  const dailySheet = workbook.addWorksheet("Daily");
  dailySheet.addRow(dailyHeader);
  for (const d of daily) {
    dailySheet.addRow([
      d.day,
      d.spend,
      d.impressions,
      d.clicks,
      d.ctr ?? "",
      d.messagingStarted,
      d.attributedOrdersCount,
      d.convertedRevenue,
      d.convertedCogs,
      d.deliveryCost,
      d.payableAdSpend,
      d.salesCommission,
      d.dailyNetProfit,
      d.weightedFrequency ?? "",
      d.weightedQualityScore ?? "",
    ]);
  }

  const adsHeader = [
    "meta_ad_id",
    "ad_name",
    "verdict",
    "impressions",
    "clicks",
    "ctr",
    "spend",
    "payable_ad_spend",
    "ctwa_sessions",
    "messaging_started",
    "meta_purchases_insights",
    "orders_total",
    "orders_paid",
    "orders_pending",
    "orders_converted",
    "converted_revenue",
    "gross_profit",
    "sales_commission",
    "delivery_cost_converted",
    "net_profit",
    "cpa_paid",
    "profit_roas",
    "capi_rate",
    "meta_freq_7d_wtd",
    "meta_quality_7d_wtd",
    "meta_low_quality_streak_days",
    "first_impression_share_7d_wtd",
    "cpc",
    "cpm",
    "cost_per_ctwa",
  ];
  const adsSheet = workbook.addWorksheet("Ads");
  adsSheet.addRow(adsHeader);
  for (const a of adsBreakdown) {
    adsSheet.addRow([
      a.metaAdId,
      a.adName ?? "",
      a.verdict,
      a.impressions,
      a.clicks,
      a.ctr ?? "",
      a.spend,
      a.paidAdSpend,
      a.ctwaSessions,
      a.metaMessagingConversationsStarted,
      a.metaPurchases,
      a.ordersCount,
      a.paidOrdersCount,
      a.pendingOrdersCount,
      a.convertedOrdersCount,
      a.convertedRevenue,
      a.grossProfitPaid,
      a.salesCommissionPaid,
      a.paidOperationalCosts,
      a.netProfitPaid,
      a.verdictDetail.cpaPaid ?? "",
      a.verdictDetail.profitRoas ?? "",
      a.verdictDetail.capiRate ?? "",
      a.metaWeeklyAvgFrequency ?? "",
      a.metaQualityScore7d ?? "",
      a.metaQualityLowStreakDays ?? "",
      a.metaFirstImpressionShare7d ?? "",
      a.cpc ?? "",
      a.cpm ?? "",
      a.costPerCtwa ?? "",
    ]);
  }

  const ordersHeader = [
    "order_id",
    "order_event_at",
    "status",
    "value_usd",
    "path",
    "meta_ad_id",
  ];
  const ordersSheet = workbook.addWorksheet("Orders");
  ordersSheet.addRow(ordersHeader);
  for (const o of attributedOrders) {
    ordersSheet.addRow([
      o.orderId,
      o.orderEventAt.toISOString(),
      o.status,
      o.valueUsd,
      o.path,
      o.metaAdId ?? "",
    ]);
  }

  const activitySheet = workbook.addWorksheet("Activity");
  activitySheet.addRow([
    "activity",
    "activity_details",
    "item_changed",
    "changed_by",
    "when_iso",
    "when_display",
  ]);
  for (const r of activityRows) {
    const presented = presentCampaignActivityRow({
      campaignId,
      campaignName: header.name,
      createdAtIso: r.createdAt.toISOString(),
      createdByEmail: r.createdByEmail,
      kind: r.kind,
      body: r.body,
      metadata: r.metadata ?? null,
    });
    activitySheet.addRow([
      presented.activity,
      presented.activityDetails,
      presented.itemChanged,
      presented.changedBy,
      presented.whenIso,
      formatActivityWhenForLocale(presented.whenIso),
    ]);
  }

  const buf = await workbook.xlsx.writeBuffer();
  const fname = `campaign-report_${safeId}_${parsedRange.sinceDay}_${parsedRange.untilDay}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
