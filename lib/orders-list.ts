import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { contacts, orderItems, orders, products } from "@/drizzle/schema";
import { formatDateTimeKabul } from "@/lib/kabul-time";
import {
  estimateAfnWholeFromStoredUsd,
  formatUsd2,
} from "@/lib/fx-afn-usd";
import { db } from "@/lib/db";
import { resolveTablePage } from "@/lib/table-pagination";

export type OrderTableRow = {
  id: string;
  phone: string;
  contactId: string;
  status: string;
  deliveryProvinceAfghanistan: string | null;
  deliveryTrackingNumber: string | null;
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

/** Kabul when no out-of-Kabul province was saved on the order. */
export function formatOrderDeliveryAddressLine(row: {
  deliveryProvinceAfghanistan: string | null;
}): string {
  const province = row.deliveryProvinceAfghanistan?.trim();
  return province || "Kabul";
}

export function formatOrderStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function orderIdsMatchingProductSearch(term: string): Promise<string[]> {
  const like = `%${term}%`;
  const rows = await db
    .selectDistinct({ orderId: orderItems.orderId })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(ilike(products.name, like));
  return rows.map((r) => r.orderId);
}

function buildOrdersSearchCondition(term: string, productOrderIds: string[]) {
  const like = `%${term}%`;
  const parts = [
    ilike(orders.id, like),
    ilike(contacts.phoneNumber, like),
    ilike(sql`coalesce(${contacts.name}, '')`, like),
    ilike(orders.status, like),
    ilike(sql`coalesce(${orders.deliveryProvinceAfghanistan}, '')`, like),
    ilike(sql`coalesce(${orders.deliveryTrackingNumber}, '')`, like),
    ilike(
      sql`coalesce(nullif(trim(${orders.deliveryProvinceAfghanistan}), ''), 'Kabul')`,
      like,
    ),
  ];
  if (productOrderIds.length > 0) {
    parts.push(inArray(orders.id, productOrderIds));
  }
  return or(...parts);
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

function mapOrderTableRow(r: {
  id: string;
  phone: string;
  contactId: string;
  status: string;
  deliveryProvinceAfghanistan: string | null;
  deliveryTrackingNumber: string | null;
  value: string | number;
  afnPerUsdSnapshot: string | null;
  currency: string;
  capiSent: boolean;
  orderEventAt: Date;
  createdAt: Date;
}): OrderTableRow {
  const derived = estimateAfnWholeFromStoredUsd(
    Number(r.value),
    r.afnPerUsdSnapshot,
  );
  return {
    id: r.id,
    phone: r.phone,
    contactId: r.contactId,
    status: r.status,
    deliveryProvinceAfghanistan: r.deliveryProvinceAfghanistan,
    deliveryTrackingNumber: r.deliveryTrackingNumber,
    value: String(r.value),
    valueAfn: derived == null ? null : String(derived),
    currency: r.currency,
    capiSent: r.capiSent,
    orderEventAt: r.orderEventAt,
    createdAt: r.createdAt,
  };
}

/**
 * Orders for a list table (phone, CAPI, totals) with optional contact filter.
 */
export async function loadOrdersTableRows(options: {
  page: number;
  pageSize: number;
  filterContactId?: string;
  sort?: OrdersTableSort;
  /** Case-insensitive match on order id, phone, contact name, status, delivery, products. */
  search?: string;
}): Promise<{ rows: OrderTableRow[]; total: number; page: number }> {
  const sortKey = options.sort ?? "recorded_desc";
  const searchTerm = options.search?.trim() ?? "";
  const productOrderIds =
    searchTerm.length > 0
      ? await orderIdsMatchingProductSearch(searchTerm)
      : [];

  const conditions = [];
  if (options.filterContactId) {
    conditions.push(eq(orders.contactId, options.filterContactId));
  }
  if (searchTerm.length > 0) {
    conditions.push(buildOrdersSearchCondition(searchTerm, productOrderIds));
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  const countBase = db
    .select({ n: count() })
    .from(orders)
    .innerJoin(contacts, eq(orders.contactId, contacts.id));
  const [countRow] = whereClause
    ? await countBase.where(whereClause)
    : await countBase;
  const total = Number(countRow?.n ?? 0);

  const { page, offset } = resolveTablePage({
    requestedPage: options.page,
    total,
    pageSize: options.pageSize,
  });

  const listBase = db
    .select({
      id: orders.id,
      phone: contacts.phoneNumber,
      contactId: contacts.id,
      status: orders.status,
      deliveryProvinceAfghanistan: orders.deliveryProvinceAfghanistan,
      deliveryTrackingNumber: orders.deliveryTrackingNumber,
      value: orders.value,
      afnPerUsdSnapshot: orders.afnPerUsdSnapshot,
      currency: orders.currency,
      capiSent: orders.capiSent,
      orderEventAt: orders.orderEventAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(contacts, eq(orders.contactId, contacts.id));

  const rows = await (whereClause ? listBase.where(whereClause) : listBase)
    .orderBy(ordersTableOrderBy(sortKey))
    .limit(options.pageSize)
    .offset(offset);

  return {
    rows: rows.map(mapOrderTableRow),
    total,
    page,
  };
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
