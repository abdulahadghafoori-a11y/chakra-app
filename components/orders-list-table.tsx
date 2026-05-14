"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteOrder } from "@/actions/order";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatOrderTableWhen,
  formatOrderUsdTable,
  type OrderLineSummary,
  type OrderTableRow,
} from "@/lib/orders-list";
import { cn } from "@/lib/utils";

type Props = {
  rows: OrderTableRow[];
  itemsByOrder: Map<string, OrderLineSummary[]>;
  filterContactId?: string;
};

export function OrdersListTable({
  rows,
  itemsByOrder,
  filterContactId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  function onConfirmDelete() {
    if (!deleteTargetId) return;
    startTransition(() => {
      void (async () => {
        const res = await deleteOrder({ orderId: deleteTargetId });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Order deleted.");
        setDeleteTargetId(null);
        router.refresh();
      })();
    });
  }

  return (
    <>
      {filterContactId && rows[0] ? (
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">Filtered by contact</span>{" "}
          <span className="font-mono text-xs">{rows[0].phone}</span> ·{" "}
          <Link
            className="text-primary underline underline-offset-2"
            href="/"
          >
            Clear filter
          </Link>
        </p>
      ) : null}
      {filterContactId && rows.length === 0 ? (
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">
            No orders for this contact yet.
          </span>{" "}
          <Link className="underline underline-offset-2" href="/">
            Show all orders
          </Link>
        </p>
      ) : null}
      <div className="-mx-3 overflow-x-auto sm:mx-0">
        <div className="inline-block min-w-full overflow-hidden rounded-xl border align-middle">
          <Table className="min-w-[36rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center tabular-nums">#</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Products</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>CAPI</TableHead>
                <TableHead className="text-right">Recorded</TableHead>
                <TableHead className="text-right">Order event</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={9}>
                    No orders yet. Create products, then record an order.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, rowIndex) => {
                  const items = itemsByOrder.get(r.id) ?? [];
                  const productSummary =
                    items.length === 0
                      ? "—"
                      : items
                          .map((it) => `${it.productName} × ${it.quantity}`)
                          .join(", ");

                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground text-center text-xs tabular-nums">
                        {rowIndex + 1}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <Link
                          className="text-primary underline-offset-2 hover:underline"
                          href={`/orders/${encodeURIComponent(r.id)}`}
                        >
                          {r.id.length > 14 ? `${r.id.slice(0, 12)}…` : r.id}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                      <TableCell className="max-w-[280px] text-sm">
                        <span className="line-clamp-2" title={productSummary}>
                          {productSummary}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[8rem] text-right text-xs tabular-nums leading-tight">
                        <span className="block text-foreground">
                          {r.currency} {formatOrderUsdTable(r.value)}
                        </span>
                        {r.valueAfn != null && r.valueAfn.trim() !== "" ? (
                          <span className="text-muted-foreground block">
                            AFN {Math.round(Number(r.valueAfn))}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {r.capiSent ? (
                          <Badge variant="default">sent</Badge>
                        ) : (
                          <Badge variant="secondary">pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-right text-xs">
                        {formatOrderTableWhen(r.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-right text-xs">
                        {formatOrderTableWhen(r.orderEventAt)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <Link
                            href={`/orders/${encodeURIComponent(r.id)}`}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "xs" }),
                              "no-underline",
                            )}
                          >
                            Edit
                          </Link>
                          <Button
                            type="button"
                            variant="destructive"
                            size="xs"
                            disabled={pending}
                            onClick={() => setDeleteTargetId(r.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={deleteTargetId != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Delete this order?</DialogTitle>
            <DialogDescription>
              {deleteTargetId ? (
                <>
                  Order{" "}
                  <span className="font-mono">{deleteTargetId}</span> will be
                  removed permanently with its line items.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setDeleteTargetId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={onConfirmDelete}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
