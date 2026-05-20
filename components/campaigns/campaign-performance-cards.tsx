"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import type { CampaignPerformanceRow } from "@/lib/campaigns-rollups";
import { APP_CURRENCY } from "@/lib/validations/order";
import { cn } from "@/lib/utils";

const moneyIntl = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: APP_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(n: number) {
  return moneyIntl.format(n);
}

function verdictBadgeClass(verdict: string): string {
  switch (verdict) {
    case "SCALE":
      return "border-emerald-600/40 bg-emerald-600/10 text-emerald-900 dark:text-emerald-100";
    case "KILL":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "OPTIMIZE":
      return "border-amber-600/40 bg-amber-600/10 text-amber-950 dark:text-amber-100";
    case "ATTRIBUTION_ISSUE":
      return "border-orange-600/40 bg-orange-600/10 text-orange-950 dark:text-orange-100";
    case "LEARNING":
      return "border-muted-foreground/40 text-muted-foreground";
    case "KEEP":
    default:
      return "border-border text-muted-foreground";
  }
}

export function CampaignPerformanceCards({
  rows,
  rankOffset,
}: {
  rows: CampaignPerformanceRow[];
  rankOffset: number;
}) {
  const searchParams = useSearchParams();

  return (
    <ul className="space-y-3 md:hidden" aria-label="Campaigns list">
      {rows.map((r, i) => {
        const title =
          r.campaignName?.trim() ||
          `Campaign ${r.metaCampaignId.slice(0, 8)}…`;
        const qs = searchParams.toString();
        const detailHref = `/campaigns/${encodeURIComponent(r.metaCampaignId)}${qs ? `?${qs}` : ""}`;

        return (
          <li key={r.metaCampaignId}>
            <Card className="gap-0 overflow-hidden py-0">
              <CardHeader className="border-b px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-muted-foreground text-xs tabular-nums">
                      #{rankOffset + i + 1}
                    </p>
                    <Link
                      href={detailHref}
                      className="block truncate text-sm font-semibold leading-snug hover:underline"
                      title={title}
                    >
                      {title}
                    </Link>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase",
                      verdictBadgeClass(r.verdict),
                    )}
                  >
                    {r.verdict}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Spend</p>
                  <p className="font-medium tabular-nums">{formatMoney(r.spend)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Revenue</p>
                  <p className="font-medium tabular-nums">
                    {formatMoney(r.convertedRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Orders</p>
                  <p className="font-medium tabular-nums">{r.ordersCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Net profit</p>
                  <p
                    className={cn(
                      "font-medium tabular-nums",
                      r.netProfitPaid < 0 ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {formatMoney(r.netProfitPaid)}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="border-t px-4 py-3">
                <Link
                  href={detailHref}
                  className="text-primary text-sm font-medium underline-offset-2 hover:underline"
                >
                  Open campaign detail
                </Link>
              </CardFooter>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
