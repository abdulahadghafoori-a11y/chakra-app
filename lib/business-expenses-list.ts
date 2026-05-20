import { count, desc } from "drizzle-orm";

import { businessExpenses } from "@/drizzle/schema";
import { db } from "@/lib/db";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  resolveTablePage,
} from "@/lib/table-pagination";

export type BusinessExpenseRow = {
  id: string;
  category: string;
  amount: string;
  currency: string;
  note: string | null;
  incurredDate: string;
  createdAt: Date;
};

export async function loadBusinessExpensesForList(input: {
  page: number;
  pageSize?: number;
}): Promise<{ rows: BusinessExpenseRow[]; total: number; page: number }> {
  const pageSize = Math.min(
    Math.max(1, input.pageSize ?? DEFAULT_TABLE_PAGE_SIZE),
    100,
  );
  const [countRow] = await db
    .select({ n: count() })
    .from(businessExpenses);
  const total = Number(countRow?.n ?? 0);
  const { page, offset } = resolveTablePage({
    requestedPage: input.page,
    total,
    pageSize,
  });

  const rows = await db
    .select({
      id: businessExpenses.id,
      category: businessExpenses.category,
      amount: businessExpenses.amount,
      currency: businessExpenses.currency,
      note: businessExpenses.note,
      incurredDate: businessExpenses.incurredDate,
      createdAt: businessExpenses.createdAt,
    })
    .from(businessExpenses)
    .orderBy(desc(businessExpenses.incurredDate), desc(businessExpenses.createdAt))
    .limit(pageSize)
    .offset(offset);

  return { rows, total, page };
}
