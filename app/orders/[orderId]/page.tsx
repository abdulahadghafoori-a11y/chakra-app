import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderDetailClient } from "./order-detail-client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { loadOrderDetail } from "@/lib/order-detail";
import { listMetaCampaignsForManualAttribution } from "@/lib/campaigns-rollups";
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
  const [order, metaCampaignOptions] = await Promise.all([
    loadOrderDetail(orderId),
    listMetaCampaignsForManualAttribution(),
  ]);
  if (!order) notFound();

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <Link
            href="/orders"
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            ← Orders
          </Link>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
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
          <p className="text-muted-foreground max-w-full text-sm leading-relaxed break-words">
            <span className="font-mono">{order.phone}</span>
            {order.ctwaClid ? (
              <>
                {" "}
                · CTWA{" "}
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs break-all">
                  {order.ctwaClid}
                </code>
              </>
            ) : null}
            {order.manualMetaCampaignId ? (
              <>
                {" "}
                · Campaign (manual){" "}
                <span className="font-mono text-xs break-all">
                  {(order.manualCampaignName ?? "").trim() ||
                    order.manualMetaCampaignId}
                </span>
              </>
            ) : null}
            {" "}
            · Recorded{" "}
            <span className="whitespace-normal">
              {formatOrderTableWhen(order.createdAt)}
            </span>
            {" · Order event "}
            <span className="whitespace-normal">
              {formatOrderTableWhen(order.orderEventAt)}
            </span>
          </p>
          <p className="text-lg font-medium tabular-nums">
            Total {money(order.value, order.currency)}
          </p>
        </div>
        <Link
          href={`/orders/${encodeURIComponent(order.id)}/confirmation`}
          title="Read-only summary you can share with the customer (opens in-app)."
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 self-start",
          )}
        >
          Customer receipt (share)
        </Link>
      </div>

      <OrderDetailClient order={order} metaCampaignOptions={metaCampaignOptions} />
    </div>
  );
}
