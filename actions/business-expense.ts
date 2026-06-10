"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { businessExpenses, expenseCategories } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { afnInputToStoredUsd, resolveFinanceFx } from "@/lib/finance-fx";
import { assertStaffSession } from "@/lib/staff-auth/guard";
import {
  addBusinessExpenseSchema,
  deleteBusinessExpenseSchema,
  listBusinessExpensesFilterSchema,
  updateBusinessExpenseSchema,
} from "@/lib/validations/business-expense";

async function assertActiveCategory(categoryId: string): Promise<string | null> {
  const [cat] = await db
    .select({ id: expenseCategories.id, isActive: expenseCategories.isActive })
    .from(expenseCategories)
    .where(eq(expenseCategories.id, categoryId))
    .limit(1);
  if (!cat) return "Category not found.";
  if (!cat.isActive) return "That category is inactive. Pick another or reactivate it.";
  return null;
}

export async function addBusinessExpenseAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = addBusinessExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const catErr = await assertActiveCategory(parsed.data.categoryId);
  if (catErr) return { ok: false, error: catErr };

  const fx = await resolveFinanceFx();
  if ("error" in fx) return { ok: false, error: fx.error };

  const conv = afnInputToStoredUsd(parsed.data.amountAfn, fx.afnPerOneUsd);
  if ("error" in conv) return { ok: false, error: conv.error };

  await db.insert(businessExpenses).values({
    categoryId: parsed.data.categoryId,
    amount: conv.amountUsd,
    amountAfn: String(conv.amountAfnWhole),
    afnPerUsdSnapshot: fx.snapshot,
    currency: parsed.data.currency,
    note: parsed.data.note?.trim() || null,
    vendor: parsed.data.vendor?.trim() || null,
    receiptRef: parsed.data.receiptRef?.trim() || null,
    incurredDate: parsed.data.incurredDate,
  });
  revalidatePath("/expenses");
  revalidatePath("/finance");
  revalidatePath("/");
  return { ok: true };
}

export async function updateBusinessExpenseAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = updateBusinessExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const [cat] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.id, parsed.data.categoryId))
    .limit(1);
  if (!cat) return { ok: false, error: "Category not found." };

  const fx = await resolveFinanceFx();
  if ("error" in fx) return { ok: false, error: fx.error };

  const conv = afnInputToStoredUsd(parsed.data.amountAfn, fx.afnPerOneUsd);
  if ("error" in conv) return { ok: false, error: conv.error };

  const [row] = await db
    .update(businessExpenses)
    .set({
      categoryId: parsed.data.categoryId,
      amount: conv.amountUsd,
      amountAfn: String(conv.amountAfnWhole),
      afnPerUsdSnapshot: fx.snapshot,
      currency: parsed.data.currency,
      note: parsed.data.note?.trim() || null,
      vendor: parsed.data.vendor?.trim() || null,
      receiptRef: parsed.data.receiptRef?.trim() || null,
      incurredDate: parsed.data.incurredDate,
    })
    .where(eq(businessExpenses.id, parsed.data.id))
    .returning({ id: businessExpenses.id });
  if (!row) {
    return { ok: false, error: "Expense not found." };
  }
  revalidatePath("/expenses");
  revalidatePath("/finance");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteBusinessExpenseAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = deleteBusinessExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  await db.delete(businessExpenses).where(eq(businessExpenses.id, parsed.data.id));
  revalidatePath("/expenses");
  revalidatePath("/finance");
  revalidatePath("/");
  return { ok: true };
}
