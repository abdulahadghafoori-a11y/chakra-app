import Link from "next/link";

import { Badge } from "@/components/ui/badge";
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
  type OrderLineSummary,
  type OrderTableRow,
} from "@/lib/orders-list";

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
                <TableHead>Order</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>CTWA</TableHead>
                <TableHead>Products</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>CAPI</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={7}>
                    No orders yet. Create products, then record an order.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const items = itemsByOrder.get(r.id) ?? [];
                  const productSummary =
                    items.length === 0
                      ? "—"
                      : items
                          .map((it) => `${it.productName} × ${it.quantity}`)
                          .join(", ");

                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          className="text-primary underline-offset-2 hover:underline"
                          href={`/orders/${encodeURIComponent(r.id)}`}
                        >
                          {r.id.length > 14 ? `${r.id.slice(0, 12)}…` : r.id}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs">
                        {r.ctwa ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[320px] text-sm">
                        <span className="line-clamp-2" title={productSummary}>
                          {productSummary}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.currency} {r.value}
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
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
