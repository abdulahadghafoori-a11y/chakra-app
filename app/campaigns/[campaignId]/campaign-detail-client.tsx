"use client";

import Link from "next/link";

import { useMemo } from "react";

import { ClientTablePagination } from "@/components/client-table-pagination";
import { CampaignInsightsToolbar } from "@/components/campaign-insights-toolbar";
import { useClientTablePage } from "@/hooks/use-client-table-page";
import type {
  CampaignAdBreakdownRow,
  CampaignDailyPerformanceRow,
} from "@/lib/campaign-detail";
import {
  formatActivityWhenForLocale,
  presentCampaignActivityRow,
} from "@/lib/campaign-activity-present";
import type { CampaignPnLFractions } from "@/lib/campaign-pnl-params";
import type { CampaignPerformanceRow } from "@/lib/campaigns-rollups";
import type { CampaignVerdict } from "@/lib/campaign-verdict";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { APP_CURRENCY } from "@/lib/validations/order";

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

const moneyIntl = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: APP_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(n: number): string {
  return moneyIntl.format(n);
}

function pctFmt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function ratioTimes(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}×`;
}

function fmtMetaFreq(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

function fmtMetaQualityScore(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

type ActivityRow = {
  id: string;
  createdAtIso: string;
  createdByEmail: string;
  kind: string;
  body: string;
  metadata: Record<string, unknown> | null;
};

type SerializedOrder = {
  orderId: string;
  orderEventAtIso: string;
  status: string;
  valueUsd: string;
  path: "ctwa" | "manual";
  metaAdId: string | null;
  /** Latest CTWA referral send time for this buyer (same contact across sessions). */
  buyerLatestCtwaSendAtIso: string | null;
};

type SubtreeRow = {
  id: string;
  name: string | null;
  status: string | null;
  effectiveStatus: string | null;
  ads: Array<{
    id: string;
    name: string | null;
    status: string | null;
    effectiveStatus: string | null;
  }>;
};

type AttributionSplitProps = {
  ctwa: {
    ordersCount: number;
    convertedOrdersCount: number;
    convertedRevenue: number;
  };
  manual: {
    ordersCount: number;
    convertedOrdersCount: number;
    convertedRevenue: number;
  };
};

type CampaignDetailClientProps = {
  campaignId: string;
  campaignName: string | null;
  objective: string | null;
  status: string | null;
  effectiveStatus: string | null;
  syncedAtIso: string;
  sinceDay: string;
  untilDay: string;
  rangeLabel: string;
  rangeDisplayLabel: string;
  selectValue: string;
  isCustom: boolean;
  priorRangeLabel: string;
  listQueryString: string;
  pnlFractions: CampaignPnLFractions;
  primaryPerformance: CampaignPerformanceRow | null;
  priorPerformance: CampaignPerformanceRow | null;
  warnings: string[];
  attributionSplit: AttributionSplitProps;
  daily: CampaignDailyPerformanceRow[];
  adsBreakdown: CampaignAdBreakdownRow[];
  attributedOrders: SerializedOrder[];
  activity: ActivityRow[];
  subtree: SubtreeRow[];
};

export function CampaignDetailClient(props: CampaignDetailClientProps) {
  const exportHref = useMemo(() => {
    const base = `/campaigns/${encodeURIComponent(props.campaignId)}/export`;
    return props.listQueryString ? `${base}?${props.listQueryString}` : base;
  }, [props.campaignId, props.listQueryString]);

  const presentedActivity = useMemo(
    () =>
      props.activity.map((r) => {
        const p = presentCampaignActivityRow({
          campaignId: props.campaignId,
          campaignName: props.campaignName,
          createdAtIso: r.createdAtIso,
          createdByEmail: r.createdByEmail,
          kind: r.kind,
          body: r.body,
          metadata: r.metadata,
        });
        return {
          id: r.id,
          kind: r.kind,
          ...p,
          whenDisplay: formatActivityWhenForLocale(p.whenIso),
        };
      }),
    [props.activity, props.campaignId, props.campaignName],
  );

  const dailyPage = useClientTablePage(props.daily);
  const adsPage = useClientTablePage(props.adsBreakdown);
  const ordersPage = useClientTablePage(props.attributedOrders);
  const activityPage = useClientTablePage(presentedActivity);

  const title =
    props.campaignName?.trim() ||
    `Campaign ${props.campaignId.slice(0, 10)}…`;

  function perfMini(label: string, row: CampaignPerformanceRow | null) {
    if (!row) {
      return (
        <div className="text-muted-foreground text-sm">
          No rollup for <span className="font-medium">{label}</span>.
        </div>
      );
    }
    return (
      <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-muted-foreground text-[11px] uppercase">Spend</p>
          <p className="tabular-nums">{formatMoney(row.spend)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[11px] uppercase">
            Conv. revenue
          </p>
          <p className="tabular-nums">{formatMoney(row.convertedRevenue)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[11px] uppercase">
            Net profit
          </p>
          <p className="tabular-nums">{formatMoney(row.netProfitPaid)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-[11px] uppercase">
            Verdict
          </p>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-semibold uppercase",
              verdictBadgeClass(row.verdict),
            )}
          >
            {row.verdict}
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <CampaignInsightsToolbar
        pathnameBase={`/campaigns/${props.campaignId}`}
        sinceDay={props.sinceDay}
        untilDay={props.untilDay}
        rangeLabel={props.rangeLabel}
        rangeDisplayLabel={props.rangeDisplayLabel}
        selectValue={props.selectValue}
        isCustom={props.isCustom}
        pnlFractions={props.pnlFractions}
        idSuffix="detail"
      />

      <header className="space-y-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
              Economics match the Campaigns list via the toolbar above. Prior comparison{" "}
              <span className="font-mono text-xs">{props.priorRangeLabel}</span>.
            </p>
          </div>
          <a
            href={exportHref}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "inline-flex shrink-0 touch-manipulation items-center justify-center rounded-md px-4 py-2 text-sm font-medium",
            )}
          >
            Export XLSX workbook
          </a>
        </div>

        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Meta entity</CardTitle>
            <CardDescription className="font-mono text-xs break-all">
              {props.campaignId}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">
                Objective
              </p>
              <p>{props.objective?.trim() || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">
                Status
              </p>
              <p>{props.status?.trim() || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">
                Effective
              </p>
              <p>{props.effectiveStatus?.trim() || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">
                Structure synced
              </p>
              <p className="text-xs">{props.syncedAtIso}</p>
            </div>
          </CardContent>
        </Card>
      </header>

      {props.warnings.length ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">
              Operational warnings
            </CardTitle>
            <CardDescription>
              Heuristic checks vs spend, conversions, and prior CTR (large impression
              volumes only).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm">
              {props.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Primary window</CardTitle>
          </CardHeader>
          <CardContent>{perfMini("primary", props.primaryPerformance)}</CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Prior equal-length window</CardTitle>
          </CardHeader>
          <CardContent>{perfMini("prior", props.priorPerformance)}</CardContent>
        </Card>
      </section>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Attribution split</CardTitle>
          <CardDescription>
            Orders in this UTC window attributed via WhatsApp CTWA vs manual Meta
            campaign pick (no CTWA session).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              CTWA → Meta ad
            </p>
            <p className="mt-2 text-lg font-semibold tabular-nums">
              {formatMoney(props.attributionSplit.ctwa.convertedRevenue)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {props.attributionSplit.ctwa.convertedOrdersCount} converted ·{" "}
              {props.attributionSplit.ctwa.ordersCount} total orders
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Manual campaign
            </p>
            <p className="mt-2 text-lg font-semibold tabular-nums">
              {formatMoney(props.attributionSplit.manual.convertedRevenue)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {props.attributionSplit.manual.convertedOrdersCount} converted ·{" "}
              {props.attributionSplit.manual.ordersCount} total orders
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Daily performance (UTC)</CardTitle>
          <CardDescription>
            Merged Meta Insights rows with app economics (converted revenue uses paid +
            confirmed).
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Impr.</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Conv. rev.</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Freq*</TableHead>
                <TableHead className="text-right">Qual*</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyPage.pageRows.map((d) => (
                <TableRow key={d.day}>
                  <TableCell className="font-mono text-xs">{d.day}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(d.spend)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.impressions}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.clicks}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.ctr != null ? pctFmt(d.ctr) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(d.convertedRevenue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(d.dailyNetProfit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {d.weightedFrequency != null
                      ? d.weightedFrequency.toFixed(2)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {d.weightedQualityScore != null
                      ? d.weightedQualityScore.toFixed(2)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-2 text-[11px]">
            * Frequency / quality are impression-weighted within each UTC day from synced{" "}
            <code className="text-[10px]">ad_insights_daily</code>.
          </p>
          <ClientTablePagination
            page={dailyPage.page}
            pageCount={dailyPage.pageCount}
            total={dailyPage.total}
            itemLabel="days"
            onPageChange={dailyPage.setPage}
            className="mt-3"
          />
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Ads breakdown</CardTitle>
          <CardDescription>
            Same P&amp;L and cockpit columns as the campaigns table, rolled up per ad (CTWA
            orders only—manual campaign attribution has no ad id).
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {props.adsBreakdown.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[11rem]">Ad</TableHead>
                <TableHead className="text-right whitespace-nowrap">Verdict</TableHead>
                <TableHead className="text-right">Impr.</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">
                  <span className="block">Spend</span>
                  <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                    Insights
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="block">Payable ads</span>
                  <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                    × fee
                  </span>
                </TableHead>
                <TableHead className="text-right">CTWA</TableHead>
                <TableHead className="text-right">
                  <span className="block">Messaging</span>
                  <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                    Insights
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="block">Converted</span>
                  <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                    / Meta
                  </span>
                </TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Conv. rev.</TableHead>
                <TableHead className="text-right">Gross profit</TableHead>
                <TableHead className="text-right">Sales comm.</TableHead>
                <TableHead className="text-right">Delivery</TableHead>
                <TableHead className="text-right">Net profit</TableHead>
                <TableHead className="text-right">CPA</TableHead>
                <TableHead className="text-right">Profit ROAS</TableHead>
                <TableHead className="text-right">CAPI</TableHead>
                <TableHead className="text-right">
                  <span className="block">Meta freq</span>
                  <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                    7d wtd
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="block">Meta quality</span>
                  <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                    7d · 0–1
                  </span>
                </TableHead>
                <TableHead className="text-right">Low Q streak</TableHead>
                <TableHead className="text-right">
                  <span className="block">1st impr.</span>
                  <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                    7d wtd
                  </span>
                </TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">CPM</TableHead>
                <TableHead className="text-right">$/ CTWA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adsPage.pageRows.map((a) => (
                <TableRow key={a.metaAdId}>
                  <TableCell className="max-w-[14rem] align-top">
                    <div className="truncate text-sm font-medium">
                      {a.adName?.trim() || `Ad ${a.metaAdId.slice(0, 8)}…`}
                    </div>
                    <div className="text-muted-foreground font-mono text-[10px] break-all">
                      {a.metaAdId}
                    </div>
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <Badge
                      variant="outline"
                      className={cn(
                        "px-1.5 py-0 text-[10px] font-semibold uppercase",
                        verdictBadgeClass(a.verdict),
                      )}
                    >
                      {a.verdict}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {a.impressions}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {a.clicks}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {pctFmt(a.ctr)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {formatMoney(a.spend)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs font-medium align-top">
                    {formatMoney(a.paidAdSpend)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {a.ctwaSessions}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums text-xs align-top">
                    {a.metaMessagingConversationsStarted}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <div className="flex flex-col items-end gap-0.5 text-[11px] tabular-nums">
                      <span title="Converted orders (paid + confirmed)">
                        {a.convertedOrdersCount} conv.
                      </span>
                      <span className="text-muted-foreground font-normal">
                        ({a.paidOrdersCount} paid · {a.confirmedOrdersCount}{" "}
                        conf.)
                      </span>
                      <span
                        className="text-muted-foreground"
                        title="Meta purchase actions from Insights"
                      >
                        {a.metaPurchases} Insights
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {a.pendingOrdersCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {formatMoney(a.convertedRevenue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {formatMoney(a.grossProfitPaid)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums text-xs align-top">
                    −{formatMoney(a.salesCommissionPaid)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums text-xs align-top">
                    −{formatMoney(a.paidOperationalCosts)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums text-xs align-top",
                      a.netProfitPaid < 0 && "text-destructive",
                    )}
                  >
                    {formatMoney(a.netProfitPaid)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {a.verdictDetail.cpaPaid == null
                      ? "—"
                      : formatMoney(a.verdictDetail.cpaPaid)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {ratioTimes(a.verdictDetail.profitRoas)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {pctFmt(a.verdictDetail.capiRate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums text-xs align-top">
                    {fmtMetaFreq(a.metaWeeklyAvgFrequency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums text-xs align-top">
                    {fmtMetaQualityScore(a.metaQualityScore7d)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums text-xs align-top">
                    {a.metaQualityLowStreakDays ?? "—"}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground text-right tabular-nums text-xs align-top"
                    title="Requires first_time_impression_ratio on insight rows."
                  >
                    {pctFmt(a.metaFirstImpressionShare7d)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {a.cpc == null ? "—" : formatMoney(a.cpc)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {a.cpm == null ? "—" : formatMoney(a.cpm)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {a.costPerCtwa == null ? "—" : formatMoney(a.costPerCtwa)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          ) : (
            <p className="text-muted-foreground text-sm">
              No ad-level Insights in this window yet.
            </p>
          )}
          {adsPage.total > 0 ? (
            <ClientTablePagination
              page={adsPage.page}
              pageCount={adsPage.pageCount}
              total={adsPage.total}
              itemLabel="ads"
              onPageChange={adsPage.setPage}
              className="mt-3"
            />
          ) : null}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Attributed orders</CardTitle>
          <CardDescription>
            Newest first. “Last buyer CTWA” is the latest WhatsApp referral
            timestamp for this customer across CTWA sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Path</TableHead>
                <TableHead className="whitespace-nowrap">
                  Last buyer CTWA
                </TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordersPage.pageRows.map((o) => (
                <TableRow key={o.orderId}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/orders/${encodeURIComponent(o.orderId)}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {o.orderId}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{o.orderEventAtIso}</TableCell>
                  <TableCell className="text-xs uppercase">{o.path}</TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {o.buyerLatestCtwaSendAtIso ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatMoney(Number(o.valueUsd))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ClientTablePagination
            page={ordersPage.page}
            pageCount={ordersPage.pageCount}
            total={ordersPage.total}
            itemLabel="orders"
            onPageChange={ordersPage.setPage}
            className="mt-3"
          />
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Structure</CardTitle>
          <CardDescription>
            Last synced ad sets and ads stored for this campaign id.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {props.subtree.map((s) => (
            <div key={s.id} className="rounded-lg border p-4">
              <p className="font-medium">{s.name?.trim() || `Ad set ${s.id}`}</p>
              <p className="text-muted-foreground font-mono text-[11px] break-all">
                {s.id}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {s.ads.map((ad) => (
                  <li key={ad.id} className="flex flex-wrap gap-x-2">
                    <span className="font-mono text-[11px]">{ad.id}</span>
                    <span>{ad.name?.trim() || "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!props.subtree.length ? (
            <p className="text-muted-foreground text-sm">
              No ad sets in the database for this campaign yet—use Sync from Meta above.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
          <CardDescription>
            Read-only Marketing API activity synced from Meta (budget, statuses, delivery,
            targeting summaries). Internal notes and other activity types are not shown
            here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[560px] overflow-auto rounded-lg border">
            {presentedActivity.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[10rem]">Activity</TableHead>
                    <TableHead className="min-w-[12rem]">
                      Activity details
                    </TableHead>
                    <TableHead className="min-w-[12rem]">Item changed</TableHead>
                    <TableHead className="min-w-[8rem]">Changed by</TableHead>
                    <TableHead className="min-w-[9rem] whitespace-nowrap">
                      Date and time
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityPage.pageRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="align-top text-sm">
                        <span className="font-medium">{row.activity}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground align-top text-xs whitespace-pre-wrap">
                        {row.activityDetails}
                      </TableCell>
                      <TableCell className="align-top text-xs whitespace-pre-wrap">
                        {row.itemChanged}
                      </TableCell>
                      <TableCell className="align-top text-xs">{row.changedBy}</TableCell>
                      <TableCell className="text-muted-foreground align-top text-xs whitespace-nowrap">
                        {row.whenDisplay}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground p-4 text-sm">
                No Meta activity in range yet—sync from Meta above.
              </p>
            )}
          </div>
          {activityPage.total > 0 ? (
            <ClientTablePagination
              page={activityPage.page}
              pageCount={activityPage.pageCount}
              total={activityPage.total}
              itemLabel="events"
              onPageChange={activityPage.setPage}
              className="mt-3"
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
