import { and, count, eq, gte, sql } from "drizzle-orm";

import { contacts, orders } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { APP_CURRENCY } from "@/lib/validations/order";

export type DashboardSummary = {
  orderCount: number;
  contactsCount: number;
  /** Sum of order totals in APP_CURRENCY only (numeric as string). */
  revenuePrimaryCurrency: string;
  pendingCapiCount: number;
  ordersLast7Days: number;
  revenueLast7DaysPrimary: string;
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const since7d = new Date();
  since7d.setUTCDate(since7d.getUTCDate() - 7);
  since7d.setUTCHours(0, 0, 0, 0);

  const [
    [orderCountRow],
    [revenueRow],
    [pendingRow],
    [contactsRow],
    [recentCountRow],
    [recentRevRow],
  ] = await Promise.all([
    db.select({ c: count() }).from(orders),
    db
      .select({
        s: sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
      })
      .from(orders)
      .where(eq(orders.currency, APP_CURRENCY)),
    db.select({ c: count() }).from(orders).where(eq(orders.capiSent, false)),
    db.select({ c: count() }).from(contacts),
    db
      .select({ c: count() })
      .from(orders)
      .where(gte(orders.orderEventAt, since7d)),
    db
      .select({
        s: sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
      })
      .from(orders)
      .where(
        and(eq(orders.currency, APP_CURRENCY), gte(orders.orderEventAt, since7d)),
      ),
  ]);

  return {
    orderCount: Number(orderCountRow?.c ?? 0),
    contactsCount: Number(contactsRow?.c ?? 0),
    revenuePrimaryCurrency: revenueRow?.s ?? "0",
    pendingCapiCount: Number(pendingRow?.c ?? 0),
    ordersLast7Days: Number(recentCountRow?.c ?? 0),
    revenueLast7DaysPrimary: recentRevRow?.s ?? "0",
  };
}
