import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import { cardPayments, expenseCategories } from "@/drizzle/schema";
import { db } from "@/lib/db";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  resolveTablePage,
} from "@/lib/table-pagination";

export type CardPaymentRow = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColorKey: string;
  paidAt: string;
  payee: string;
  amount: string;
  amountAfn: string;
  currency: string;
  statementRef: string | null;
  externalRef: string | null;
  note: string | null;
  linkedExpenseId: string | null;
  insightsPeriodStart: string | null;
  insightsPeriodEnd: string | null;
  insightsSpendUsd: string | null;
  cashScaleFactor: string | null;
  createdAt: Date;
};

export async function loadCardPaymentsForList(input: {
  page: number;
  pageSize?: number;
  sinceDate?: string;
  untilDate?: string;
}): Promise<{ rows: CardPaymentRow[]; total: number; page: number }> {
  const pageSize = Math.min(
    Math.max(1, input.pageSize ?? DEFAULT_TABLE_PAGE_SIZE),
    100,
  );
  const parts: SQL[] = [];
  if (input.sinceDate) {
    parts.push(gte(cardPayments.paidAt, input.sinceDate));
  }
  if (input.untilDate) {
    parts.push(lte(cardPayments.paidAt, input.untilDate));
  }
  const wherePart = parts.length > 0 ? and(...parts) : undefined;

  const countBase = db
    .select({ n: count() })
    .from(cardPayments)
    .innerJoin(
      expenseCategories,
      eq(cardPayments.categoryId, expenseCategories.id),
    );
  const [countRow] = wherePart
    ? await countBase.where(wherePart)
    : await countBase;
  const total = Number(countRow?.n ?? 0);
  const { page, offset } = resolveTablePage({
    requestedPage: input.page,
    total,
    pageSize,
  });

  const listBase = db
    .select({
      id: cardPayments.id,
      categoryId: cardPayments.categoryId,
      categoryName: expenseCategories.name,
      categoryColorKey: expenseCategories.colorKey,
      paidAt: cardPayments.paidAt,
      payee: cardPayments.payee,
      amount: cardPayments.amount,
      amountAfn: cardPayments.amountAfn,
      currency: cardPayments.currency,
      statementRef: cardPayments.statementRef,
      externalRef: cardPayments.externalRef,
      note: cardPayments.note,
      linkedExpenseId: cardPayments.linkedExpenseId,
      insightsPeriodStart: cardPayments.insightsPeriodStart,
      insightsPeriodEnd: cardPayments.insightsPeriodEnd,
      insightsSpendUsd: cardPayments.insightsSpendUsd,
      cashScaleFactor: cardPayments.cashScaleFactor,
      createdAt: cardPayments.createdAt,
    })
    .from(cardPayments)
    .innerJoin(
      expenseCategories,
      eq(cardPayments.categoryId, expenseCategories.id),
    );

  const rows = await (wherePart ? listBase.where(wherePart) : listBase)
    .orderBy(desc(cardPayments.paidAt), desc(cardPayments.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      categoryColorKey: r.categoryColorKey,
      paidAt: r.paidAt,
      payee: r.payee,
      amount: String(r.amount),
      amountAfn: String(r.amountAfn),
      currency: r.currency,
      statementRef: r.statementRef,
      externalRef: r.externalRef,
      note: r.note,
      linkedExpenseId: r.linkedExpenseId,
      insightsPeriodStart: r.insightsPeriodStart,
      insightsPeriodEnd: r.insightsPeriodEnd,
      insightsSpendUsd:
        r.insightsSpendUsd != null ? String(r.insightsSpendUsd) : null,
      cashScaleFactor:
        r.cashScaleFactor != null ? String(r.cashScaleFactor) : null,
      createdAt: r.createdAt,
    })),
    total,
    page,
  };
}

export async function sumCardPaymentsUsd(input: {
  sinceDate: string;
  untilDate: string;
  categorySlugs?: string[];
}): Promise<string> {
  const datePart = and(
    gte(cardPayments.paidAt, input.sinceDate),
    lte(cardPayments.paidAt, input.untilDate),
  );
  const base = db
    .select({
      s: sql<string>`coalesce(sum(${cardPayments.amount}::numeric), 0)::text`,
    })
    .from(cardPayments)
    .innerJoin(
      expenseCategories,
      eq(cardPayments.categoryId, expenseCategories.id),
    );

  if (input.categorySlugs?.length) {
    const [row] = await base.where(
      and(datePart, inArray(expenseCategories.slug, input.categorySlugs)),
    );
    return row?.s ?? "0";
  }

  const [row] = await base.where(datePart);
  return row?.s ?? "0";
}
