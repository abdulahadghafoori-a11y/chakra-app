import { sql } from "drizzle-orm";

import { orders } from "@/drizzle/schema";

/**
 * Campaign “total orders” = pending, confirmed, shipped, and paid.
 * Excludes cancelled and returned only.
 */
export const sqlCampaignTotalOrdersCount = sql<number>`count(${orders.id}) filter (where ${orders.status} not in ('cancelled', 'returned'))::int`;

export const sqlCampaignTotalDistinctOrdersCount = sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} not in ('cancelled', 'returned'))::int`;
