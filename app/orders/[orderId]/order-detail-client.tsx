"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateOrderStatus } from "@/actions/order";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDefaultKabulDateTimeLocal } from "@/lib/kabul-time";
import type { OrderDetail } from "@/lib/order-detail";
import { orderStatusEligibleForPurchaseCapi } from "@/lib/order-meta-capi";
import { orderStatuses, type UpdateOrderStatusInput } from "@/lib/validations/order";

type Props = {
  order: OrderDetail;
};

function money(amount: string, currency: string) {
  const n = Number.parseFloat(amount);
  if (Number.isNaN(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function OrderDetailClient({ order }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nextStatus, setNextStatus] = useState(order.status);
  const [capiEventTimeKabul, setCapiEventTimeKabul] = useState(
    getDefaultKabulDateTimeLocal(),
  );

  useEffect(() => {
    setNextStatus(order.status);
  }, [order.id, order.status]);

  const needsCapiEventTime =
    !order.capiSent && orderStatusEligibleForPurchaseCapi(nextStatus);

  function onSaveStatus() {
    startTransition(() => {
      void (async () => {
        const res = await updateOrderStatus({
          orderId: order.id,
          status: nextStatus as UpdateOrderStatusInput["status"],
          capiEventTimeKabul: needsCapiEventTime ? capiEventTimeKabul : undefined,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          res.capiSent && !order.capiSent
            ? "Status updated. Meta Purchase sent."
            : "Status updated.",
        );
        router.refresh();
      })();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fulfillment status</CardTitle>
          <CardDescription>
            Move the order through your COD flow. Meta Purchase is sent once when
            status becomes{" "}
            <span className="text-foreground font-medium">Confirmed</span> or{" "}
            <span className="text-foreground font-medium">Paid</span> (if CTWA
            exists and CAPI was not sent yet).{" "}
            <span className="text-foreground font-medium">Returned</span> does not
            send CAPI.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-status-select" className="text-xs">
              Status
            </Label>
            <Select
              value={nextStatus}
              onValueChange={(v) => {
                if (v) setNextStatus(v);
              }}
            >
              <SelectTrigger id="order-status-select" className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orderStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsCapiEventTime ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-capi-time" className="text-xs">
                Meta Purchase event time (Kabul)
              </Label>
              <Input
                id="order-capi-time"
                type="datetime-local"
                className="w-[11rem]"
                value={capiEventTimeKabul}
                onChange={(e) => setCapiEventTimeKabul(e.target.value)}
              />
              <p className="text-muted-foreground max-w-md text-xs">
                Used as Meta <code className="text-[11px]">event_time</code> for
                this Purchase only.
              </p>
            </div>
          ) : null}
          <Button
            type="button"
            disabled={pending || nextStatus === order.status}
            onClick={onSaveStatus}
          >
            Save status
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Line</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.lines.map((l) => (
                <TableRow key={l.lineIndex}>
                  <TableCell>{l.lineIndex}</TableCell>
                  <TableCell>{l.productName ?? "—"}</TableCell>
                  <TableCell className="text-right">{l.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(l.lineValue, order.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery cost</CardTitle>
          <CardDescription>
            Set when the order is created (new order form). This amount counts
            toward campaign operational cost for paid, attributed orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          <p className="text-foreground font-medium tabular-nums">
            {money(order.deliveryCost, order.currency)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
