import { desc, eq, inArray } from "drizzle-orm";

import {
  contacts,
  ctwaSessions,
  orderItems,
  orders,
  products,
} from "@/drizzle/schema";
import { db } from "@/lib/db";

export type OrderTableRow = {
  id: string;
  phone: string;
  contactId: string;
  ctwa: string | null;
  value: string;
  currency: string;
  capiSent: boolean;
  createdAt: Date;
};

export type OrderLineSummary = {
  orderId: string;
  productName: string;
  quantity: number;
  lineValue: string;
};

/**
 * Orders for a list table (phone, CTWA, CAPI, totals) with optional contact filter.
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
      ctwa: ctwaSessions.ctwaClid,
      value: orders.value,
      currency: orders.currency,
      capiSent: orders.capiSent,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(contacts, eq(orders.contactId, contacts.id))
    .leftJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id));

  const rows = await (options.filterContactId
    ? base.where(eq(orders.contactId, options.filterContactId))
    : base
  )
    .orderBy(desc(orders.createdAt))
    .limit(options.limit);

  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    contactId: r.contactId,
    ctwa: r.ctwa,
    value: String(r.value),
    currency: r.currency,
    capiSent: r.capiSent,
    createdAt: r.createdAt,
  }));
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
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}
