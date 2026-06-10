import Link from "next/link";
import { redirect } from "next/navigation";

import { listExpenseCategories } from "@/actions/expense-category";
import { ExpensesClient } from "@/app/expenses/expenses-client";
import { TablePagination } from "@/components/table-pagination";
import { buttonVariants } from "@/components/ui/button";
import { loadBusinessExpensesForList } from "@/lib/business-expenses-list";
import { getCachedPublicFxForOrderForm } from "@/lib/cached-reads";
import { getStaffSessionOptional } from "@/lib/staff-auth/guard";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePage,
} from "@/lib/table-pagination";
import { listBusinessExpensesFilterSchema } from "@/lib/validations/business-expense";
import { APP_CURRENCY } from "@/lib/validations/order";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = {
  page?: string;
  since?: string;
  until?: string;
  categoryId?: string;
  kind?: string;
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const requestedPage = parseTablePage(sp.page);
  const filtersParsed = listBusinessExpensesFilterSchema.safeParse({
    sinceDate: sp.since,
    untilDate: sp.until,
    categoryId: sp.categoryId,
    kind: sp.kind,
  });
  const filters = filtersParsed.success ? filtersParsed.data : undefined;

  const [session, categories, fxState, listResult] = await Promise.all([
    getStaffSessionOptional(),
    listExpenseCategories(false),
    getCachedPublicFxForOrderForm(),
    loadBusinessExpensesForList({ page: requestedPage, filters }),
  ]);
  const { rows, total, page } = listResult;
  if (total > 0 && requestedPage !== page) {
    const p = new URLSearchParams();
    if (sp.since) p.set("since", sp.since);
    if (sp.until) p.set("until", sp.until);
    if (sp.categoryId) p.set("categoryId", sp.categoryId);
    if (sp.kind) p.set("kind", sp.kind);
    p.set("page", String(page));
    redirect(`/expenses?${p.toString()}`);
  }
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_TABLE_PAGE_SIZE));

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
            Business expenses
          </h1>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Operating overhead in AFN, stored as {APP_CURRENCY} for reports. Not
            tied to orders or campaign rollups.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 self-start">
          <Link
            href="/finance"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Finance overview
          </Link>
          <Link
            href="/payroll"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Payroll
          </Link>
        </div>
      </div>
      <ExpensesClient
        rows={rows}
        categories={categories}
        initialFx={fxState}
        canStaffEditFx={Boolean(session)}
        filterSince={filters?.sinceDate}
        filterUntil={filters?.untilDate}
        filterCategoryId={filters?.categoryId}
        filterKind={filters?.kind}
      />
      <TablePagination
        page={page}
        pageCount={pageCount}
        total={total}
        itemLabel="expenses"
        preserveKeys={["since", "until", "categoryId", "kind"]}
      />
    </div>
  );
}
