"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { syncCampaignsFromMetaAction } from "@/app/campaigns/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CAMPAIGN_RANGE_PRESETS,
  daysBetweenInclusive,
  isValidUtcDateOnly,
  type CampaignRangePresetId,
} from "@/lib/campaign-insights-range";
import {
  clampCampaignCardFeePercent,
  clampCampaignSalesCommissionPercent,
  type CampaignPnLFractions,
} from "@/lib/campaign-pnl-params";
import { cn } from "@/lib/utils";
import { APP_CURRENCY } from "@/lib/validations/order";

export type CampaignInsightsToolbarProps = {
  /** Path without query, e.g. `/campaigns` or `/campaigns/120…` */
  pathnameBase: string;
  sinceDay: string;
  untilDay: string;
  rangeLabel: string;
  rangeDisplayLabel: string;
  selectValue: string;
  isCustom: boolean;
  pnlFractions: CampaignPnLFractions;
  /** Disambiguate input `id`s when two toolbars could exist (should be one). */
  idSuffix?: string;
};

export function CampaignInsightsToolbar({
  pathnameBase,
  sinceDay,
  untilDay,
  rangeLabel,
  rangeDisplayLabel,
  selectValue,
  isCustom,
  pnlFractions,
  idSuffix = "",
}: CampaignInsightsToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [draftFrom, setDraftFrom] = useState(sinceDay);
  const [draftTo, setDraftTo] = useState(untilDay);
  const [feeDraft, setFeeDraft] = useState(
    () => String(pnlFractions.cardFeePercent),
  );
  const [salesDraft, setSalesDraft] = useState(() =>
    String(pnlFractions.salesCommissionPercentOfConvertedRevenue),
  );

  const sid = (s: string) => (idSuffix ? `${s}-${idSuffix}` : s);

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

  const replaceQuery = (params: URLSearchParams) => {
    const q = params.toString();
    router.replace(q ? `${pathnameBase}?${q}` : pathnameBase, { scroll: false });
  };

  const paramsBlankRange = (): URLSearchParams => {
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
    replaceQuery(p);
  };

  const commitSalesCommissionPct = (rawPct: number) => {
    const next = clampCampaignSalesCommissionPercent(rawPct);
    setSalesDraft(String(next));
    const p = new URLSearchParams(searchParams.toString());
    p.set("sales_pct", String(next));
    replaceQuery(p);
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

  const applyPresetRange = (id: CampaignRangePresetId) => {
    const params = paramsBlankRange();
    params.set("range", id);
    replaceQuery(params);
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
    const params = paramsBlankRange();
    params.set("from", from);
    params.set("to", to);
    replaceQuery(params);
  };

  const onSyncFromMeta = () => {
    startTransition(async () => {
      try {
        const { structure, insights } = await syncCampaignsFromMetaAction(
          sinceDay,
          untilDay,
        );
        const errLines = [...structure.errors, ...insights.errors];
        const structureParts = [
          `${structure.campaigns} campaigns, ${structure.adSets} ad sets, ${structure.ads} ads`,
        ];
        if (structure.marketingActivitiesFetched > 0) {
          structureParts.push(
            `${structure.marketingActivitiesInserted} new Marketing API activities (${structure.marketingActivitiesFetched} fetched)`,
          );
        }
        const summary = [
          structureParts.join("; "),
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

  return (
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
            <Button type="button" disabled={pending} onClick={onSyncFromMeta}>
              Sync from Meta
            </Button>
            <p className="text-muted-foreground max-w-md text-xs lg:pb-0.5">
              Syncs account structure and ad-level spend into this window. Orders and
              CTWA use the same UTC dates.
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
            <Label htmlFor={sid("campaign-from")} className="text-xs">
              From
            </Label>
            <Input
              id={sid("campaign-from")}
              type="date"
              className="h-9 w-[10.5rem]"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={sid("campaign-to")} className="text-xs">
              To
            </Label>
            <Input
              id={sid("campaign-to")}
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
          <Label htmlFor={sid("campaign-card-fee")} className="text-xs font-medium">
            Card fee on Meta spend (%)
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={sid("campaign-card-fee")}
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
                    Math.abs((Number.parseFloat(feeDraft) || 0) - pctPreset) < 0.01
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
            Payable ad cost = Insights spend × (1 + fee ÷ 100). Applies to cockpit net
            profit and daily series. Currency: {APP_CURRENCY}.
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor={sid("campaign-sales-pct")} className="text-xs font-medium">
            Sales commission (% of converted revenue)
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={sid("campaign-sales-pct")}
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
                    Math.abs((Number.parseFloat(salesDraft) || 0) - pctPreset) < 0.01
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
            Deducted from gross profit on converted orders. URL:{" "}
            <code className="bg-muted rounded px-1 text-[10px]">sales_pct</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
