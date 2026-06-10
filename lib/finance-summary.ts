import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";

import {
  businessExpenses,
  expenseCategories,
  orderItems,
  orders,
} from "@/drizzle/schema";
import { sumBusinessExpensesUsd } from "@/lib/business-expenses-list";
import { sumCardPaymentsUsd } from "@/lib/card-payments-list";
import { db } from "@/lib/db";
import { sumPayrollUsd } from "@/lib/payroll-list";
import { APP_CURRENCY } from "@/lib/validations/order";

/** Expense categories treated as card / marketing / SaaS (cash when charged). */
const CARD_STYLE_EXPENSE_SLUGS = [
  "marketing-non-meta",
  "software",
  "bank-fees",
] as const;

export type FinancePeriod = {
  sinceDate: string;
  untilDate: string;
  label: string;
};

export type FinanceSummary = {
  period: FinancePeriod;
  orderCount: number;
  revenueUsd: string;
  revenueOnlineUsd: string;
  revenueOfflineUsd: string;
  avgOrderValueUsd: string;
  productCogsUsd: string;
  deliveryCostUsd: string;
  returnCostUsd: string;
  codFeeUsd: string;
  grossProfitUsd: string;
  expensesUsd: string;
  payrollUsd: string;
  cardStyleExpensesUsd: string;
  cardPaymentsUsd: string;
  cardPaymentsMarketingUsd: string;
  /** Logged marketing expenses − card charges (positive = under-logged in expenses). */
  cardReconciliationGapUsd: string;
  totalOperatingCostsUsd: string;
  netProfitLossUsd: string;
  expensesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    colorKey: string;
    kind: string;
    totalUsd: string;
  }>;
  expensesByKind: Array<{
    kind: string;
    totalUsd: string;
  }>;
};

function kabulOrderDateInPeriod(period: FinancePeriod) {
  return and(
    eq(orders.currency, APP_CURRENCY),
    gte(
      sql`(${orders.orderEventAt} at time zone 'Asia/Kabul')::date`,
      sql`${period.sinceDate}::date`,
    ),
    lte(
      sql`(${orders.orderEventAt} at time zone 'Asia/Kabul')::date`,
      sql`${period.untilDate}::date`,
    ),
  );
}

function parseSum(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(n: number): string {
  return n.toFixed(2);
}

export function currentMonthPeriodKabul(): FinancePeriod {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const sinceDate = `${y}-${m}-01`;
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const untilDate = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  return {
    sinceDate,
    untilDate,
    label: `${y}-${m}`,
  };
}

export async function getFinanceSummary(
  period: FinancePeriod,
): Promise<FinanceSummary> {
  const orderWhere = kabulOrderDateInPeriod(period);

  const [
    [revRow],
    [onlineRevRow],
    [offlineRevRow],
    [countRow],
    [cogsRow],
    [deliveryRow],
    [returnRow],
    [codRow],
  ] = await Promise.all([
    db
      .select({
        s: sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
      })
      .from(orders)
      .where(orderWhere),
    db
      .select({
        s: sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
      })
      .from(orders)
      .where(and(orderWhere, eq(orders.salesChannel, "online"))),
    db
      .select({
        s: sql<string>`coalesce(sum(${orders.value}::numeric), 0)::text`,
      })
      .from(orders)
      .where(and(orderWhere, eq(orders.salesChannel, "offline"))),
    db.select({ c: count() }).from(orders).where(orderWhere),
    db
      .select({
        s: sql<string>`coalesce(sum(${orderItems.lineCogs}::numeric), 0)::text`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(orderWhere),
    db
      .select({
        s: sql<string>`coalesce(sum(${orders.deliveryCost}::numeric), 0)::text`,
      })
      .from(orders)
      .where(orderWhere),
    db
      .select({
        s: sql<string>`coalesce(sum(${orders.returnCost}::numeric), 0)::text`,
      })
      .from(orders)
      .where(orderWhere),
    db
      .select({
        s: sql<string>`coalesce(sum(${orders.codFee}::numeric), 0)::text`,
      })
      .from(orders)
      .where(orderWhere),
  ]);

  const revenueUsd = revRow?.s ?? "0";
  const revenue = parseSum(revenueUsd);
  const orderCount = Number(countRow?.c ?? 0);
  const productCogs = parseSum(cogsRow?.s);
  const deliveryCost = parseSum(deliveryRow?.s);
  const returnCost = parseSum(returnRow?.s);
  const codFee = parseSum(codRow?.s);

  const [expensesUsd, payrollUsd] = await Promise.all([
    sumBusinessExpensesUsd({
      sinceDate: period.sinceDate,
      untilDate: period.untilDate,
    }),
    sumPayrollUsd({
      sinceDate: period.sinceDate,
      untilDate: period.untilDate,
    }),
  ]);

  const expenses = parseSum(expensesUsd);
  const payroll = parseSum(payrollUsd);

  const [cardPaymentsUsd, cardPaymentsMarketingUsd] = await Promise.all([
    sumCardPaymentsUsd({
      sinceDate: period.sinceDate,
      untilDate: period.untilDate,
    }),
    sumCardPaymentsUsd({
      sinceDate: period.sinceDate,
      untilDate: period.untilDate,
      categorySlugs: [...CARD_STYLE_EXPENSE_SLUGS],
    }),
  ]);

  const [cardStyleRow] = await db
    .select({
      s: sql<string>`coalesce(sum(${businessExpenses.amount}::numeric), 0)::text`,
    })
    .from(businessExpenses)
    .innerJoin(
      expenseCategories,
      eq(businessExpenses.categoryId, expenseCategories.id),
    )
    .where(
      and(
        gte(businessExpenses.incurredDate, period.sinceDate),
        lte(businessExpenses.incurredDate, period.untilDate),
        inArray(expenseCategories.slug, [...CARD_STYLE_EXPENSE_SLUGS]),
      ),
    );

  const cardStyleExpenses = parseSum(cardStyleRow?.s);
  const cardPaymentsTotal = parseSum(cardPaymentsUsd);
  const cardPaymentsMarketing = parseSum(cardPaymentsMarketingUsd);
  const cardReconciliationGap = cardStyleExpenses - cardPaymentsMarketing;

  const grossProfit =
    revenue - productCogs - deliveryCost - returnCost - codFee;
  const totalOperatingCosts = expenses + payroll;
  const netProfitLoss =
    revenue -
    productCogs -
    deliveryCost -
    returnCost -
    codFee -
    expenses -
    payroll;

  const byCat = await db
    .select({
      categoryId: expenseCategories.id,
      categoryName: expenseCategories.name,
      colorKey: expenseCategories.colorKey,
      kind: expenseCategories.kind,
      totalUsd: sql<string>`coalesce(sum(${businessExpenses.amount}::numeric), 0)::text`,
    })
    .from(businessExpenses)
    .innerJoin(
      expenseCategories,
      eq(businessExpenses.categoryId, expenseCategories.id),
    )
    .where(
      and(
        gte(businessExpenses.incurredDate, period.sinceDate),
        lte(businessExpenses.incurredDate, period.untilDate),
      ),
    )
    .groupBy(
      expenseCategories.id,
      expenseCategories.name,
      expenseCategories.colorKey,
      expenseCategories.kind,
    )
    .orderBy(sql`sum(${businessExpenses.amount}::numeric) desc`);

  const byKind = await db
    .select({
      kind: expenseCategories.kind,
      totalUsd: sql<string>`coalesce(sum(${businessExpenses.amount}::numeric), 0)::text`,
    })
    .from(businessExpenses)
    .innerJoin(
      expenseCategories,
      eq(businessExpenses.categoryId, expenseCategories.id),
    )
    .where(
      and(
        gte(businessExpenses.incurredDate, period.sinceDate),
        lte(businessExpenses.incurredDate, period.untilDate),
      ),
    )
    .groupBy(expenseCategories.kind)
    .orderBy(sql`sum(${businessExpenses.amount}::numeric) desc`);

  const avgOrder =
    orderCount > 0 && Number.isFinite(revenue) ? revenue / orderCount : 0;

  return {
    period,
    orderCount,
    revenueUsd,
    revenueOnlineUsd: onlineRevRow?.s ?? "0",
    revenueOfflineUsd: offlineRevRow?.s ?? "0",
    avgOrderValueUsd: fmtUsd(avgOrder),
    productCogsUsd: fmtUsd(productCogs),
    deliveryCostUsd: fmtUsd(deliveryCost),
    returnCostUsd: fmtUsd(returnCost),
    codFeeUsd: fmtUsd(codFee),
    grossProfitUsd: fmtUsd(grossProfit),
    expensesUsd,
    payrollUsd,
    cardStyleExpensesUsd: fmtUsd(cardStyleExpenses),
    cardPaymentsUsd,
    cardPaymentsMarketingUsd: fmtUsd(cardPaymentsMarketing),
    cardReconciliationGapUsd: fmtUsd(cardReconciliationGap),
    totalOperatingCostsUsd: fmtUsd(totalOperatingCosts),
    netProfitLossUsd: fmtUsd(netProfitLoss),
    expensesByCategory: byCat.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      colorKey: r.colorKey,
      kind: r.kind,
      totalUsd: String(r.totalUsd),
    })),
    expensesByKind: byKind.map((r) => ({
      kind: r.kind,
      totalUsd: String(r.totalUsd),
    })),
  };
}
