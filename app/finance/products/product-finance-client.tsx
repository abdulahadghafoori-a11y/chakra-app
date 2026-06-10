"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductFinanceReport } from "@/lib/product-finance-summary";
import { APP_CURRENCY } from "@/lib/validations/order";

function money(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = {
  report: ProductFinanceReport;
  since: string;
  until: string;
};

export function ProductFinanceClient({ report, since, until }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const s = fd.get("since")?.toString();
          const u = fd.get("until")?.toString();
          if (s && u) router.push(`/finance/products?since=${s}&until=${u}`);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">From</Label>
          <Input name="since" type="date" className="h-9 w-[11rem]" defaultValue={since} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Until</Label>
          <Input name="until" type="date" className="h-9 w-[11rem]" defaultValue={until} />
        </div>
        <Button type="submit" size="sm">
          Apply
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push("/finance/products")}
        >
          This month (Kabul)
        </Button>
      </form>

      <div className="bg-muted/30 space-y-2 rounded-lg border p-4 text-sm leading-relaxed">
        <p className="font-medium">How product ad cost is estimated</p>
        <p className="text-muted-foreground">
          Sales use <strong>order date</strong> (Kabul). Meta cost is not taken from your
          card statement per campaign — billing milestones do not split that way. Instead:
        </p>
        <ol className="text-muted-foreground list-decimal space-y-1 pl-5">
          <li>
            <strong>Insights spend</strong> — synced daily spend per campaign for this
            period, split by each product&apos;s share of online attributed revenue in that
            campaign.
          </li>
          <li>
            <strong>Cash-adjusted ads</strong> — Insights allocation ×{" "}
            <strong>scale factor</strong> from card payments that include an Insights
            billing period (bank AFN at charge-date FX vs Meta Insights USD). Log those
            on{" "}
            <Link
              href="/finance/card-payments"
              className="text-primary underline-offset-2 hover:underline"
            >
              Card payments
            </Link>
            .
          </li>
        </ol>
        <p className="text-muted-foreground">
          In-store sales have no ad allocation. Campaign page remains for judging ads
          by <strong>lead day</strong>; this page is for <strong>product economics</strong>.
        </p>
        {report.unallocatedInsightsSpendUsd > 0.01 ? (
          <p className="text-amber-700 dark:text-amber-400">
            {APP_CURRENCY}{" "}
            {money(report.unallocatedInsightsSpendUsd)} of Insights spend had no
            attributed product revenue in this period (ads ran but no counted online
            sales, or date mismatch).
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Product revenue</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {money(report.totals.revenueUsd)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gross profit (before ads)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {money(report.totals.grossProfitUsd)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Insights spend allocated</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {money(report.totals.allocatedInsightsSpendUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Of {money(report.totals.totalInsightsSpendUsd)} synced in period
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cash-adjusted ads</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {money(report.totals.allocatedCashAdjustedSpendUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Scale {report.totals.cashScaleFactor.toFixed(3)}× (
            {report.totals.scaleMethod === "reconciled"
              ? "card vs Insights periods"
              : "calendar fallback"}
            )
            {Math.abs(report.totals.fxGapUsd) > 0.01 ? (
              <>
                {" "}
                · FX gap {money(report.totals.fxGapUsd)}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="-mx-3 overflow-x-auto sm:mx-0">
        <div className="inline-block min-w-full overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Gross profit</TableHead>
                <TableHead className="text-right">Insights ads</TableHead>
                <TableHead className="text-right">Cash-adjusted</TableHead>
                <TableHead className="text-right">After cash ads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No product sales in this period.
                  </TableCell>
                </TableRow>
              ) : (
                report.rows.map((r) => (
                  <TableRow key={r.productId}>
                    <TableCell>
                      <div className="font-medium">{r.productName}</div>
                      <div className="text-muted-foreground text-xs">
                        {r.sku}
                        {r.campaignCount > 0
                          ? ` · ${r.campaignCount} campaign(s)`
                          : " · no ad attribution"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.unitsSold}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(r.revenueUsd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(r.grossProfitUsd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.allocatedInsightsSpendUsd > 0
                        ? money(r.allocatedInsightsSpendUsd)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.allocatedCashAdjustedSpendUsd > 0
                        ? money(r.allocatedCashAdjustedSpendUsd)
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${
                        r.contributionAfterCashAdjustedUsd < 0
                          ? "text-destructive"
                          : ""
                      }`}
                    >
                      {money(r.contributionAfterCashAdjustedUsd)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
