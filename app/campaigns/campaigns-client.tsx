"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CAMPAIGN_RANGE_PRESETS,
  CUSTOM_RANGE_SELECT_VALUE,
  daysBetweenInclusive,
  isValidUtcDateOnly,
  legacyDaysSelectLabel,
} from "@/lib/campaign-insights-range";
import type { CampaignVerdict } from "@/lib/campaign-verdict";
import type {
  CampaignPerformanceRow,
  MetaCampaignTreeCampaign,
} from "@/lib/campaigns-rollups";
import { cn } from "@/lib/utils";

import { syncCampaignsFromMetaAction } from "./actions";

type Totals = {
  spend: number;
  ctwaSessions: number;
  metaMessagingConversationsStarted: number;
  ordersCount: number;
  paidOrdersCount: number;
  metaPurchases: number;
  paidRevenue: number;
  grossProfitPaid: number;
  contributionProfit: number;
};

type GapTotals = {
  ordersCount: number;
  revenue: number;
};

type Props = {
  tree: MetaCampaignTreeCampaign[];
  performance: CampaignPerformanceRow[];
  totals: Totals;
  unattributed: GapTotals;
  unlinkedCtwaOrders: GapTotals;
  rangeLabel: string;
  selectValue: string;
  isCustom: boolean;
  sinceDay: string;
  untilDay: string;
};

function money(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

type VerdictFilter = CampaignVerdict | "ALL";

function suggestedAction(v: CampaignVerdict): string {
  switch (v) {
    case "SCALE":
      return "Raise budget gradually while watching CPA per paid order and profit ROAS.";
    case "KEEP":
      return "Maintain spend; gather more paid orders or lengthen the window before scaling.";
    case "OPTIMIZE":
      return "Keep the campaign live but fix creative, offer, WhatsApp flow, or COD confirmation.";
    case "KILL":
      return "Pause or reduce spend; this window shows unprofitable or zero-collection COD.";
    case "LEARNING":
      return "Let it run—too little CTWA or spend to judge; avoid big budget moves.";
    case "ATTRIBUTION_ISSUE":
      return "Fix CTWA → ad attribution or date range before trusting this row’s metrics.";
    default:
      return "Review metrics and thresholds.";
  }
}

function verdictBadgeClass(v: CampaignVerdict): string {
  switch (v) {
    case "SCALE":
      return "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200 border-emerald-600/30";
    case "KILL":
      return "bg-destructive/15 text-destructive border-destructive/40";
    case "OPTIMIZE":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/35";
    case "ATTRIBUTION_ISSUE":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "LEARNING":
      return "border-muted-foreground/40 text-muted-foreground";
    case "KEEP":
    default:
      return "border-border text-muted-foreground";
  }
}

export function CampaignsClient({
  tree,
  performance,
  totals,
  unattributed,
  unlinkedCtwaOrders,
  rangeLabel,
  selectValue,
  isCustom,
  sinceDay,
  untilDay,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draftFrom, setDraftFrom] = useState(sinceDay);
  const [draftTo, setDraftTo] = useState(untilDay);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("ALL");

  const filteredPerformance = useMemo(() => {
    if (verdictFilter === "ALL") return performance;
    return performance.filter((r) => r.verdict === verdictFilter);
  }, [performance, verdictFilter]);

  useEffect(() => {
    setDraftFrom(sinceDay);
    setDraftTo(untilDay);
  }, [sinceDay, untilDay]);

  const refresh = () => router.refresh();

  const pushRangeUrl = (params: URLSearchParams) => {
    const q = params.toString();
    router.replace(q ? `/campaigns?${q}` : "/campaigns", { scroll: false });
  };

  const onRangeSelectChange = (v: string | null) => {
    if (!v) return;
    if (v === CUSTOM_RANGE_SELECT_VALUE) {
      const params = new URLSearchParams();
      params.set("from", sinceDay);
      params.set("to", untilDay);
      pushRangeUrl(params);
      return;
    }
    if (v.startsWith("days:")) {
      const params = new URLSearchParams();
      params.set("days", v.slice("days:".length));
      pushRangeUrl(params);
      return;
    }
    const params = new URLSearchParams();
    params.set("range", v);
    pushRangeUrl(params);
  };

  const onApplyCustomDates = () => {
    const from = draftFrom.trim();
    const to = draftTo.trim();
    if (
      !isValidUtcDateOnly(from) ||
      !isValidUtcDateOnly(to) ||
      from > to
    ) {
      toast.error("Use valid UTC dates (YYYY-MM-DD) with start ≤ end.");
      return;
    }
    if (daysBetweenInclusive(from, to) > 90) {
      toast.error("Range cannot exceed 90 days.");
      return;
    }
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    pushRangeUrl(params);
  };

  const onSyncFromMeta = () => {
    startTransition(async () => {
      try {
        const { structure, insights } = await syncCampaignsFromMetaAction(
          sinceDay,
          untilDay,
        );
        const errLines = [...structure.errors, ...insights.errors];
        const summary = [
          `${structure.campaigns} campaigns, ${structure.adSets} ad sets, ${structure.ads} ads`,
          `${insights.rowsUpserted} insight rows (${rangeLabel})`,
        ].join(" · ");

        if (errLines.length) {
          toast.message("Sync finished with issues", {
            description: `${errLines.slice(0, 3).join("; ")}${errLines.length > 3 ? "…" : ""} — ${summary}`,
          });
        } else {
          toast.success("Synced from Meta", { description: summary });
        }
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Sync failed");
      }
    });
  };

  const showLegacyRolling =
    selectValue.startsWith("days:") &&
    !Number.isNaN(Number.parseInt(selectValue.slice("days:".length), 10));

  const hasGaps =
    unattributed.ordersCount > 0 || unlinkedCtwaOrders.ordersCount > 0;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaigns-range-preset" className="text-xs">
              Date range (UTC)
            </Label>
            <Select value={selectValue} onValueChange={onRangeSelectChange}>
              <SelectTrigger
                id="campaigns-range-preset"
                size="sm"
                className="h-9 w-[220px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_RANGE_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_RANGE_SELECT_VALUE}>
                  Custom range…
                </SelectItem>
                {showLegacyRolling ? (
                  <SelectItem value={selectValue}>
                    {legacyDaysSelectLabel(
                      Number.parseInt(
                        selectValue.slice("days:".length),
                        10,
                      ),
                    )}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" disabled={pending} onClick={onSyncFromMeta}>
            Sync from Meta
          </Button>
          <p className="text-muted-foreground max-w-xl text-xs lg:pb-0.5">
            Syncs account structure and ad-level spend into this window. Orders
            and CTWA use the same UTC dates.
          </p>
        </div>

        {isCustom ? (
          <div className="border-border bg-muted/30 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaigns-from" className="text-xs">
                From
              </Label>
              <Input
                id="campaigns-from"
                type="date"
                className="h-9 w-[10.5rem]"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaigns-to" className="text-xs">
                To
              </Label>
              <Input
                id="campaigns-to"
                type="date"
                className="h-9 w-[10.5rem]"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onApplyCustomDates}
            >
              Apply dates
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Spend</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {money(totals.spend)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Conversations</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {totals.ctwaSessions}{" "}
              <span className="text-muted-foreground text-sm font-normal">
                app CTWA
              </span>
            </CardTitle>
            <p className="text-muted-foreground text-xs font-normal leading-snug">
              Meta messaging started (insights):{" "}
              {totals.metaMessagingConversationsStarted}
            </p>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Orders / purchases</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {totals.paidOrdersCount}{" "}
              <span className="text-muted-foreground text-sm font-normal">
                paid (app)
              </span>
            </CardTitle>
            <p className="text-muted-foreground text-xs font-normal leading-snug">
              Attrib. orders: {totals.ordersCount} · Meta purchases (insights):{" "}
              {totals.metaPurchases}
            </p>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Paid revenue</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {money(totals.paidRevenue)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Gross profit (paid)</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {money(totals.grossProfitPaid)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Contribution</CardDescription>
            <CardTitle
              className={cn(
                "text-lg tabular-nums",
                totals.contributionProfit < 0 && "text-destructive",
              )}
            >
              {money(totals.contributionProfit)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {hasGaps ? (
        <div className="border-destructive/40 bg-destructive/5 text-destructive-foreground rounded-lg border px-3 py-2 text-sm">
          <span className="font-medium text-destructive">
            Attribution gaps in this window:
          </span>{" "}
          {unattributed.ordersCount > 0 ? (
            <span>
              {unattributed.ordersCount} orders ({money(unattributed.revenue)}{" "}
              revenue) without CTWA session.{" "}
            </span>
          ) : null}
          {unlinkedCtwaOrders.ordersCount > 0 ? (
            <span>
              {unlinkedCtwaOrders.ordersCount} orders (
              {money(unlinkedCtwaOrders.revenue)} revenue) with CTWA but no{" "}
              <code className="text-xs">meta_ad_id</code>.{" "}
            </span>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Campaign decisions (COD)</CardTitle>
            <CardDescription>
              ACTIVE campaigns only when Meta status is known.{" "}
              <strong>App</strong> figures drive P&amp;L; <strong>Meta</strong>{" "}
              columns come from Ads Insights <code className="bg-muted rounded px-1">actions</code>{" "}
              after sync. Range (UTC): {rangeLabel}.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-1.5 sm:w-52">
            <Label htmlFor="verdict-filter" className="text-xs">
              Filter by verdict
            </Label>
            <Select
              value={verdictFilter}
              onValueChange={(v) => setVerdictFilter(v as VerdictFilter)}
            >
              <SelectTrigger id="verdict-filter" size="sm" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All verdicts</SelectItem>
                <SelectItem value="SCALE">SCALE</SelectItem>
                <SelectItem value="KEEP">KEEP</SelectItem>
                <SelectItem value="OPTIMIZE">OPTIMIZE</SelectItem>
                <SelectItem value="KILL">KILL</SelectItem>
                <SelectItem value="LEARNING">LEARNING</SelectItem>
                <SelectItem value="ATTRIBUTION_ISSUE">
                  ATTRIBUTION_ISSUE
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {performance.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing to show for this range: either there is no activity, or
              spend/orders belong only to paused or archived campaigns (those are
              hidden when Meta reports a non-ACTIVE{" "}
              <code className="bg-muted rounded px-1">effective_status</code>
              ). Sync from Meta if data looks stale.
            </p>
          ) : filteredPerformance.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No campaigns match this verdict filter. Choose &quot;All verdicts&quot;
              or another option.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9" />
                  <TableHead className="min-w-[10rem] max-w-[18rem]">
                    Campaign
                  </TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">
                    <span className="block leading-tight">Conversations</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      app · Meta
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="block leading-tight">Paid / Meta</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      app · insights
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Gross profit</TableHead>
                  <TableHead className="text-right">Contribution</TableHead>
                  <TableHead className="text-right">CPA</TableHead>
                  <TableHead className="text-right">Profit ROAS</TableHead>
                  <TableHead className="text-right">CAPI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPerformance.map((r) => {
                  const open = expandedId === r.metaCampaignId;
                  const title =
                    r.campaignName?.trim() ||
                    `Campaign ${r.metaCampaignId.slice(0, 8)}…`;
                  return (
                    <Fragment key={r.metaCampaignId}>
                      <TableRow>
                        <TableCell className="p-0.5 align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            aria-expanded={open}
                            aria-label={open ? "Collapse row" : "Expand row"}
                            onClick={() =>
                              setExpandedId(open ? null : r.metaCampaignId)
                            }
                          >
                            {open ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="min-w-[10rem] max-w-[18rem] align-top">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-sm font-semibold leading-snug"
                                title={title}
                              >
                                {title}
                              </div>
                              {!r.campaignName?.trim() ? (
                                <p className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
                                  Sync from Meta if the name is missing.
                                </p>
                              ) : null}
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "mt-0.5 shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase",
                                verdictBadgeClass(r.verdict),
                              )}
                            >
                              {r.verdict}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {money(r.spend)}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="flex flex-col items-end gap-0.5 text-xs tabular-nums">
                            <span title="App CTWA sessions">
                              {r.ctwaSessions}{" "}
                              <span className="text-muted-foreground font-normal">
                                app
                              </span>
                            </span>
                            <span
                              className="text-muted-foreground"
                              title="Meta messaging conversations started (insights)"
                            >
                              {r.metaMessagingConversationsStarted} Meta
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="flex flex-col items-end gap-0.5 text-xs tabular-nums">
                            <span title="App paid orders (cash collected)">
                              {r.paidOrdersCount} paid
                            </span>
                            <span
                              className="text-muted-foreground"
                              title="Meta purchase actions (insights)"
                            >
                              {r.metaPurchases} Meta
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {r.pendingOrdersCount}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {money(r.paidRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {money(r.grossProfitPaid)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-sm tabular-nums",
                            r.contributionProfit < 0 && "text-destructive",
                          )}
                        >
                          {money(r.contributionProfit)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {r.verdictDetail.cpaPaid == null
                            ? "—"
                            : money(r.verdictDetail.cpaPaid)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {r.verdictDetail.profitRoas == null
                            ? "—"
                            : money(r.verdictDetail.profitRoas)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {pct(r.verdictDetail.capiRate)}
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow>
                          <TableCell colSpan={12} className="bg-muted/30">
                            <div className="space-y-3 py-2 text-sm">
                              <div className="text-muted-foreground font-mono text-xs">
                                ID: {r.metaCampaignId}
                              </div>
                              <p className="text-muted-foreground text-xs">
                                Confidence:{" "}
                                <span className="text-foreground font-medium">
                                  {r.verdictDetail.confidence}
                                </span>
                              </p>
                              <div>
                                <span className="font-medium">Why:</span>
                                <ul className="mt-1 list-disc space-y-1 pl-5">
                                  {r.verdictReasons.map((x, i) => (
                                    <li key={`${x.code}-${i}`}>{x.message}</li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <span className="font-medium">
                                  Suggested action:
                                </span>
                                <p className="text-muted-foreground mt-1">
                                  {suggestedAction(r.verdict)}
                                </p>
                              </div>
                              <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                <span>Attrib. orders: {r.ordersCount}</span>
                                <span>
                                  Orders / Meta msg:{" "}
                                  {pct(r.verdictDetail.orderConvFromMetaMessaging)}
                                </span>
                                <span>
                                  Meta purch. / paid:{" "}
                                  {r.verdictDetail.metaPurchasesPerPaidOrder ==
                                  null
                                    ? "—"
                                    : money(
                                        r.verdictDetail.metaPurchasesPerPaidOrder,
                                      )}
                                </span>
                                <span>
                                  Spend / Meta msg:{" "}
                                  {r.metaMessagingConversationsStarted > 0
                                    ? money(
                                        r.spend / r.metaMessagingConversationsStarted,
                                      )
                                    : "—"}
                                </span>
                                <span>
                                  $ / CTWA:{" "}
                                  {r.costPerCtwa == null
                                    ? "—"
                                    : money(r.costPerCtwa)}
                                </span>
                                <span>
                                  Orders / CTWA:{" "}
                                  {pct(r.verdictDetail.orderConvFromCtwa)}
                                </span>
                                <span>
                                  Contrib. ROAS:{" "}
                                  {r.contributionRoas == null
                                    ? "—"
                                    : money(r.contributionRoas)}
                                </span>
                                <span>
                                  Impr.: {r.impressions.toLocaleString()}
                                </span>
                                <span>Clicks: {r.clicks.toLocaleString()}</span>
                                <span>CTR: {pct(r.ctr)}</span>
                                <span>
                                  CPC: {r.cpc == null ? "—" : money(r.cpc)}
                                </span>
                                <span>
                                  CPM: {r.cpm == null ? "—" : money(r.cpm)}
                                </span>
                                {r.paidOperationalCosts > 0 ? (
                                  <span>
                                    Ops costs (paid):{" "}
                                    {money(r.paidOperationalCosts)}
                                  </span>
                                ) : null}
                                <span>
                                  Confirmed: {r.confirmedOrdersCount}
                                </span>
                                <span>Shipped: {r.shippedOrdersCount}</span>
                                <span>
                                  Cancelled: {r.cancelledOrdersCount}
                                </span>
                                <span>Returned: {r.returnedOrdersCount}</span>
                                <span>
                                  Paid conv.:{" "}
                                  {pct(r.verdictDetail.paidConvFromCtwa)}
                                </span>
                                <span>
                                  Pending rev. share:{" "}
                                  {pct(r.verdictDetail.pendingRevenueShare)}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaigns, ad sets, and ads</CardTitle>
          <CardDescription>
            Local copy last updated per row; use Sync from Meta to refresh.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tree.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No rows yet. Click Sync from Meta.
            </p>
          ) : (
            tree.map((c) => (
              <details
                key={c.id}
                className="border-border rounded-lg border px-3 py-2"
              >
                <summary className="cursor-pointer list-none font-semibold">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {c.name ?? "(unnamed campaign)"}
                    <Badge variant="outline" className="font-mono text-xs">
                      {c.id}
                    </Badge>
                    {c.effectiveStatus ? (
                      <Badge variant="secondary">{c.effectiveStatus}</Badge>
                    ) : null}
                    {c.objective ? (
                      <span className="text-muted-foreground text-xs font-normal">
                        {c.objective}
                      </span>
                    ) : null}
                  </span>
                </summary>
                <div className="mt-3 space-y-2 pl-2">
                  {c.adSets.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No ad sets.</p>
                  ) : (
                    c.adSets.map((s) => (
                      <details
                        key={s.id}
                        className="bg-muted/40 rounded-md border px-2 py-2"
                      >
                        <summary className="cursor-pointer text-sm font-medium">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {s.name ?? "(unnamed ad set)"}
                            <Badge variant="outline" className="font-mono text-xs">
                              {s.id}
                            </Badge>
                            {s.effectiveStatus ? (
                              <Badge variant="secondary">{s.effectiveStatus}</Badge>
                            ) : null}
                          </span>
                        </summary>
                        <ul className="mt-2 list-none space-y-1 pl-2">
                          {s.ads.length === 0 ? (
                            <li className="text-muted-foreground text-xs">
                              No ads.
                            </li>
                          ) : (
                            s.ads.map((ad) => (
                              <li
                                key={ad.id}
                                className="border-border flex flex-wrap items-start gap-2 border-b py-2 text-sm last:border-0"
                              >
                                <span>{ad.name ?? "(unnamed ad)"}</span>
                                <Badge variant="outline" className="font-mono text-xs">
                                  {ad.id}
                                </Badge>
                                {ad.effectiveStatus ? (
                                  <Badge variant="secondary">
                                    {ad.effectiveStatus}
                                  </Badge>
                                ) : null}
                              </li>
                            ))
                          )}
                        </ul>
                      </details>
                    ))
                  )}
                </div>
              </details>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
