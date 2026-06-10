import { and, count, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { businessExpenses, expenseCategories } from "@/drizzle/schema";
import { db } from "@/lib/db";
import type { listBusinessExpensesFilterSchema } from "@/lib/validations/business-expense";
import type { z } from "zod";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  resolveTablePage,
} from "@/lib/table-pagination";

export type BusinessExpenseRow = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryKind: string;
  categoryColorKey: string;
  categoryIsActive: boolean;
  amount: string;
  amountAfn: string;
  afnPerUsdSnapshot: string;
  currency: string;
  vendor: string | null;
  receiptRef: string | null;
  note: string | null;
  incurredDate: string;
  createdAt: Date;
};

function buildWhere(
  filters?: z.infer<typeof listBusinessExpensesFilterSchema>,
): SQL | undefined {
  if (!filters) return undefined;
  const parts: SQL[] = [];
  if (filters.categoryId) {
    parts.push(eq(businessExpenses.categoryId, filters.categoryId));
  }
  if (filters.kind?.trim()) {
    parts.push(eq(expenseCategories.kind, filters.kind.trim()));
  }
  if (filters.sinceDate) {
    parts.push(gte(businessExpenses.incurredDate, filters.sinceDate));
  }
  if (filters.untilDate) {
    parts.push(lte(businessExpenses.incurredDate, filters.untilDate));
  }
  if (parts.length === 0) return undefined;
  return and(...parts);
}

export async function loadBusinessExpensesForList(input: {
  page: number;
  pageSize?: number;
  filters?: z.infer<typeof listBusinessExpensesFilterSchema>;
}): Promise<{ rows: BusinessExpenseRow[]; total: number; page: number }> {
  const pageSize = Math.min(
    Math.max(1, input.pageSize ?? DEFAULT_TABLE_PAGE_SIZE),
    100,
  );
  const wherePart = buildWhere(input.filters);

  const countBase = db
    .select({ n: count() })
    .from(businessExpenses)
    .innerJoin(
      expenseCategories,
      eq(businessExpenses.categoryId, expenseCategories.id),
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
      id: businessExpenses.id,
      categoryId: businessExpenses.categoryId,
      categoryName: expenseCategories.name,
      categoryKind: expenseCategories.kind,
      categoryColorKey: expenseCategories.colorKey,
      categoryIsActive: expenseCategories.isActive,
      amount: businessExpenses.amount,
      amountAfn: businessExpenses.amountAfn,
      afnPerUsdSnapshot: businessExpenses.afnPerUsdSnapshot,
      currency: businessExpenses.currency,
      vendor: businessExpenses.vendor,
      receiptRef: businessExpenses.receiptRef,
      note: businessExpenses.note,
      incurredDate: businessExpenses.incurredDate,
      createdAt: businessExpenses.createdAt,
    })
    .from(businessExpenses)
    .innerJoin(
      expenseCategories,
      eq(businessExpenses.categoryId, expenseCategories.id),
    );

  const rows = await (wherePart ? listBase.where(wherePart) : listBase)
    .orderBy(
      desc(businessExpenses.incurredDate),
      desc(businessExpenses.createdAt),
    )
    .limit(pageSize)
    .offset(offset);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      categoryKind: r.categoryKind,
      categoryColorKey: r.categoryColorKey,
      categoryIsActive: r.categoryIsActive,
      amount: String(r.amount),
      amountAfn: String(r.amountAfn),
      afnPerUsdSnapshot: String(r.afnPerUsdSnapshot),
      currency: r.currency,
      vendor: r.vendor,
      receiptRef: r.receiptRef,
      note: r.note,
      incurredDate: r.incurredDate,
      createdAt: r.createdAt,
    })),
    total,
    page,
  };
}

export async function sumBusinessExpensesUsd(input: {
  sinceDate: string;
  untilDate: string;
}): Promise<string> {
  const [row] = await db
    .select({
      s: sql<string>`coalesce(sum(${businessExpenses.amount}::numeric), 0)::text`,
    })
    .from(businessExpenses)
    .where(
      and(
        gte(businessExpenses.incurredDate, input.sinceDate),
        lte(businessExpenses.incurredDate, input.untilDate),
      ),
    );
  return row?.s ?? "0";
}
