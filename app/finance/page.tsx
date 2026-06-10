import Link from "next/link";

import { FinanceClient } from "@/app/finance/finance-client";
import { buttonVariants } from "@/components/ui/button";
import {
  currentMonthPeriodKabul,
  getFinanceSummary,
} from "@/lib/finance-summary";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = { since?: string; until?: string };

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const defaultPeriod = currentMonthPeriodKabul();
  const since = sp.since?.match(/^\d{4}-\d{2}-\d{2}$/)
    ? sp.since
    : defaultPeriod.sinceDate;
  const until = sp.until?.match(/^\d{4}-\d{2}-\d{2}$/)
    ? sp.until
    : defaultPeriod.untilDate;
  const period = {
    sinceDate: since,
    untilDate: until,
    label: `${since} – ${until}`,
  };
  const summary = await getFinanceSummary(period);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/"
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Finance overview
          </h1>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Business profit and loss from orders, expenses, and payroll — separate
            from Campaign ad analytics.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 self-start">
          <Link
            href="/expenses"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Expenses
          </Link>
          <Link
            href="/payroll"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Payroll
          </Link>
          <Link
            href="/finance/products"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Products
          </Link>
          <Link
            href="/finance/card-payments"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Card payments
          </Link>
        </div>
      </div>
      <FinanceClient summary={summary} since={since} until={until} />
    </div>
  );
}
