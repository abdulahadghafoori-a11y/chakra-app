import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  computeCampaignOperationalWarnings,
  getCampaignAdBreakdown,
  getCampaignAttributionSplit,
  getCampaignDailyPerformanceForCampaign,
  getCampaignPerformanceSlice,
  listAttributedOrdersForCampaign,
  listCampaignActivityRows,
  loadCampaignMetaHeader,
  loadCampaignStructureSubtree,
  priorEqualUtcWindowBounds,
} from "@/lib/campaign-detail";
import {
  parseCampaignRangeSearchParams,
} from "@/lib/campaign-insights-range";
import {
  parseCampaignPnLFractions,
} from "@/lib/campaign-pnl-params";
import { getStaffSessionOptional } from "@/lib/staff-auth/guard";

import { CampaignDetailClient } from "./campaign-detail-client";

export const dynamic = "force-dynamic";

function sliceCampaignSearchParams(sp: Record<string, string | string[] | undefined>) {
  const pick = (k: string): string | undefined => {
    const v = sp[k];
    return typeof v === "string" ? v : undefined;
  };
  return {
    range: pick("range"),
    from: pick("from"),
    to: pick("to"),
    days: pick("days"),
    fee_pct: pick("fee_pct"),
    sales_pct: pick("sales_pct"),
  };
}

function buildListQueryString(
  sp: Record<string, string | string[] | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      for (const v of val) qs.append(key, v);
    } else if (val !== "") {
      qs.set(key, val);
    }
  }
  return qs.toString();
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getStaffSessionOptional();
  if (!session) redirect("/");

  const { campaignId } = await params;
  const rawSp = await searchParams;
  const listQueryString = buildListQueryString(rawSp);

  const header = await loadCampaignMetaHeader(campaignId);
  if (!header) notFound();

  const parsedRange = parseCampaignRangeSearchParams(
    sliceCampaignSearchParams(rawSp),
  );
  const pnlFractions = parseCampaignPnLFractions(
    sliceCampaignSearchParams(rawSp),
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
    subtree,
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
      250,
    ),
    listCampaignActivityRows(campaignId, 400, {
      metaMarketingApiOnly: true,
    }),
    getCampaignAttributionSplit(
      campaignId,
      parsedRange.sinceIso,
      parsedRange.untilIso,
    ),
    loadCampaignStructureSubtree(campaignId),
  ]);

  const warnings = computeCampaignOperationalWarnings(
    primaryPerformance,
    priorPerformance,
  );

  const subtreeSerialized = subtree.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    effectiveStatus: s.effectiveStatus,
    ads: s.ads.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      effectiveStatus: a.effectiveStatus,
    })),
  }));

  const activitySerialized = activityRows.map((r) => ({
    id: r.id,
    createdAtIso: r.createdAt.toISOString(),
    createdByEmail: r.createdByEmail,
    kind: r.kind,
    body: r.body,
    metadata: r.metadata ?? null,
  }));

  const ordersSerialized = attributedOrders.map((r) => ({
    orderId: r.orderId,
    orderEventAtIso: r.orderEventAt.toISOString(),
    status: r.status,
    valueUsd: r.valueUsd,
    path: r.path,
    metaAdId: r.metaAdId,
    buyerLatestCtwaSendAtIso:
      r.buyerLatestCtwaSendAt?.toISOString() ?? null,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link
          href={listQueryString ? `/campaigns?${listQueryString}` : "/campaigns"}
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          Campaigns
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate font-mono text-xs">{campaignId}</span>
      </div>

      <CampaignDetailClient
        campaignId={campaignId}
        campaignName={header.name}
        objective={header.objective}
        status={header.status}
        effectiveStatus={header.effectiveStatus}
        syncedAtIso={header.syncedAt.toISOString()}
        sinceDay={parsedRange.sinceDay}
        untilDay={parsedRange.untilDay}
        rangeLabel={parsedRange.label}
        rangeDisplayLabel={parsedRange.displayLabel}
        selectValue={parsedRange.selectValue}
        isCustom={parsedRange.isCustom}
        priorRangeLabel={`${prior.prevSinceDay} → ${prior.prevUntilDay}`}
        listQueryString={listQueryString}
        pnlFractions={pnlFractions}
        primaryPerformance={primaryPerformance}
        priorPerformance={priorPerformance}
        warnings={warnings}
        attributionSplit={attributionSplit}
        daily={daily}
        adsBreakdown={adsBreakdown}
        attributedOrders={ordersSerialized}
        activity={activitySerialized}
        subtree={subtreeSerialized}
      />
    </div>
  );
}
