import { asc, desc, eq, inArray } from "drizzle-orm";

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
  productId: string;
  productName: string;
  quantity: number;
  lineValue: string;
};

/** URL/query sort for `/orders` table (default matches legacy `created_at` desc). */
export type OrdersTableSort =
  | "recorded_desc"
  | "recorded_asc"
  | "event_desc"
  | "event_asc"
  | "total_desc"
  | "total_asc";

export function parseOrdersTableSort(
  raw: string | undefined,
): OrdersTableSort {
  const v = raw?.trim();
  if (
    v === "recorded_asc" ||
    v === "event_desc" ||
    v === "event_asc" ||
    v === "total_desc" ||
    v === "total_asc"
  ) {
    return v;
  }
  return "recorded_desc";
}

function ordersTableOrderBy(sort: OrdersTableSort) {
  switch (sort) {
    case "recorded_desc":
      return desc(orders.createdAt);
    case "recorded_asc":
      return asc(orders.createdAt);
    case "event_desc":
      return desc(orders.orderEventAt);
    case "event_asc":
      return asc(orders.orderEventAt);
    case "total_desc":
      return desc(orders.value);
    case "total_asc":
      return asc(orders.value);
    default:
      return desc(orders.createdAt);
  }
}

/**
 * Orders for a list table (phone, CAPI, totals) with optional contact filter.
 */
export async function loadOrdersTableRows(options: {
  limit: number;
  filterContactId?: string;
  sort?: OrdersTableSort;
}): Promise<OrderTableRow[]> {
  const sortKey = options.sort ?? "recorded_desc";
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
    .orderBy(ordersTableOrderBy(sortKey))
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
      productId: products.id,
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
        productId: r.productId,
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
