import Link from "next/link";

import { OrdersListTable } from "@/components/orders-list-table";
import { buttonVariants } from "@/components/ui/button";
import {
  groupLinesByOrderId,
  loadOrderLineSummaries,
  loadOrdersTableRows,
} from "@/lib/orders-list";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OrdersIndexPage() {
  const orderRows = await loadOrdersTableRows({ limit: 200 });
  const itemRows = await loadOrderLineSummaries(orderRows.map((o) => o.id));
  const itemsByOrder = groupLinesByOrderId(itemRows);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Orders
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            All recorded orders (up to 200 most recent). Meta CAPI column shows
            whether Purchase was sent.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <Link
            href="/expenses"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "shrink-0",
            )}
          >
            Business expenses
          </Link>
          <Link
            href="/orders/new"
            className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
          >
            New order
          </Link>
        </div>
      </div>
      <OrdersListTable rows={orderRows} itemsByOrder={itemsByOrder} />
    </div>
  );
}
