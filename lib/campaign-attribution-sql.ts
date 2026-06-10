import { and, eq, gte, isNotNull, lte, sql, type SQL } from "drizzle-orm";

import { ctwaSessions, orders } from "@/drizzle/schema";
import { ORDER_SALES_CHANNELS } from "@/lib/sales-channel";
import { APP_DISPLAY_TIMEZONE } from "@/lib/kabul-time";

/**
 * Literal zone in SQL (not a bound param). Drizzle binds `${APP_DISPLAY_TIMEZONE}` separately
 * per fragment; Postgres then rejects SELECT vs GROUP BY as non-matching expressions.
 * Must stay in sync with {@link APP_DISPLAY_TIMEZONE}.
 */
const KABUL_TZ_SQL = "Asia/Kabul";
if (KABUL_TZ_SQL !== APP_DISPLAY_TIMEZONE) {
  throw new Error("KABUL_TZ_SQL must match APP_DISPLAY_TIMEZONE");
}

/** Kabul calendar date of `orders.campaign_attributed_at` (text) for SELECT / GROUP BY. */
export const sqlOrdersCampaignAttributedKabulDay = sql<string>`((${orders.campaignAttributedAt} at time zone 'Asia/Kabul')::date)::text`;

/** Kabul calendar date of `ctwa_sessions.send_time`. */
export const sqlCtwaSendTimeKabulDay = sql<string>`((${ctwaSessions.sendTime} at time zone 'Asia/Kabul')::date)::text`;

const sqlKabulDateFromCampaignAttributed = sql`(${orders.campaignAttributedAt} at time zone 'Asia/Kabul')::date`;
const sqlKabulDateFromCtwaSendTime = sql`(${ctwaSessions.sendTime} at time zone 'Asia/Kabul')::date`;

/**
 * Attributed orders whose lead day (Kabul) falls in `sinceDay`…`untilDay` (YYYY-MM-DD).
 */
/** Online WhatsApp orders with a lead attribution instant (excludes in-store). */
export function ordersCampaignAttributedInKabulDayRange(
  sinceDay: string,
  untilDay: string,
): SQL {
  return and(
    eq(orders.salesChannel, ORDER_SALES_CHANNELS[0]),
    isNotNull(orders.campaignAttributedAt),
    gte(sqlKabulDateFromCampaignAttributed, sql`${sinceDay}::date`),
    lte(sqlKabulDateFromCampaignAttributed, sql`${untilDay}::date`),
  )!;
}

export function ctwaSendTimeInKabulDayRange(
  sinceDay: string,
  untilDay: string,
): SQL {
  return and(
    gte(sqlKabulDateFromCtwaSendTime, sql`${sinceDay}::date`),
    lte(sqlKabulDateFromCtwaSendTime, sql`${untilDay}::date`),
  )!;
}
