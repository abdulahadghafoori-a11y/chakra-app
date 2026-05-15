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

function productHref(coreMode: boolean, productId: string) {
  return coreMode
    ? `/products#product-${productId}`
    : `/products/${encodeURIComponent(productId)}/agent`;
}

type Props = {
  rows: OrderTableRow[];
  itemsByOrder: Map<string, OrderLineSummary[]>;
  filterContactId?: string;
  coreMode: boolean;
};

export function OrdersListTable({
  rows,
  itemsByOrder,
  filterContactId,
  coreMode,
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
        <p className="mt-2 text-center text-sm sm:text-left">
          <span className="text-muted-foreground">Filtered by contact</span>{" "}
          <Link
            className="font-mono text-xs text-primary underline underline-offset-2"
            href={`/contacts?q=${encodeURIComponent(rows[0].phone)}`}
            title="Open contact search for this phone"
          >
            {rows[0].phone}
          </Link>{" "}
          ·{" "}
          <Link
            className="text-primary underline underline-offset-2"
            href="/"
          >
            Clear filter
          </Link>
        </p>
      ) : null}
      {filterContactId && rows.length === 0 ? (
        <p className="mt-2 text-center text-sm sm:text-left">
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
          <Table className="min-w-[48rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center align-middle tabular-nums">
                  #
                </TableHead>
                <TableHead className="text-center align-middle">Order</TableHead>
                <TableHead className="text-center align-middle">Phone</TableHead>
                <TableHead className="text-center align-middle">
                  Products
                </TableHead>
                <TableHead className="text-center align-middle">Total</TableHead>
                <TableHead className="text-center align-middle">CAPI</TableHead>
                <TableHead className="text-center align-middle">
                  Recorded
                </TableHead>
                <TableHead className="text-center align-middle">
                  Order event
                </TableHead>
                <TableHead className="text-center align-middle">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="text-muted-foreground text-center align-middle"
                    colSpan={9}
                  >
                    No orders yet. Create products, then record an order.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, rowIndex) => {
                  const items = itemsByOrder.get(r.id) ?? [];
                  const totalPrimary = `${r.currency} ${formatOrderUsdTable(r.value)}`;
                  const totalTitle =
                    r.valueAfn != null && r.valueAfn.trim() !== ""
                      ? `${totalPrimary} · AFN ${Math.round(Number(r.valueAfn))}`
                      : totalPrimary;

                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground align-middle text-center text-xs tabular-nums">
                        {rowIndex + 1}
                      </TableCell>
                      <TableCell className="max-w-[10rem] min-w-0 align-middle text-center font-mono text-xs">
                        <Link
                          className="text-primary block truncate underline-offset-2 hover:underline"
                          href={`/orders/${encodeURIComponent(r.id)}`}
                          title={r.id}
                        >
                          {r.id.length > 14 ? `${r.id.slice(0, 12)}…` : r.id}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[10rem] min-w-0 align-middle text-center font-mono text-xs">
                        <Link
                          className="text-primary block truncate underline-offset-2 hover:underline"
                          href={`/contacts?q=${encodeURIComponent(r.phone)}`}
                          title={r.phone}
                        >
                          {r.phone}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[13rem] min-w-0 align-middle px-2 text-center text-sm">
                        {items.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex min-w-0 flex-col items-center gap-1">
                            {items.map((it) => {
                              const label = `${it.productName} × ${it.quantity}`;
                              return (
                                <Link
                                  key={`${it.orderId}-${it.productId}`}
                                  href={productHref(coreMode, it.productId)}
                                  className="text-primary block w-full max-w-full truncate underline-offset-2 hover:underline"
                                  title={label}
                                >
                                  {label}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[7.5rem] min-w-0 align-middle text-center text-xs tabular-nums">
                        <span
                          className="block truncate font-medium text-foreground"
                          title={totalTitle}
                        >
                          {totalPrimary}
                        </span>
                      </TableCell>
                      <TableCell className="align-middle text-center">
                        <div className="flex justify-center">
                          {r.capiSent ? (
                            <Badge variant="default">sent</Badge>
                          ) : (
                            <Badge variant="secondary">pending</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[12rem] align-middle text-center text-xs leading-snug whitespace-normal break-words">
                        {formatOrderTableWhen(r.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[12rem] align-middle text-center text-xs leading-snug whitespace-normal break-words">
                        {formatOrderTableWhen(r.orderEventAt)}
                      </TableCell>
                      <TableCell className="align-middle text-center">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Link
                            href={`/orders/${encodeURIComponent(r.id)}`}
                            className={cn(
                              buttonVariants({
                                variant: "outline",
                                size: "sm",
                              }),
                              "no-underline min-h-11 min-w-[4.75rem] px-3 sm:min-h-9",
                            )}
                          >
                            Edit
                          </Link>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="min-h-11 min-w-[4.75rem] px-3 sm:min-h-9"
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
