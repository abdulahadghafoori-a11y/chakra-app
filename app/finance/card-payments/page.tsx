import Link from "next/link";
import { redirect } from "next/navigation";

import { listExpenseCategories } from "@/actions/expense-category";
import { CardPaymentsClient } from "@/app/finance/card-payments/card-payments-client";
import { TablePagination } from "@/components/table-pagination";
import { buttonVariants } from "@/components/ui/button";
import { loadCardPaymentsForList } from "@/lib/card-payments-list";
import { getCachedPublicFxForOrderForm } from "@/lib/cached-reads";
import { currentMonthPeriodKabul } from "@/lib/finance-summary";
import { getStaffSessionOptional } from "@/lib/staff-auth/guard";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePage,
} from "@/lib/table-pagination";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = { page?: string; since?: string; until?: string };

export default async function CardPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const requestedPage = parseTablePage(sp.page);
  const defaultPeriod = currentMonthPeriodKabul();
  const since = sp.since?.match(/^\d{4}-\d{2}-\d{2}$/)
    ? sp.since
    : defaultPeriod.sinceDate;
  const until = sp.until?.match(/^\d{4}-\d{2}-\d{2}$/)
    ? sp.until
    : defaultPeriod.untilDate;

  const [session, fxState, categories, listResult] = await Promise.all([
    getStaffSessionOptional(),
    getCachedPublicFxForOrderForm(),
    listExpenseCategories(false),
    loadCardPaymentsForList({
      page: requestedPage,
      sinceDate: since,
      untilDate: until,
    }),
  ]);
  const { rows, total, page } = listResult;
  if (total > 0 && requestedPage !== page) {
    const p = new URLSearchParams();
    p.set("since", since);
    p.set("until", until);
    p.set("page", String(page));
    redirect(`/finance/card-payments?${p.toString()}`);
  }
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_TABLE_PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/finance"
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            ← Finance
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Card payments
          </h1>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Bank and card charges (Meta milestones, subscriptions) by statement
            date.
          </p>
        </div>
        <Link
          href="/expenses"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 self-start",
          )}
        >
          Expenses
        </Link>
      </div>
      <CardPaymentsClient
        rows={rows}
        categories={categories}
        initialFx={fxState}
        canStaffEditFx={Boolean(session)}
        filterSince={since}
        filterUntil={until}
      />
      <TablePagination
        page={page}
        pageCount={pageCount}
        total={total}
        itemLabel="charges"
        preserveKeys={["since", "until"]}
      />
    </div>
  );
}
