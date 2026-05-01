"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OrderDetail } from "@/lib/order-detail";

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
  return (
    <div className="space-y-6">
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
