"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { businessExpenses, expenseCategories } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { assertStaffSession } from "@/lib/staff-auth/guard";
import {
  createExpenseCategorySchema,
  deactivateExpenseCategorySchema,
  resolveExpenseCategorySlug,
  updateExpenseCategorySchema,
} from "@/lib/validations/expense-category";

export type ExpenseCategoryOption = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  colorKey: string;
  isActive: boolean;
  sortOrder: number;
};

export async function listExpenseCategories(
  activeOnly = false,
): Promise<ExpenseCategoryOption[]> {
  await assertStaffSession();

  const rows = await db
    .select()
    .from(expenseCategories)
    .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));

  return rows
    .filter((r) => !activeOnly || r.isActive)
    .map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      kind: r.kind,
      colorKey: r.colorKey,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    }));
}

export async function createExpenseCategoryAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = createExpenseCategorySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const slug = resolveExpenseCategorySlug(parsed.data);
  try {
    await db.insert(expenseCategories).values({
      name: parsed.data.name.trim(),
      slug,
      kind: parsed.data.kind,
      colorKey: parsed.data.colorKey,
      isActive: true,
      sortOrder: 0,
    });
  } catch {
    return {
      ok: false,
      error: "Could not create category. Name or slug may already exist.",
    };
  }
  revalidatePath("/expenses");
  revalidatePath("/finance");
  return { ok: true };
}

export async function updateExpenseCategoryAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = updateExpenseCategorySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const [row] = await db
    .update(expenseCategories)
    .set({
      name: parsed.data.name.trim(),
      kind: parsed.data.kind,
      colorKey: parsed.data.colorKey,
      isActive: parsed.data.isActive,
    })
    .where(eq(expenseCategories.id, parsed.data.id))
    .returning({ id: expenseCategories.id });
  if (!row) {
    return { ok: false, error: "Category not found." };
  }
  revalidatePath("/expenses");
  revalidatePath("/finance");
  return { ok: true };
}

export async function deactivateExpenseCategoryAction(
  raw: unknown,
): Promise<
  | { ok: true; outcome: "deleted" | "deactivated" }
  | { ok: false; error: string }
> {
  await assertStaffSession();
  const parsed = deactivateExpenseCategorySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const [existing] = await db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.id, parsed.data.id))
    .limit(1);
  if (!existing) {
    return { ok: false, error: "Category not found." };
  }
  const [inUse] = await db
    .select({ id: businessExpenses.id })
    .from(businessExpenses)
    .where(eq(businessExpenses.categoryId, parsed.data.id))
    .limit(1);
  if (inUse) {
    await db
      .update(expenseCategories)
      .set({ isActive: false })
      .where(eq(expenseCategories.id, parsed.data.id));
    revalidatePath("/expenses");
    revalidatePath("/finance");
    return { ok: true, outcome: "deactivated" };
  }
  await db
    .delete(expenseCategories)
    .where(eq(expenseCategories.id, parsed.data.id));
  revalidatePath("/expenses");
  revalidatePath("/finance");
  return { ok: true, outcome: "deleted" };
}
