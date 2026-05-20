import { sql } from "drizzle-orm";

import { orders } from "@/drizzle/schema";

/**
 * Campaign “total orders” = pending, confirmed, shipped, and paid.
 * Excludes cancelled and returned only.
 */
export const sqlCampaignTotalOrdersCount = sql<number>`count(${orders.id}) filter (where ${orders.status} not in ('cancelled', 'returned'))::int`;

export const sqlCampaignTotalDistinctOrdersCount = sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} not in ('cancelled', 'returned'))::int`;

/**
 * Campaign “converted” / fulfilled for counts and P&amp;L (COD store).
 * Paid, confirmed, or shipped — each order has one status; confirmed and shipped
 * are separate labels staff use for the same pre-delivery / in-transit step.
 * Excludes pending, cancelled, and returned.
 */
export const sqlCampaignConvertedOrdersCount = sql<number>`count(${orders.id}) filter (where ${orders.status} in ('paid', 'confirmed', 'shipped'))::int`;

export const sqlCampaignConvertedDistinctOrdersCount = sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} in ('paid', 'confirmed', 'shipped'))::int`;

export const sqlCampaignConvertedRevenueSum = sql<string>`coalesce(sum(${orders.value}::numeric) filter (where ${orders.status} in ('paid', 'confirmed', 'shipped')), 0)::text`;

export const sqlCampaignConvertedDeliverySum = sql<string>`coalesce(sum(coalesce(${orders.deliveryCost}::numeric, 0)) filter (where ${orders.status} in ('paid', 'confirmed', 'shipped')), 0)::text`;

/** For Drizzle `inArray(orders.status, …)`. */
export const CAMPAIGN_CONVERTED_ORDER_STATUSES = [
  "paid",
  "confirmed",
  "shipped",
] as const;

/** Short label for campaign UI (cash on delivery). */
export const CAMPAIGN_FULFILLED_ORDERS_LABEL = "Fulfilled (COD)";

export const CAMPAIGN_FULFILLED_ORDERS_HINT =
  "Cash on delivery: confirmed and shipped are the same funnel step (pre-delivery / out for delivery).";

type OrderStatusBreakdown = {
  paidOrdersCount: number;
  confirmedOrdersCount: number;
  shippedOrdersCount: number;
};

/** Display-only: confirmed + shipped counts (mutually exclusive per order). */
export function codConfirmedOrShippedCount(row: OrderStatusBreakdown): number {
  return row.confirmedOrdersCount + row.shippedOrdersCount;
}

/** One-line status split for campaign tables (COD). */
export function formatCodFulfilledSubline(row: OrderStatusBreakdown): string {
  const codPreDelivery = codConfirmedOrShippedCount(row);
  const parts = [`${row.paidOrdersCount} paid`];
  if (codPreDelivery > 0) {
    parts.push(`${codPreDelivery} confirmed/shipped`);
  }
  return parts.join(" · ");
}
