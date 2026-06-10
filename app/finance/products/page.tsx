import Link from "next/link";

import { ProductFinanceClient } from "@/app/finance/products/product-finance-client";
import { buttonVariants } from "@/components/ui/button";
import { currentMonthPeriodKabul } from "@/lib/finance-summary";
import { getProductFinanceReport } from "@/lib/product-finance-summary";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = { since?: string; until?: string };

export default async function ProductFinancePage({
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

  const report = await getProductFinanceReport({
    sinceDate: since,
    untilDate: until,
    label: `${since} – ${until}`,
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/finance"
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            ← Finance
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Product reports
          </h1>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Revenue, margin, and estimated ad cost per SKU (sale date, not Campaign
            lead day).
          </p>
        </div>
        <Link
          href="/finance/card-payments"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 self-start",
          )}
        >
          Card payments
        </Link>
      </div>
      <ProductFinanceClient report={report} since={since} until={until} />
    </div>
  );
}
