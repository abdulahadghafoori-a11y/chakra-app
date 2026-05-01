import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderDetailClient } from "./order-detail-client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { loadOrderDetail } from "@/lib/order-detail";
import { formatOrderTableWhen } from "@/lib/orders-list";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }> };

function money(amount: string, currency: string) {
  const n = Number.parseFloat(amount);
  if (Number.isNaN(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function OrderDetailPage({ params }: Props) {
  const { orderId } = await params;
  const order = await loadOrderDetail(orderId);
  if (!order) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link
            href="/orders"
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            ← Orders
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Order
            </h1>
            <code className="bg-muted rounded-md px-2 py-0.5 text-xs">
              {order.id}
            </code>
            <Badge variant="secondary">{order.status}</Badge>
            {order.capiSent ? (
              <Badge variant="default">CAPI sent</Badge>
            ) : (
              <Badge variant="outline">CAPI pending</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            <span className="font-mono">{order.phone}</span>
            {order.ctwaClid ? (
              <>
                {" "}
                · CTWA{" "}
                <span className="font-mono text-xs">{order.ctwaClid}</span>
              </>
            ) : null}
            {" "}
            · {formatOrderTableWhen(order.createdAt)}
          </p>
          <p className="text-lg font-medium tabular-nums">
            Total {money(order.value, order.currency)}
          </p>
        </div>
        <Link
          href={`/orders/${encodeURIComponent(order.id)}/confirmation`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 self-start",
          )}
        >
          Customer confirmation
        </Link>
      </div>

      <OrderDetailClient order={order} />
    </div>
  );
}
