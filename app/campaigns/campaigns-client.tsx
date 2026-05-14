"use client";

import { ChevronDown, ChevronRight, Columns3 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  clampCampaignCardFeePercent,
  clampCampaignSalesCommissionPercent,
  type CampaignPnLFractions,
} from "@/lib/campaign-pnl-params";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CAMPAIGN_TABLE_COLUMNS,
  CAMPAIGN_TABLE_COLUMNS_STORAGE_KEY,
  defaultCampaignTableVisibility,
  type CampaignTableColumnId,
} from "@/lib/campaign-table-columns";
import {
  CAMPAIGN_RANGE_PRESETS,
  daysBetweenInclusive,
  isValidUtcDateOnly,
  type CampaignRangePresetId,
} from "@/lib/campaign-insights-range";
import type { CampaignVerdict } from "@/lib/campaign-verdict";
import type {
  CampaignPerformanceRow,
  MetaCampaignTreeCampaign,
} from "@/lib/campaigns-rollups";
import { cn } from "@/lib/utils";
import { APP_CURRENCY } from "@/lib/validations/order";

import { loadMetaCampaignTreeAction, syncCampaignsFromMetaAction } from "./actions";

type Totals = {
  spend: number;
  paidAdSpend: number;
  cardSurchargeAmount: number;
  salesCommissionPaid: number;
  /** Sum of `orders.delivery_cost` on converted orders, attributed to campaigns in this window. */
  paidOperationalCosts: number;
  ctwaSessions: number;
  metaMessagingConversationsStarted: number;
  ordersCount: number;
  paidOrdersCount: number;
  convertedOrdersCount: number;
  metaPurchases: number;
  convertedRevenue: number;
  grossProfitPaid: number;
  netProfitPaid: number;
  preFeeContribution: number;
};

type GapTotals = {
  ordersCount: number;
  revenue: number;
};

type Props = {
  performance: CampaignPerformanceRow[];
  totals: Totals;
  unattributed: GapTotals;
  unlinkedCtwaOrders: GapTotals;
  rangeLabel: string;
  /** Readable label, e.g. "Last 7 days". */
  rangeDisplayLabel: string;
  selectValue: string;
  isCustom: boolean;
  sinceDay: string;
  untilDay: string;
  pnlFractions: CampaignPnLFractions;
};

/** App P&amp;L and campaign spend comparisons use configured store currency (Meta Insights spend is billed in account currency — usually aligned). */
const moneyIntl = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: APP_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(n: number) {
  return moneyIntl.format(n);
}

function pct(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

/** ROAS-like ratios displayed as multiples (not currency). */
function ratioTimes(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}×`;
}

function fmtMetaFreq(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

function fmtMetaQualityScore(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

type VerdictFilter = CampaignVerdict | "ALL";

function metaEffectiveStatusBadgeClass(status: string | null): string {
  const s = status?.toUpperCase() ?? "";
  if (s === "ACTIVE") {
    return "border-emerald-600/40 bg-emerald-600/10 text-emerald-900 dark:text-emerald-100";
  }
  if (
    s === "PAUSED" ||
    s === "ARCHIVED" ||
    s === "DELETED" ||
    s === "CAMPAIGN_PAUSED"
  ) {
    return "border-muted-foreground/50 bg-muted/40 text-muted-foreground";
  }
  return "border-border text-muted-foreground";
}

function suggestedAction(v: CampaignVerdict): string {
  switch (v) {
    case "SCALE":
      return "Raise budget gradually while watching CPA per converted order (payable ad spend after card fee) and gross-profit ROAS on that spend.";
    case "KEEP":
      return "Maintain spend; gather more converted orders or lengthen the window before scaling.";
    case "OPTIMIZE":
      return "Keep the campaign live but fix creative, offer, WhatsApp flow, or COD confirmation.";
    case "KILL":
      return "Pause or reduce spend; this window shows unprofitable net after payable ads, sales commission, and delivery costs—or zero converted orders.";
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
  performance,
  totals,
  unattributed,
  unlinkedCtwaOrders,
  rangeLabel,
  rangeDisplayLabel,
  selectValue,
  isCustom,
  sinceDay,
  untilDay,
  pnlFractions,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [draftFrom, setDraftFrom] = useState(sinceDay);
  const [draftTo, setDraftTo] = useState(untilDay);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("ALL");
  const [feeDraft, setFeeDraft] = useState(
    () => String(pnlFractions.cardFeePercent),
  );
  const [salesDraft, setSalesDraft] = useState(() =>
    String(pnlFractions.salesCommissionPercentOfConvertedRevenue),
  );
  const [structureTree, setStructureTree] = useState<
    MetaCampaignTreeCampaign[] | null
  >(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<
    Record<CampaignTableColumnId, boolean>
  >(() => {
    if (typeof window === "undefined") {
      return defaultCampaignTableVisibility();
    }
    try {
      const raw = localStorage.getItem(CAMPAIGN_TABLE_COLUMNS_STORAGE_KEY);
      if (!raw) return defaultCampaignTableVisibility();
      const parsed = JSON.parse(raw) as Partial<
        Record<CampaignTableColumnId, boolean>
      >;
      return { ...defaultCampaignTableVisibility(), ...parsed };
    } catch {
      return defaultCampaignTableVisibility();
    }
  });

  const visibleDataColumnCount = useMemo(
    () =>
      CAMPAIGN_TABLE_COLUMNS.filter((c) => columnVisibility[c.id] !== false)
        .length,
    [columnVisibility],
  );

  const tableColSpan = 2 + visibleDataColumnCount;

  const col = (id: CampaignTableColumnId) => columnVisibility[id] !== false;

  useEffect(() => {
    try {
      localStorage.setItem(
        CAMPAIGN_TABLE_COLUMNS_STORAGE_KEY,
        JSON.stringify(columnVisibility),
      );
    } catch {
      /* ignore */
    }
  }, [columnVisibility]);

  const toggleTableColumn = (id: CampaignTableColumnId) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [id]: !(prev[id] !== false),
    }));
  };

  const filteredPerformance = useMemo(() => {
    if (verdictFilter === "ALL") return performance;
    return performance.filter((r) => r.verdict === verdictFilter);
  }, [performance, verdictFilter]);

  useEffect(() => {
    setDraftFrom(sinceDay);
    setDraftTo(untilDay);
  }, [sinceDay, untilDay]);

  useEffect(() => {
    setFeeDraft(String(pnlFractions.cardFeePercent));
    setSalesDraft(
      String(pnlFractions.salesCommissionPercentOfConvertedRevenue),
    );
  }, [pnlFractions]);

  const refresh = () => router.refresh();

  const replaceCampaignQuery = (params: URLSearchParams) => {
    const q = params.toString();
    router.replace(q ? `/campaigns?${q}` : "/campaigns", { scroll: false });
  };

  const campaignParamsBlankRange = (): URLSearchParams => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("from");
    p.delete("to");
    p.delete("days");
    p.delete("range");
    return p;
  };

  const commitCardFeePct = (rawPct: number) => {
    const next = clampCampaignCardFeePercent(rawPct);
    setFeeDraft(String(next));
    const p = new URLSearchParams(searchParams.toString());
    p.set("fee_pct", String(next));
    replaceCampaignQuery(p);
  };

  const commitSalesCommissionPct = (rawPct: number) => {
    const next = clampCampaignSalesCommissionPercent(rawPct);
    setSalesDraft(String(next));
    const p = new URLSearchParams(searchParams.toString());
    p.set("sales_pct", String(next));
    replaceCampaignQuery(p);
  };

  const onFeeBlur = () => {
    const parsed = Number.parseFloat(feeDraft.replace(",", "."));
    commitCardFeePct(
      Number.isFinite(parsed) ? parsed : pnlFractions.cardFeePercent,
    );
  };

  const onSalesBlur = () => {
    const parsed = Number.parseFloat(salesDraft.replace(",", "."));
    commitSalesCommissionPct(
      Number.isFinite(parsed)
        ? parsed
        : pnlFractions.salesCommissionPercentOfConvertedRevenue,
    );
  };

  const pushRangeUrl = (params: URLSearchParams) => {
    replaceCampaignQuery(params);
  };

  const applyPresetRange = (id: CampaignRangePresetId) => {
    const params = campaignParamsBlankRange();
    params.set("range", id);
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
    const params = campaignParamsBlankRange();
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

  const onLoadCampaignStructure = () => {
    setStructureLoading(true);
    startTransition(async () => {
      try {
        const t = await loadMetaCampaignTreeAction();
        setStructureTree(t);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setStructureLoading(false);
      }
    });
  };

  const hasGaps =
    unattributed.ordersCount > 0 || unlinkedCtwaOrders.ordersCount > 0;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Active range
              </p>
              <p className="text-foreground text-sm leading-snug">
                <span className="font-semibold">{rangeDisplayLabel}</span>
                <span className="text-muted-foreground ml-2 font-normal tabular-nums">
                  {rangeLabel} UTC
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                disabled={pending}
                onClick={onSyncFromMeta}
              >
                Sync from Meta
              </Button>
              <p className="text-muted-foreground max-w-md text-xs lg:pb-0.5">
                Syncs account structure and ad-level spend into this window.
                Orders and CTWA use the same UTC dates.
              </p>
            </div>
          </div>

          <div>
            <p className="text-muted-foreground mb-1.5 text-xs">Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {CAMPAIGN_RANGE_PRESETS.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant={selectValue === p.id ? "default" : "outline"}
                  className="h-8"
                  onClick={() => applyPresetRange(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div
            className={cn(
              "border-border bg-muted/30 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-end",
              isCustom && "ring-2 ring-primary/35",
            )}
          >
            <div className="w-full text-xs font-medium">Custom UTC range</div>
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
              Apply custom dates
            </Button>
          </div>
        </div>

        <div className="border-border bg-muted/20 flex flex-col gap-4 rounded-lg border px-3 py-3 sm:flex-row sm:flex-wrap sm:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="campaign-card-fee" className="text-xs font-medium">
              Card fee on Meta spend (%)
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="campaign-card-fee"
                inputMode="decimal"
                min={0}
                step={0.1}
                className="h-9 w-24"
                value={feeDraft}
                onChange={(e) => setFeeDraft(e.target.value)}
                onBlur={() => void onFeeBlur()}
              />
              <div className="flex flex-wrap gap-1">
                {[0, 2, 3, 4, 5].map((pctPreset) => (
                  <Button
                    key={pctPreset}
                    type="button"
                    size="sm"
                    variant={
                      Math.abs(
                        (Number.parseFloat(feeDraft) || 0) - pctPreset,
                      ) < 0.01
                        ? "default"
                        : "outline"
                    }
                    className="h-8 px-2.5 text-xs"
                    onClick={() => commitCardFeePct(pctPreset)}
                  >
                    {pctPreset}%
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-muted-foreground max-w-lg text-[11px] leading-snug">
              Payable ad cost = Insights spend × (1 + fee ÷ 100). Applies to CPC,
              CPM, CTWA cost, ROAS, CPA, verdicts on net profit (except kill when
              only Insights spend is cited).
            </p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="campaign-sales-pct" className="text-xs font-medium">
              Sales commission (% of converted revenue)
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="campaign-sales-pct"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.1}
                className="h-9 w-24"
                value={salesDraft}
                onChange={(e) => setSalesDraft(e.target.value)}
                onBlur={() => void onSalesBlur()}
              />
              <div className="flex flex-wrap gap-1">
                {[0, 1, 2, 3, 5, 10].map((pctPreset) => (
                  <Button
                    key={pctPreset}
                    type="button"
                    size="sm"
                    variant={
                      Math.abs(
                        (Number.parseFloat(salesDraft) || 0) - pctPreset,
                      ) < 0.01
                        ? "default"
                        : "outline"
                    }
                    className="h-8 px-2.5 text-xs"
                    onClick={() => commitSalesCommissionPct(pctPreset)}
                  >
                    {pctPreset}%
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-muted-foreground max-w-lg text-[11px] leading-snug">
              Deducted from gross profit (revenue − COGS on converted orders). Default
              2% when <code className="bg-muted rounded px-1 text-[10px]">
                sales_pct
              </code> is omitted. URL:&nbsp;
              <code className="bg-muted rounded px-1 text-[10px]">fee_pct</code>,{" "}
              <code className="bg-muted rounded px-1 text-[10px]">sales_pct</code>.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Spend (Meta Insights)</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {formatMoney(totals.spend)}
            </CardTitle>
            <div className="border-border mt-3 border-t pt-2">
              <CardDescription className="text-[11px]">
                Payable ads (+{pnlFractions.cardFeePercent}% fee)
              </CardDescription>
              <CardTitle className="mt-1 text-lg tabular-nums">
                {formatMoney(totals.paidAdSpend)}
              </CardTitle>
            </div>
            <p className="text-muted-foreground mt-1 text-[10px] font-normal uppercase tracking-wide">
              {APP_CURRENCY}
            </p>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>CTWA sessions (app)</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {totals.ctwaSessions}
            </CardTitle>
            <p className="text-muted-foreground text-xs font-normal leading-snug">
              Only clicks with CTWA tied to this campaign—not the same as Meta&apos;s{" "}
              &quot;messaging started&quot;.
            </p>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Messaging started (Meta Insights)</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {totals.metaMessagingConversationsStarted}
            </CardTitle>
            <p className="text-muted-foreground text-xs font-normal leading-snug">
              From Ads Insights <code className="bg-muted rounded px-1 text-[11px]">actions</code>—Meta&apos;s
              attribution; do not stack against CTWA as one funnel metric.
            </p>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Orders / purchases</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {totals.convertedOrdersCount}{" "}
              <span className="text-muted-foreground text-sm font-normal">
                paid + confirmed
              </span>
            </CardTitle>
            <p className="text-muted-foreground text-xs font-normal leading-snug">
              Paid only: {totals.paidOrdersCount} · Attrib. orders:{" "}
              {totals.ordersCount} · Meta purchases (Insights, diagnostic only):{" "}
              {totals.metaPurchases}
            </p>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Converted revenue</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {formatMoney(totals.convertedRevenue)}
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-[10px] font-normal uppercase tracking-wide">
              {APP_CURRENCY}
            </p>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Gross profit</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {formatMoney(totals.grossProfitPaid)}
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-[11px] font-normal leading-snug">
              Converted revenue − COGS ({APP_CURRENCY}).
            </p>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>
              Sales commission (
              {pnlFractions.salesCommissionPercentOfConvertedRevenue}% of conv.
              rev.)
            </CardDescription>
            <CardTitle className="text-lg tabular-nums">
              −{formatMoney(totals.salesCommissionPaid)}
            </CardTitle>
            <p className="text-muted-foreground text-xs font-normal leading-snug">
              Off converted revenue in this UTC window ({APP_CURRENCY}).
            </p>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Delivery cost</CardDescription>
            <CardTitle className="text-lg tabular-nums text-muted-foreground">
              −{formatMoney(totals.paidOperationalCosts)}
            </CardTitle>
            <p className="text-muted-foreground text-xs font-normal leading-snug">
              Sum of per-order delivery on paid + confirmed orders (
              <code className="text-[10px]">delivery_cost</code>, {APP_CURRENCY}
              ).
            </p>
          </CardHeader>
        </Card>
        <Card className="py-3">
          <CardHeader className="px-4 pb-1 pt-0">
            <CardDescription>Net profit</CardDescription>
            <CardTitle
              className={cn(
                "text-lg tabular-nums",
                totals.netProfitPaid < 0 && "text-destructive",
              )}
            >
              {formatMoney(totals.netProfitPaid)}
            </CardTitle>
            <p className="text-muted-foreground text-[11px] font-normal leading-snug">
              Gross − payable ads − commission − delivery ({APP_CURRENCY}).
            </p>
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
              {unattributed.ordersCount} orders ({formatMoney(unattributed.revenue)}{" "}
              revenue) with no CTWA session and no manual campaign link—assign from the
              order detail page.{" "}
            </span>
          ) : null}
          {unlinkedCtwaOrders.ordersCount > 0 ? (
            <span>
              {unlinkedCtwaOrders.ordersCount} orders (
              {formatMoney(unlinkedCtwaOrders.revenue)} revenue) with CTWA but no{" "}
              <code className="text-xs">meta_ad_id</code>.{" "}
            </span>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Campaign decisions (COD)</CardTitle>
            <CardDescription>
              Campaigns with spend, CTWA, attributed orders, or synced Meta Insights
              in this UTC window — <strong>ACTIVE</strong> and{" "}
              <strong>inactive</strong> (Meta{" "}
              <code className="bg-muted rounded px-1">effective_status</code>).{" "}
              <strong>
                SCALE / KEEP / OPTIMIZE / KILL
              </strong>{" "}
              use app-attributed orders and CTWA,{" "}
              <strong>payable ad spend (Insights + card fee)</strong>,{" "}
              <strong>sales commission (% of converted revenue)</strong>,{" "}
              <strong>delivery cost (per-order)</strong>, and{" "}
              <strong>net profit</strong> (money in <strong>{APP_CURRENCY}</strong>
              ). Ads Insights messaging and purchase counts are <em>never</em> inputs
              to those verdicts (orders often lack CTWA or CAPI). Range (UTC):{" "}
              {rangeLabel}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
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
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-9 gap-2",
                )}
              >
                <Columns3 className="size-4" />
                Columns
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {CAMPAIGN_TABLE_COLUMNS.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={columnVisibility[c.id] !== false}
                      onCheckedChange={() => toggleTableColumn(c.id)}
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {performance.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing to show for this range: no spend, CTWA sessions, attributed
              orders, or synced Ads Insights rows tied to a campaign id.
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
                  {col("spend") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Spend</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      Insights · {APP_CURRENCY}
                    </span>
                  </TableHead>
                  ) : null}
                  {col("paidAds") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Payable ads</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      +{pnlFractions.cardFeePercent}%
                    </span>
                  </TableHead>
                  ) : null}
                  {col("ctwa") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">CTWA sessions</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      app attribution
                    </span>
                  </TableHead>
                  ) : null}
                  {col("messaging") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Messaging started</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      Meta Insights
                    </span>
                  </TableHead>
                  ) : null}
                  {col("converted") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Converted / Meta</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      paid + conf · Meta purch. diag.
                    </span>
                  </TableHead>
                  ) : null}
                  {col("pending") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Pending</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      orders
                    </span>
                  </TableHead>
                  ) : null}
                  {col("convRevenue") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Converted revenue</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      {APP_CURRENCY}
                    </span>
                  </TableHead>
                  ) : null}
                  {col("gross") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Gross profit</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      rev − COGS
                    </span>
                  </TableHead>
                  ) : null}
                  {col("salesComm") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Sales comm.</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      −{APP_CURRENCY}
                    </span>
                  </TableHead>
                  ) : null}
                  {col("delivery") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Delivery cost</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      −{APP_CURRENCY} · paid + conf.
                    </span>
                  </TableHead>
                  ) : null}
                  {col("net") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Net profit</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      after ads, comm., delivery
                    </span>
                  </TableHead>
                  ) : null}
                  {col("cpa") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">CPA</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      per conv. · payable
                    </span>
                  </TableHead>
                  ) : null}
                  {col("roas") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Profit ROAS</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      g. profit ÷ payable
                    </span>
                  </TableHead>
                  ) : null}
                  {col("capi") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">CAPI</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      attrib. orders
                    </span>
                  </TableHead>
                  ) : null}
                  {col("metaFreq") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Meta freq</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      7d · impression-wtd
                    </span>
                  </TableHead>
                  ) : null}
                  {col("metaQuality") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Meta quality</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      rank 0–1 · 7d wtd
                    </span>
                  </TableHead>
                  ) : null}
                  {col("metaQStreak") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">Low Q streak</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      UTC days · cockpit
                    </span>
                  </TableHead>
                  ) : null}
                  {col("metaFirstImpr") ? (
                  <TableHead className="text-right">
                    <span className="block leading-tight">1st impr. share</span>
                    <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                      7d wtd · if in DB
                    </span>
                  </TableHead>
                  ) : null}
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
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "px-1.5 py-0 text-[10px] font-semibold uppercase",
                                  metaEffectiveStatusBadgeClass(
                                    r.campaignEffectiveStatus,
                                  ),
                                )}
                              >
                                {r.campaignEffectiveStatus?.trim() || "—"}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "px-1.5 py-0 text-[10px] font-semibold uppercase",
                                  verdictBadgeClass(r.verdict),
                                )}
                              >
                                {r.verdict}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        {col("spend") ? (
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatMoney(r.spend)}
                        </TableCell>
                        ) : null}
                        {col("paidAds") ? (
                        <TableCell className="text-right text-sm tabular-nums font-medium">
                          {formatMoney(r.paidAdSpend)}
                        </TableCell>
                        ) : null}
                        {col("ctwa") ? (
                        <TableCell className="text-right text-sm tabular-nums">
                          {r.ctwaSessions}
                        </TableCell>
                        ) : null}
                        {col("messaging") ? (
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {r.metaMessagingConversationsStarted}
                        </TableCell>
                        ) : null}
                        {col("converted") ? (
                        <TableCell className="text-right align-top">
                          <div className="flex flex-col items-end gap-0.5 text-xs tabular-nums">
                            <span title="Converted orders (paid + confirmed)">
                              {r.convertedOrdersCount} conv.
                            </span>
                            <span className="text-muted-foreground font-normal">
                              ({r.paidOrdersCount} paid ·{" "}
                              {r.confirmedOrdersCount} conf.)
                            </span>
                            <span
                              className="text-muted-foreground"
                              title="Meta purchase actions from Insights—not used for campaign verdict."
                            >
                              {r.metaPurchases} Insights
                            </span>
                          </div>
                        </TableCell>
                        ) : null}
                        {col("pending") ? (
                        <TableCell className="text-right text-sm tabular-nums">
                          {r.pendingOrdersCount}
                        </TableCell>
                        ) : null}
                        {col("convRevenue") ? (
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatMoney(r.convertedRevenue)}
                        </TableCell>
                        ) : null}
                        {col("gross") ? (
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatMoney(r.grossProfitPaid)}
                        </TableCell>
                        ) : null}
                        {col("salesComm") ? (
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          −{formatMoney(r.salesCommissionPaid)}
                        </TableCell>
                        ) : null}
                        {col("delivery") ? (
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          −{formatMoney(r.paidOperationalCosts)}
                        </TableCell>
                        ) : null}
                        {col("net") ? (
                        <TableCell
                          className={cn(
                            "text-right text-sm tabular-nums",
                            r.netProfitPaid < 0 && "text-destructive",
                          )}
                        >
                          {formatMoney(r.netProfitPaid)}
                        </TableCell>
                        ) : null}
                        {col("cpa") ? (
                        <TableCell className="text-right text-sm tabular-nums">
                          {r.verdictDetail.cpaPaid == null
                            ? "—"
                            : formatMoney(r.verdictDetail.cpaPaid)}
                        </TableCell>
                        ) : null}
                        {col("roas") ? (
                        <TableCell className="text-right text-sm tabular-nums">
                          {ratioTimes(r.verdictDetail.profitRoas)}
                        </TableCell>
                        ) : null}
                        {col("capi") ? (
                        <TableCell className="text-right text-sm tabular-nums">
                          {pct(r.verdictDetail.capiRate)}
                        </TableCell>
                        ) : null}
                        {col("metaFreq") ? (
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {fmtMetaFreq(r.metaWeeklyAvgFrequency)}
                        </TableCell>
                        ) : null}
                        {col("metaQuality") ? (
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {fmtMetaQualityScore(r.metaQualityScore7d)}
                        </TableCell>
                        ) : null}
                        {col("metaQStreak") ? (
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {r.metaQualityLowStreakDays == null
                            ? "—"
                            : r.metaQualityLowStreakDays}
                        </TableCell>
                        ) : null}
                        {col("metaFirstImpr") ? (
                        <TableCell
                          className="text-right text-sm tabular-nums text-muted-foreground"
                          title="Requires first_time_impression_ratio in ad_insights_daily (not from standard Insights fields API today)."
                        >
                          {pct(r.metaFirstImpressionShare7d)}
                        </TableCell>
                        ) : null}
                      </TableRow>
                      {open ? (
                        <TableRow>
                          <TableCell colSpan={tableColSpan} className="bg-muted/30">
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
                                <span>
                                  Meta freq (7d wtd):{" "}
                                  {fmtMetaFreq(r.metaWeeklyAvgFrequency)}
                                </span>
                                <span>
                                  Meta quality (7d wtd, 0–1):{" "}
                                  {fmtMetaQualityScore(r.metaQualityScore7d)}
                                </span>
                                <span>
                                  Low-quality streak (days):{" "}
                                  {r.metaQualityLowStreakDays ?? "—"}
                                </span>
                                <span title="Populated only if first_time_impression_ratio exists on insight rows.">
                                  First impr. share (7d):{" "}
                                  {pct(r.metaFirstImpressionShare7d)}
                                </span>
                                <span title="Stored per ad-day in Postgres after sync.">
                                  Insights: CTR{" "}
                                  {r.ctr == null ? "—" : pct(r.ctr)}
                                  {r.impressions > 0
                                    ? ` · ${r.impressions.toLocaleString()} impr.`
                                    : ""}
                                </span>
                              </div>
                              <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                <span>Attrib. orders: {r.ordersCount}</span>
                                <span
                                  title="Attributed orders divided by Meta messaging starts—different definitions; not a funnel conversion rate."
                                >
                                  Attrib. orders / Meta messaging:{" "}
                                  {pct(
                                    r.verdictDetail.orderConvFromMetaMessaging,
                                  )}{" "}
                                  <span className="text-[10px] opacity-80">
                                    (diagnostic only)
                                  </span>
                                </span>
                                <span
                                  title="Meta Insights purchase count divided by app converted orders—never used for SCALE/KILL verdicts."
                                >
                                  Meta purchases / converted:{" "}
                                  {ratioTimes(
                                    r.verdictDetail.metaPurchasesPerPaidOrder,
                                  )}{" "}
                                  <span className="text-[10px] opacity-80">
                                    (Insights only)
                                  </span>
                                </span>
                                <span>
                                  Payable spend / Meta messaging:{" "}
                                  {r.metaMessagingConversationsStarted > 0
                                    ? formatMoney(
                                        r.paidAdSpend /
                                          r.metaMessagingConversationsStarted,
                                      )
                                    : "—"}
                                </span>
                                <span>
                                  Spend per CTWA:{" "}
                                  {r.costPerCtwa == null
                                    ? "—"
                                    : formatMoney(r.costPerCtwa)}
                                </span>
                                <span>
                                  Card surcharge:{" "}
                                  {formatMoney(r.cardSurchargeAmount)}
                                </span>
                                <span>
                                  Pre-fee surplus (gross − Insights):{" "}
                                  {formatMoney(r.preFeeContribution)}
                                </span>
                                <span>
                                  Sales commission:{" "}
                                  {formatMoney(r.salesCommissionPaid)}
                                </span>
                                <span>
                                  Orders / CTWA:{" "}
                                  {pct(r.verdictDetail.orderConvFromCtwa)}
                                </span>
                                <span>
                                  Net ROAS:{" "}
                                  {ratioTimes(r.contributionRoas)}
                                </span>
                                <span>
                                  Impr.: {r.impressions.toLocaleString()}
                                </span>
                                <span>Clicks: {r.clicks.toLocaleString()}</span>
                                <span>CTR: {pct(r.ctr)}</span>
                                <span>
                                  CPC: {r.cpc == null ? "—" : formatMoney(r.cpc)}
                                </span>
                                <span>
                                  CPM: {r.cpm == null ? "—" : formatMoney(r.cpm)}
                                </span>
                                <span>
                                  Delivery cost (in net):{" "}
                                  {formatMoney(
                                    r.verdictDetail.convertedDeliveryCost,
                                  )}
                                </span>
                                <span>
                                  Confirmed: {r.confirmedOrdersCount}
                                </span>
                                <span>Shipped: {r.shippedOrdersCount}</span>
                                <span>
                                  Cancelled: {r.cancelledOrdersCount}
                                </span>
                                <span>Returned: {r.returnedOrdersCount}</span>
                                <span>
                                  Conv. / CTWA:{" "}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Campaigns, ad sets, and ads</CardTitle>
              <CardDescription>
                Local copy last updated per row; use Sync from Meta to refresh.
                Load structure on demand—full tree is not fetched with this page.
              </CardDescription>
            </div>
            {structureTree === null ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={structureLoading}
                onClick={onLoadCampaignStructure}
              >
                {structureLoading ? "Loading…" : "Load all campaigns"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {structureTree === null ? (
            <p className="text-muted-foreground text-sm">
              Campaign hierarchy is not loaded. Use{" "}
              <span className="font-medium text-foreground">Load all campaigns</span>{" "}
              above to fetch ad sets and ads from the database.
            </p>
          ) : structureTree.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No structure rows in the database yet. Click Sync from Meta to
              ingest your account.
            </p>
          ) : (
            structureTree.map((c) => (
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
