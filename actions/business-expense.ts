"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { businessExpenses } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { FULL_FEATURE_UNAVAILABLE, isCoreFeatureSet } from "@/lib/feature-set";
import { assertStaffSession } from "@/lib/staff-auth/guard";
import {
  addBusinessExpenseSchema,
  deleteBusinessExpenseSchema,
  updateBusinessExpenseSchema,
} from "@/lib/validations/business-expense";

export async function addBusinessExpenseAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  if (isCoreFeatureSet()) {
    return { ok: false, error: FULL_FEATURE_UNAVAILABLE };
  }
  const parsed = addBusinessExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const d = parsed.data;
  await db.insert(businessExpenses).values({
    category: d.category,
    amount: String(d.amount),
    currency: d.currency,
    note: d.note?.trim() || null,
    incurredDate: d.incurredDate,
  });
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true };
}

export async function updateBusinessExpenseAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  if (isCoreFeatureSet()) {
    return { ok: false, error: FULL_FEATURE_UNAVAILABLE };
  }
  const parsed = updateBusinessExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const d = parsed.data;
  const [row] = await db
    .update(businessExpenses)
    .set({
      category: d.category,
      amount: String(d.amount),
      currency: d.currency,
      note: d.note?.trim() || null,
      incurredDate: d.incurredDate,
    })
    .where(eq(businessExpenses.id, d.id))
    .returning({ id: businessExpenses.id });
  if (!row) {
    return { ok: false, error: "Expense not found." };
  }
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteBusinessExpenseAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  if (isCoreFeatureSet()) {
    return { ok: false, error: FULL_FEATURE_UNAVAILABLE };
  }
  const parsed = deleteBusinessExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  await db.delete(businessExpenses).where(eq(businessExpenses.id, parsed.data.id));
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true };
}
