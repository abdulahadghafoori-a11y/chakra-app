import Link from "next/link";

import { OrdersListTable } from "@/components/orders-list-table";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardSummary } from "@/lib/dashboard-summary";
import { isCoreFeatureSet } from "@/lib/feature-set";
import {
  groupLinesByOrderId,
  loadOrderLineSummaries,
  loadOrdersTableRows,
} from "@/lib/orders-list";
import { getStaffSessionOptional } from "@/lib/staff-auth/guard";
import { APP_CURRENCY } from "@/lib/validations/order";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function moneyLabel(raw: string) {
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return raw;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type SearchParams = { contactId?: string };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getStaffSessionOptional();

  if (!session) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-8 py-12 sm:py-16">
        <div className="space-y-3 text-center sm:text-left">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Chakra App
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            WhatsApp orders, Click-to-WhatsApp attribution, and Meta Conversions
            API. Sign in to manage the store, or create an order without an
            account.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
          <Link
            href="/login"
            className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
          >
            Log in
          </Link>
          <Link
            href="/orders/new"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full sm:w-auto",
            )}
          >
            Create order
          </Link>
        </div>
      </div>
    );
  }

  const { contactId } = await searchParams;
  const filterContactId = contactId?.trim() || undefined;
  const coreMode = isCoreFeatureSet();

  const [summary, orderRows] = await Promise.all([
    getDashboardSummary(),
    loadOrdersTableRows({ limit: 10, filterContactId }),
  ]);

  const itemRows = await loadOrderLineSummaries(orderRows.map((o) => o.id));
  const itemsByOrder = groupLinesByOrderId(itemRows);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Overview of orders, revenue ({APP_CURRENCY}), and Meta CAPI status.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total orders</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary.orderCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            All time
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue ({APP_CURRENCY})</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {moneyLabel(summary.revenuePrimaryCurrency)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Sum of orders in {APP_CURRENCY} only
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contacts</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary.contactsCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Known WhatsApp / phone identities
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>CAPI pending</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary.pendingCapiCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Orders not yet marked sent to Meta
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last 7 days</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary.ordersLast7Days} orders
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {APP_CURRENCY}{" "}
            {moneyLabel(summary.revenueLast7DaysPrimary)} in same period
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Quick link</CardDescription>
            <CardTitle className="text-base font-medium">
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href="/orders"
              >
                View all orders
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Full list and new order
          </CardContent>
        </Card>
        {coreMode ? null : (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Overhead</CardDescription>
              <CardTitle className="text-base font-medium">
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href="/expenses"
                >
                  Business expenses
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-xs">
              Rent, utilities, and other non-order costs
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Recent orders</h2>
        <p className="text-muted-foreground text-sm">
          Latest 10{filterContactId ? " (filtered)" : ""}.{" "}
          <Link
            className="text-primary underline-offset-2 hover:underline"
            href="/orders"
          >
            Open orders page
          </Link>
        </p>
        <OrdersListTable
          rows={orderRows}
          itemsByOrder={itemsByOrder}
          filterContactId={filterContactId}
          coreMode={coreMode}
        />
      </div>
    </div>
  );
}
