import { desc } from "drizzle-orm";

import { businessExpenses } from "@/drizzle/schema";
import { db } from "@/lib/db";

export type BusinessExpenseRow = {
  id: string;
  category: string;
  amount: string;
  currency: string;
  note: string | null;
  incurredDate: string;
  createdAt: Date;
};

export async function loadBusinessExpensesForList(
  limit = 500,
): Promise<BusinessExpenseRow[]> {
  return db
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
    .limit(limit);
}
