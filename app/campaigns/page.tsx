import { parseCampaignRangeSearchParams } from "@/lib/campaign-insights-range";
import {
  getCampaignPerformanceRollups,
  getUnattributedOrderTotals,
  getUnlinkedCtwaOrderTotals,
  loadMetaCampaignTreeFromDb,
} from "@/lib/campaigns-rollups";

import { CampaignsClient } from "./campaigns-client";

export const dynamic = "force-dynamic";

type SearchParams = {
  range?: string;
  from?: string;
  to?: string;
  days?: string;
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const parsed = parseCampaignRangeSearchParams(sp);
  const [
    tree,
    performance,
    unattributed,
    unlinkedCtwaOrders,
  ] = await Promise.all([
    loadMetaCampaignTreeFromDb(),
    getCampaignPerformanceRollups(
      parsed.sinceIso,
      parsed.untilIso,
      parsed.sinceDay,
      parsed.untilDay,
    ),
    getUnattributedOrderTotals(parsed.sinceIso, parsed.untilIso),
    getUnlinkedCtwaOrderTotals(parsed.sinceIso, parsed.untilIso),
  ]);

  const totals = performance.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      ctwaSessions: acc.ctwaSessions + r.ctwaSessions,
      metaMessagingConversationsStarted:
        acc.metaMessagingConversationsStarted +
        r.metaMessagingConversationsStarted,
      ordersCount: acc.ordersCount + r.ordersCount,
      paidOrdersCount: acc.paidOrdersCount + r.paidOrdersCount,
      convertedOrdersCount: acc.convertedOrdersCount + r.convertedOrdersCount,
      metaPurchases: acc.metaPurchases + r.metaPurchases,
      convertedRevenue: acc.convertedRevenue + r.convertedRevenue,
      grossProfitPaid: acc.grossProfitPaid + r.grossProfitPaid,
      contributionProfit: acc.contributionProfit + r.contributionProfit,
    }),
    {
      spend: 0,
      ctwaSessions: 0,
      metaMessagingConversationsStarted: 0,
      ordersCount: 0,
      paidOrdersCount: 0,
      convertedOrdersCount: 0,
      metaPurchases: 0,
      convertedRevenue: 0,
      grossProfitPaid: 0,
      contributionProfit: 0,
    },
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Campaigns (Meta)
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          COD cockpit: <strong>app</strong> CTWA sessions and{" "}
          <strong>converted orders</strong> (paid + confirmed) drive attribution
          and P&amp;L for decisions. <strong>Meta</strong> messaging conversations
          and purchase counts come from Ads Insights{" "}
          <code className="bg-muted rounded px-1">actions</code> after &quot;Sync
          from Meta&quot;—use both for optimization. Tune{" "}
          <code className="bg-muted rounded px-1">CAMPAIGN_*</code> as needed.
        </p>
      </header>

      <CampaignsClient
        tree={tree}
        performance={performance}
        totals={totals}
        unattributed={unattributed}
        unlinkedCtwaOrders={unlinkedCtwaOrders}
        rangeLabel={parsed.label}
        selectValue={parsed.selectValue}
        isCustom={parsed.isCustom}
        sinceDay={parsed.sinceDay}
        untilDay={parsed.untilDay}
      />
    </div>
  );
}
