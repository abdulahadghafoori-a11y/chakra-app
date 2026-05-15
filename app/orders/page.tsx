import Link from "next/link";

import { OrdersListTable } from "@/components/orders-list-table";
import { OrdersSortToolbar } from "@/components/orders-sort-toolbar";
import { buttonVariants } from "@/components/ui/button";
import { isCoreFeatureSet } from "@/lib/feature-set";
import {
  groupLinesByOrderId,
  loadOrderLineSummaries,
  loadOrdersTableRows,
  parseOrdersTableSort,
} from "@/lib/orders-list";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = { sort?: string };

export default async function OrdersIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const sort = parseOrdersTableSort(sp.sort);
  const coreMode = isCoreFeatureSet();
  const orderRows = await loadOrdersTableRows({ limit: 200, sort });
  const itemRows = await loadOrderLineSummaries(orderRows.map((o) => o.id));
  const itemsByOrder = groupLinesByOrderId(itemRows);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Orders
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              All recorded orders (up to 200 most recent). Meta CAPI column shows
              whether Purchase was sent.
            </p>
          </div>
          <OrdersSortToolbar sort={sort} />
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
      />
    </div>
  );
}
