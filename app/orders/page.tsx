import Link from "next/link";
import { redirect } from "next/navigation";

import { OrdersListTable } from "@/components/orders-list-table";
import { OrdersSearchToolbar } from "@/components/orders-search-toolbar";
import { OrdersSortToolbar } from "@/components/orders-sort-toolbar";
import { TablePagination } from "@/components/table-pagination";
import { buttonVariants } from "@/components/ui/button";
import { isCoreFeatureSet } from "@/lib/feature-set";
import {
  groupLinesByOrderId,
  loadOrderLineSummaries,
  loadOrdersTableRows,
  parseOrdersTableSort,
} from "@/lib/orders-list";
import {
  ORDERS_TABLE_PAGE_SIZE,
  parseTablePage,
} from "@/lib/table-pagination";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = { sort?: string; q?: string; page?: string };

export default async function OrdersIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const sort = parseOrdersTableSort(sp.sort);
  const searchQuery = sp.q?.trim() ?? "";
  const requestedPage = parseTablePage(sp.page);
  const coreMode = isCoreFeatureSet();
  const { rows: orderRows, total, page } = await loadOrdersTableRows({
    page: requestedPage,
    pageSize: ORDERS_TABLE_PAGE_SIZE,
    sort,
    search: searchQuery || undefined,
  });
  if (total > 0 && requestedPage !== page) {
    const p = new URLSearchParams();
    if (searchQuery) p.set("q", searchQuery);
    p.set("sort", sort);
    p.set("page", String(page));
    redirect(`/orders?${p.toString()}`);
  }
  const itemRows = await loadOrderLineSummaries(orderRows.map((o) => o.id));
  const itemsByOrder = groupLinesByOrderId(itemRows);
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_TABLE_PAGE_SIZE));
  const rankOffset = (page - 1) * ORDERS_TABLE_PAGE_SIZE;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Orders
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              All recorded orders with search and pagination. Meta CAPI column shows
              whether Purchase was sent.
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <OrdersSearchToolbar
              initialQuery={searchQuery}
              preserveKeys={["sort"]}
            />
            <OrdersSortToolbar sort={sort} />
          </div>
        </div>
        <Link
          href="/orders/new"
          className={cn(
            buttonVariants({ size: "sm" }),
            "shrink-0 self-start touch-manipulation",
          )}
        >
          New order
        </Link>
      </div>
      <OrdersListTable
        rows={orderRows}
        itemsByOrder={itemsByOrder}
        coreMode={coreMode}
        searchQuery={searchQuery}
        rankOffset={rankOffset}
      />
      <TablePagination
        page={page}
        pageCount={pageCount}
        total={total}
        itemLabel="orders"
        preserveKeys={["sort", "q"]}
      />
    </div>
  );
}
