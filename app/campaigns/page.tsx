import { redirect } from "next/navigation";

import {
  filterCampaignPerformance,
  paginateCampaignPerformance,
  parseCampaignVerdictFilter,
} from "@/lib/campaigns-list-page";
import { parseCampaignPnLFractions } from "@/lib/campaign-pnl-params";
import { parseCampaignRangeSearchParams } from "@/lib/campaign-insights-range";
import {
  getCampaignPerformanceRollups,
  getUnattributedOrderTotals,
  getUnlinkedCtwaOrderTotals,
} from "@/lib/campaigns-rollups";
import { parseTablePage } from "@/lib/table-pagination";
import { APP_CURRENCY } from "@/lib/validations/order";

import { CampaignsClient } from "./campaigns-client";

export const dynamic = "force-dynamic";

type SearchParams = {
  range?: string;
  from?: string;
  to?: string;
  days?: string;
  fee_pct?: string;
  sales_pct?: string;
  page?: string;
  verdict?: string;
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const parsed = parseCampaignRangeSearchParams(sp);
  const pnlFractions = parseCampaignPnLFractions(sp);
  const verdictFilter = parseCampaignVerdictFilter(sp.verdict);
  const requestedPage = parseTablePage(sp.page);
  const [
    performance,
    unattributed,
    unlinkedCtwaOrders,
  ] = await Promise.all([
    getCampaignPerformanceRollups(
      parsed.sinceIso,
      parsed.untilIso,
      parsed.sinceDay,
      parsed.untilDay,
      pnlFractions,
    ),
    getUnattributedOrderTotals(parsed.sinceIso, parsed.untilIso),
    getUnlinkedCtwaOrderTotals(parsed.sinceIso, parsed.untilIso),
  ]);

  const filteredPerformance = filterCampaignPerformance(
    performance,
    verdictFilter,
  );
  const campaignsPage = paginateCampaignPerformance(
    filteredPerformance,
    requestedPage,
  );
  if (campaignsPage.total > 0 && requestedPage !== campaignsPage.page) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v != null && v !== "" && k !== "page") p.set(k, v);
    }
    p.set("page", String(campaignsPage.page));
    redirect(`/campaigns?${p.toString()}`);
  }

  const totals = performance.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      paidAdSpend: acc.paidAdSpend + r.paidAdSpend,
      cardSurchargeAmount: acc.cardSurchargeAmount + r.cardSurchargeAmount,
      salesCommissionPaid:
        acc.salesCommissionPaid + r.salesCommissionPaid,
      paidOperationalCosts: acc.paidOperationalCosts + r.paidOperationalCosts,
      ctwaSessions: acc.ctwaSessions + r.ctwaSessions,
      metaMessagingConversationsStarted:
        acc.metaMessagingConversationsStarted +
        r.metaMessagingConversationsStarted,
      ordersCount: acc.ordersCount + r.ordersCount,
      paidOrdersCount: acc.paidOrdersCount + r.paidOrdersCount,
      confirmedOrdersCount:
        acc.confirmedOrdersCount + r.confirmedOrdersCount,
      shippedOrdersCount: acc.shippedOrdersCount + r.shippedOrdersCount,
      convertedOrdersCount: acc.convertedOrdersCount + r.convertedOrdersCount,
      metaPurchases: acc.metaPurchases + r.metaPurchases,
      convertedRevenue: acc.convertedRevenue + r.convertedRevenue,
      grossProfitPaid: acc.grossProfitPaid + r.grossProfitPaid,
      netProfitPaid: acc.netProfitPaid + r.netProfitPaid,
      preFeeContribution: acc.preFeeContribution + r.preFeeContribution,
    }),
    {
      spend: 0,
      paidAdSpend: 0,
      cardSurchargeAmount: 0,
      salesCommissionPaid: 0,
      paidOperationalCosts: 0,
      ctwaSessions: 0,
      metaMessagingConversationsStarted: 0,
      ordersCount: 0,
      paidOrdersCount: 0,
      confirmedOrdersCount: 0,
      shippedOrdersCount: 0,
      convertedOrdersCount: 0,
      metaPurchases: 0,
      convertedRevenue: 0,
      grossProfitPaid: 0,
      netProfitPaid: 0,
      preFeeContribution: 0,
    },
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 py-6 sm:px-4 sm:py-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Campaigns (Meta)
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          COD cockpit: <strong>app</strong> CTWA sessions and attributed{" "}
          <strong>orders</strong> (pending, confirmed, shipped, paid — not
          cancelled or returned) for volume; <strong>fulfilled</strong> (paid or
          confirmed/shipped — same COD step) drives revenue and P&amp;L. Money uses{" "}
          <strong>{APP_CURRENCY}</strong> (
          <code className="bg-muted rounded px-1">APP_CURRENCY</code>). Set{" "}
          <strong>card surcharge</strong> on Meta Insights spend (<code className="bg-muted rounded px-1">
            fee_pct
          </code>
          ; default +3%) and{" "}
          <strong>sales commission</strong> on converted revenue (
          <code className="bg-muted rounded px-1">sales_pct</code>, default 2%).{" "}
          <strong>Net profit</strong> is gross profit (converted revenue −
          COGS) minus payable Meta ads (with card fee), sales commission, and per-order delivery cost (
          <code className="bg-muted rounded px-1">orders.delivery_cost</code>); verdicts use that net. After syncing insights, open{" "}
          <strong>Columns</strong> to show Meta <strong>freq</strong>,{" "}
          <strong>quality</strong>, and related 7-day signals (from{" "}
          <code className="bg-muted rounded px-1">ad_insights_daily</code>). Tune{" "}
          <code className="bg-muted rounded px-1">CAMPAIGN_*</code>{" "}
          as needed.
        </p>
      </header>

      <CampaignsClient
        performanceCount={performance.length}
        campaignRows={campaignsPage.pageRows}
        campaignPage={campaignsPage.page}
        campaignPageCount={campaignsPage.pageCount}
        campaignTotal={campaignsPage.total}
        campaignRankOffset={campaignsPage.rankOffset}
        verdictFilter={verdictFilter}
        totals={totals}
        unattributed={unattributed}
        unlinkedCtwaOrders={unlinkedCtwaOrders}
        rangeLabel={parsed.label}
        rangeDisplayLabel={parsed.displayLabel}
        selectValue={parsed.selectValue}
        isCustom={parsed.isCustom}
        sinceDay={parsed.sinceDay}
        untilDay={parsed.untilDay}
        pnlFractions={pnlFractions}
      />
    </div>
  );
}
