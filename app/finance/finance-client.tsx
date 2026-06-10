"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ExpenseCategoryBadge } from "@/components/expense-category-badge";
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
import { formatExpenseCategoryKind } from "@/lib/expense-category-colors";
import type { FinanceSummary } from "@/lib/finance-summary";
import { APP_CURRENCY } from "@/lib/validations/order";

function moneyLabel(raw: string) {
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return raw;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function PnlRow({
  label,
  amount,
  bold,
  negative,
  hint,
}: {
  label: string;
  amount: string;
  bold?: boolean;
  negative?: boolean;
  hint?: string;
}) {
  const n = Number.parseFloat(amount);
  const isNeg = negative ?? n < 0;
  return (
    <TableRow className={bold ? "bg-muted/40 font-medium" : undefined}>
      <TableCell>
        <span>{label}</span>
        {hint ? (
          <span className="text-muted-foreground block text-xs font-normal">
            {hint}
          </span>
        ) : null}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${isNeg ? "text-destructive" : ""}`}
      >
        {moneyLabel(amount)}
      </TableCell>
    </TableRow>
  );
}

type Props = {
  summary: FinanceSummary;
  since: string;
  until: string;
};

export function FinanceClient({ summary, since, until }: Props) {
  const router = useRouter();

  const applyRange = () => {
    const form = document.getElementById("finance-range-form") as HTMLFormElement;
    const fd = new FormData(form);
    const s = fd.get("since")?.toString();
    const u = fd.get("until")?.toString();
    if (!s || !u) return;
    router.push(`/finance?since=${s}&until=${u}`);
  };

  const net = Number.parseFloat(summary.netProfitLossUsd);

  return (
    <div className="space-y-8">
      <form
        id="finance-range-form"
        className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          applyRange();
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
          onClick={() => router.push("/finance")}
        >
          This month (Kabul)
        </Button>
      </form>

      <p className="text-muted-foreground text-sm leading-relaxed">
        Business P&amp;L for <strong>{summary.period.label}</strong> ({since} →{" "}
        {until}, order dates in Kabul). Built from <strong>orders</strong>,{" "}
        <Link href="/expenses" className="text-primary underline-offset-2 hover:underline">
          expenses
        </Link>
        , and{" "}
        <Link href="/payroll" className="text-primary underline-offset-2 hover:underline">
          payroll
        </Link>{" "}
        only — not from Campaign analytics.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net P&amp;L ({APP_CURRENCY})</CardDescription>
            <CardTitle
              className={`text-2xl tabular-nums ${net < 0 ? "text-destructive" : ""}`}
            >
              {moneyLabel(summary.netProfitLossUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            After product costs, delivery, overhead, payroll
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {moneyLabel(summary.revenueUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {summary.orderCount} orders · avg{" "}
            {moneyLabel(summary.avgOrderValueUsd)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gross profit</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {moneyLabel(summary.grossProfitUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Revenue − COGS − delivery − returns − COD fees
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Card charges (bank)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {moneyLabel(summary.cardPaymentsMarketingUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            <Link
              href="/finance/card-payments"
              className="text-primary underline-offset-2 hover:underline"
            >
              Card payments log →
            </Link>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">Card reconciliation</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/finance/products"
              className="text-primary underline-offset-2 hover:underline"
            >
              Product reports
            </Link>
            <Link
              href="/finance/card-payments"
              className="text-primary underline-offset-2 hover:underline"
            >
              Card charges
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Compare what left your card (card payments log) with what was entered
          under Marketing / Software / Bank fees in expenses. Use one method or
          mirror with &quot;Also add to expenses&quot; to avoid gaps.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border px-3 py-2">
            <p className="text-muted-foreground text-xs">Card charges logged</p>
            <p className="text-lg font-semibold tabular-nums">
              {moneyLabel(summary.cardPaymentsMarketingUsd)}
            </p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-muted-foreground text-xs">Same categories in expenses</p>
            <p className="text-lg font-semibold tabular-nums">
              {moneyLabel(summary.cardStyleExpensesUsd)}
            </p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-muted-foreground text-xs">
              Expenses − card (0 = aligned)
            </p>
            <p
              className={`text-lg font-semibold tabular-nums ${
                Math.abs(Number.parseFloat(summary.cardReconciliationGapUsd)) >
                0.01
                  ? "text-amber-600 dark:text-amber-400"
                  : ""
              }`}
            >
              {moneyLabel(summary.cardReconciliationGapUsd)}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Profit &amp; loss</h2>
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead className="text-right">{APP_CURRENCY}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <PnlRow label="Revenue (all orders)" amount={summary.revenueUsd} bold />
              <PnlRow
                label="↳ Online (WhatsApp)"
                amount={summary.revenueOnlineUsd}
                hint="In-store excluded from campaign tools only"
              />
              <PnlRow label="↳ In-store" amount={summary.revenueOfflineUsd} />
              <PnlRow
                label="Product COGS"
                amount={summary.productCogsUsd}
                negative
                hint="From order line snapshots"
              />
              <PnlRow
                label="Delivery / courier"
                amount={summary.deliveryCostUsd}
                negative
                hint="Per-order delivery on order form"
              />
              <PnlRow
                label="Return costs"
                amount={summary.returnCostUsd}
                negative
              />
              <PnlRow label="COD fees" amount={summary.codFeeUsd} negative />
              <PnlRow label="Gross profit" amount={summary.grossProfitUsd} bold />
              <PnlRow
                label="Business expenses"
                amount={summary.expensesUsd}
                negative
                hint="Rent, utilities, Meta card charges when paid, etc."
              />
              <PnlRow label="Payroll" amount={summary.payrollUsd} negative />
              <PnlRow
                label="Net profit / loss"
                amount={summary.netProfitLossUsd}
                bold
              />
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="bg-muted/30 rounded-lg border p-4 text-sm leading-relaxed">
        <p className="font-medium">Recording Meta &amp; subscription charges</p>
        <p className="text-muted-foreground mt-2">
          When your bank charges the card, add a row in{" "}
          <Link
            href="/finance/card-payments"
            className="text-primary underline-offset-2 hover:underline"
          >
            Card payments
          </Link>{" "}
          on that <strong>statement date</strong> with the full AFN amount. Tick
          &quot;Also add to expenses&quot; only if you want the charge in overhead P&amp;L
          immediately; otherwise rely on the reconciliation block above.
        </p>
      </div>

      {summary.expensesByKind.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Overhead by kind</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {summary.expensesByKind.map((row) => (
              <li
                key={row.kind}
                className="flex justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span>{formatExpenseCategoryKind(row.kind)}</span>
                <span className="tabular-nums font-medium">
                  {moneyLabel(row.totalUsd)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.expensesByCategory.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Overhead by category</h2>
          <ul className="space-y-2">
            {summary.expensesByCategory.map((row) => (
              <li
                key={row.categoryId}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <ExpenseCategoryBadge
                  name={row.categoryName}
                  colorKey={row.colorKey}
                />
                <span className="tabular-nums font-medium">
                  {APP_CURRENCY} {moneyLabel(row.totalUsd)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
