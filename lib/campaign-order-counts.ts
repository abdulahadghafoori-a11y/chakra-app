import { sql } from "drizzle-orm";

import { orders } from "@/drizzle/schema";

/**
 * Campaign “total orders” = pending, confirmed, shipped, and paid.
 * Excludes cancelled and returned only.
 */
export const sqlCampaignTotalOrdersCount = sql<number>`count(${orders.id}) filter (where ${orders.status} not in ('cancelled', 'returned'))::int`;

export const sqlCampaignTotalDistinctOrdersCount = sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} not in ('cancelled', 'returned'))::int`;

/**
 * Campaign “converted” for counts and P&amp;L: paid, confirmed, and shipped.
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
