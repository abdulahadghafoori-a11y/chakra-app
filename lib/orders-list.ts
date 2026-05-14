import { desc, eq, inArray } from "drizzle-orm";

import { contacts, orderItems, orders, products } from "@/drizzle/schema";
import { formatDateTimeKabul } from "@/lib/kabul-time";
import {
  estimateAfnWholeFromStoredUsd,
  formatUsd2,
} from "@/lib/fx-afn-usd";
import { db } from "@/lib/db";

export type OrderTableRow = {
  id: string;
  phone: string;
  contactId: string;
  value: string;
  /** Whole AFN derived from `value` USD + `afn_per_usd_snapshot`; null if no snapshot */
  valueAfn: string | null;
  currency: string;
  capiSent: boolean;
  /** Wall-clock order time from staff form / Meta context. */
  orderEventAt: Date;
  /** When this row was saved to the database. */
  createdAt: Date;
};

export type OrderLineSummary = {
  orderId: string;
  productName: string;
  quantity: number;
  lineValue: string;
};

/**
 * Orders for a list table (phone, CAPI, totals) with optional contact filter.
 */
export async function loadOrdersTableRows(options: {
  limit: number;
  filterContactId?: string;
}): Promise<OrderTableRow[]> {
  const base = db
    .select({
      id: orders.id,
      phone: contacts.phoneNumber,
      contactId: contacts.id,
      value: orders.value,
      afnPerUsdSnapshot: orders.afnPerUsdSnapshot,
      currency: orders.currency,
      capiSent: orders.capiSent,
      orderEventAt: orders.orderEventAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(contacts, eq(orders.contactId, contacts.id));

  const rows = await (options.filterContactId
    ? base.where(eq(orders.contactId, options.filterContactId))
    : base
  )
    .orderBy(desc(orders.createdAt))
    .limit(options.limit);

  return rows.map((r) => {
    const derived = estimateAfnWholeFromStoredUsd(
      Number(r.value),
      r.afnPerUsdSnapshot,
    );
    return {
      id: r.id,
      phone: r.phone,
      contactId: r.contactId,
      value: String(r.value),
      valueAfn: derived == null ? null : String(derived),
      currency: r.currency,
      capiSent: r.capiSent,
      orderEventAt: r.orderEventAt,
      createdAt: r.createdAt,
    };
  });
}

export async function loadOrderLineSummaries(
  orderIds: string[],
): Promise<OrderLineSummary[]> {
  if (orderIds.length === 0) return [];
  return db
    .select({
      orderId: orderItems.orderId,
      productName: products.name,
      quantity: orderItems.quantity,
      lineValue: orderItems.lineValue,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(inArray(orderItems.orderId, orderIds))
    .then((rows) =>
      rows.map((r) => ({
        orderId: r.orderId,
        productName: r.productName,
        quantity: r.quantity,
        lineValue: String(r.lineValue),
      })),
    );
}

export function groupLinesByOrderId(
  lines: OrderLineSummary[],
): Map<string, OrderLineSummary[]> {
  const m = new Map<string, OrderLineSummary[]>();
  for (const row of lines) {
    const list = m.get(row.orderId) ?? [];
    list.push(row);
    m.set(row.orderId, list);
  }
  return m;
}

export function formatOrderTableWhen(d: Date) {
  return formatDateTimeKabul(d);
}

/** Stored USD numeric string → display with exactly two fraction digits. */
export function formatOrderUsdTable(amountStr: string): string {
  const n = Number.parseFloat(amountStr);
  if (!Number.isFinite(n)) return amountStr;
  return formatUsd2(n);
}
