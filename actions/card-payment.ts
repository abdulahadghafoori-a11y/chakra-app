"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  businessExpenses,
  cardPayments,
  expenseCategories,
} from "@/drizzle/schema";
import { buildCardFxReconciliation } from "@/lib/card-payment-fx-reconcile";
import { db } from "@/lib/db";
import { afnInputToStoredUsd, resolveFinanceFx } from "@/lib/finance-fx";
import { sumMetaInsightsSpendUsd } from "@/lib/meta-insights-spend";
import { assertStaffSession } from "@/lib/staff-auth/guard";
import {
  addCardPaymentSchema,
  deleteCardPaymentSchema,
  previewCardReconciliationSchema,
  updateCardPaymentSchema,
} from "@/lib/validations/card-payment";

async function assertActiveCategory(categoryId: string): Promise<string | null> {
  const [cat] = await db
    .select({ id: expenseCategories.id, isActive: expenseCategories.isActive })
    .from(expenseCategories)
    .where(eq(expenseCategories.id, categoryId))
    .limit(1);
  if (!cat) return "Category not found.";
  if (!cat.isActive) return "That category is inactive.";
  return null;
}

async function resolveInsightsReconcileFields(input: {
  insightsPeriodStart?: string;
  insightsPeriodEnd?: string;
  cardAmountUsd: string;
}): Promise<{
  insightsPeriodStart: string | null;
  insightsPeriodEnd: string | null;
  insightsSpendUsd: string | null;
  cashScaleFactor: string | null;
}> {
  const start = input.insightsPeriodStart?.trim();
  const end = input.insightsPeriodEnd?.trim();
  if (!start || !end) {
    return {
      insightsPeriodStart: null,
      insightsPeriodEnd: null,
      insightsSpendUsd: null,
      cashScaleFactor: null,
    };
  }
  if (start > end) {
    return {
      insightsPeriodStart: null,
      insightsPeriodEnd: null,
      insightsSpendUsd: null,
      cashScaleFactor: null,
    };
  }

  const insightsSpendUsd = await sumMetaInsightsSpendUsd(start, end);
  const cardUsd = Number.parseFloat(input.cardAmountUsd);
  const cashScaleFactor =
    insightsSpendUsd > 0 && Number.isFinite(cardUsd)
      ? cardUsd / insightsSpendUsd
      : null;

  return {
    insightsPeriodStart: start,
    insightsPeriodEnd: end,
    insightsSpendUsd: insightsSpendUsd.toFixed(4),
    cashScaleFactor:
      cashScaleFactor != null ? cashScaleFactor.toFixed(6) : null,
  };
}

export async function previewCardPaymentReconciliationAction(
  raw: unknown,
): Promise<
  | { ok: true; reconciliation: Awaited<ReturnType<typeof buildCardFxReconciliation>> }
  | { ok: false; error: string }
> {
  await assertStaffSession();
  const parsed = previewCardReconciliationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  if (parsed.data.insightsPeriodStart > parsed.data.insightsPeriodEnd) {
    return { ok: false, error: "Insights period start must be before end." };
  }

  const fx = await resolveFinanceFx();
  if ("error" in fx) return { ok: false, error: fx.error };
  const conv = afnInputToStoredUsd(parsed.data.amountAfn, fx.afnPerOneUsd);
  if ("error" in conv) return { ok: false, error: conv.error };

  const reconciliation = await buildCardFxReconciliation({
    insightsPeriodStart: parsed.data.insightsPeriodStart,
    insightsPeriodEnd: parsed.data.insightsPeriodEnd,
    cardAmountUsd: Number.parseFloat(conv.amountUsd),
    cardAmountAfn: conv.amountAfnWhole,
    afnPerUsdSnapshot: fx.afnPerOneUsd,
  });

  return { ok: true, reconciliation };
}

export async function addCardPaymentAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = addCardPaymentSchema.safeParse(raw);
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

  const payee = parsed.data.payee.trim();
  const note = parsed.data.note?.trim() || null;
  const statementRef = parsed.data.statementRef?.trim() || null;
  const externalRef = parsed.data.externalRef?.trim() || null;

  const reconcile = await resolveInsightsReconcileFields({
    insightsPeriodStart: parsed.data.insightsPeriodStart,
    insightsPeriodEnd: parsed.data.insightsPeriodEnd,
    cardAmountUsd: conv.amountUsd,
  });

  const baseValues = {
    categoryId: parsed.data.categoryId,
    paidAt: parsed.data.paidAt,
    payee,
    amount: conv.amountUsd,
    amountAfn: String(conv.amountAfnWhole),
    afnPerUsdSnapshot: fx.snapshot,
    currency: parsed.data.currency,
    statementRef,
    externalRef,
    note,
    ...reconcile,
  };

  if (parsed.data.alsoCreateExpense) {
    const [exp] = await db
      .insert(businessExpenses)
      .values({
        categoryId: parsed.data.categoryId,
        amount: conv.amountUsd,
        amountAfn: String(conv.amountAfnWhole),
        afnPerUsdSnapshot: fx.snapshot,
        currency: parsed.data.currency,
        vendor: payee,
        receiptRef: externalRef ?? statementRef,
        note: note
          ? `Card charge · ${note}`
          : "Card charge (mirrored from card payments)",
        incurredDate: parsed.data.paidAt,
      })
      .returning({ id: businessExpenses.id });

    await db.insert(cardPayments).values({
      ...baseValues,
      linkedExpenseId: exp?.id ?? null,
    });
  } else {
    await db.insert(cardPayments).values(baseValues);
  }

  revalidatePath("/finance/card-payments");
  revalidatePath("/finance");
  revalidatePath("/finance/products");
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true };
}

export async function updateCardPaymentAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = updateCardPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const [existing] = await db
    .select()
    .from(cardPayments)
    .where(eq(cardPayments.id, parsed.data.id))
    .limit(1);
  if (!existing) return { ok: false, error: "Card payment not found." };

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

  const payee = parsed.data.payee.trim();
  const note = parsed.data.note?.trim() || null;
  const statementRef = parsed.data.statementRef?.trim() || null;
  const externalRef = parsed.data.externalRef?.trim() || null;

  const reconcile = await resolveInsightsReconcileFields({
    insightsPeriodStart: parsed.data.insightsPeriodStart,
    insightsPeriodEnd: parsed.data.insightsPeriodEnd,
    cardAmountUsd: conv.amountUsd,
  });

  await db
    .update(cardPayments)
    .set({
      categoryId: parsed.data.categoryId,
      paidAt: parsed.data.paidAt,
      payee,
      amount: conv.amountUsd,
      amountAfn: String(conv.amountAfnWhole),
      afnPerUsdSnapshot: fx.snapshot,
      currency: parsed.data.currency,
      statementRef,
      externalRef,
      note,
      ...reconcile,
    })
    .where(eq(cardPayments.id, parsed.data.id));

  if (parsed.data.alsoUpdateLinkedExpense && existing.linkedExpenseId) {
    await db
      .update(businessExpenses)
      .set({
        categoryId: parsed.data.categoryId,
        amount: conv.amountUsd,
        amountAfn: String(conv.amountAfnWhole),
        afnPerUsdSnapshot: fx.snapshot,
        vendor: payee,
        receiptRef: externalRef ?? statementRef,
        incurredDate: parsed.data.paidAt,
      })
      .where(eq(businessExpenses.id, existing.linkedExpenseId));
  }

  revalidatePath("/finance/card-payments");
  revalidatePath("/finance");
  revalidatePath("/finance/products");
  revalidatePath("/expenses");
  return { ok: true };
}

export async function deleteCardPaymentAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = deleteCardPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const [existing] = await db
    .select({ linkedExpenseId: cardPayments.linkedExpenseId })
    .from(cardPayments)
    .where(eq(cardPayments.id, parsed.data.id))
    .limit(1);
  if (!existing) return { ok: false, error: "Card payment not found." };

  if (parsed.data.deleteLinkedExpense && existing.linkedExpenseId) {
    await db
      .delete(businessExpenses)
      .where(eq(businessExpenses.id, existing.linkedExpenseId));
  }

  await db.delete(cardPayments).where(eq(cardPayments.id, parsed.data.id));

  revalidatePath("/finance/card-payments");
  revalidatePath("/finance");
  revalidatePath("/finance/products");
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true };
}
