"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { employees, payrollPayments } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { afnInputToStoredUsd, resolveFinanceFx } from "@/lib/finance-fx";
import { assertStaffSession } from "@/lib/staff-auth/guard";
import {
  addPayrollPaymentSchema,
  createEmployeeSchema,
  deletePayrollPaymentSchema,
  updateEmployeeSchema,
  updatePayrollPaymentSchema,
} from "@/lib/validations/payroll";

export async function createEmployeeAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = createEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  await db.insert(employees).values({
    name: parsed.data.name.trim(),
    role: parsed.data.role?.trim() || null,
    phone: parsed.data.phone?.trim() || null,
    notes: parsed.data.notes?.trim() || null,
    isActive: true,
  });
  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { ok: true };
}

export async function updateEmployeeAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = updateEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const [row] = await db
    .update(employees)
    .set({
      name: parsed.data.name.trim(),
      role: parsed.data.role?.trim() || null,
      phone: parsed.data.phone?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      isActive: parsed.data.isActive,
    })
    .where(eq(employees.id, parsed.data.id))
    .returning({ id: employees.id });
  if (!row) return { ok: false, error: "Employee not found." };
  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { ok: true };
}

export async function addPayrollPaymentAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = addPayrollPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const [emp] = await db
    .select({ id: employees.id, isActive: employees.isActive })
    .from(employees)
    .where(eq(employees.id, parsed.data.employeeId))
    .limit(1);
  if (!emp) return { ok: false, error: "Employee not found." };
  if (!emp.isActive) {
    return { ok: false, error: "Cannot pay an inactive employee." };
  }

  const fx = await resolveFinanceFx();
  if ("error" in fx) return { ok: false, error: fx.error };
  const conv = afnInputToStoredUsd(parsed.data.amountAfn, fx.afnPerOneUsd);
  if ("error" in conv) return { ok: false, error: conv.error };

  await db.insert(payrollPayments).values({
    employeeId: parsed.data.employeeId,
    paidAt: parsed.data.paidAt,
    periodLabel: parsed.data.periodLabel?.trim() || null,
    amountAfn: String(conv.amountAfnWhole),
    afnPerUsdSnapshot: fx.snapshot,
    amount: conv.amountUsd,
    currency: parsed.data.currency,
    note: parsed.data.note?.trim() || null,
  });
  revalidatePath("/payroll");
  revalidatePath("/finance");
  revalidatePath("/");
  return { ok: true };
}

export async function updatePayrollPaymentAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = updatePayrollPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const fx = await resolveFinanceFx();
  if ("error" in fx) return { ok: false, error: fx.error };
  const conv = afnInputToStoredUsd(parsed.data.amountAfn, fx.afnPerOneUsd);
  if ("error" in conv) return { ok: false, error: conv.error };

  const [row] = await db
    .update(payrollPayments)
    .set({
      employeeId: parsed.data.employeeId,
      paidAt: parsed.data.paidAt,
      periodLabel: parsed.data.periodLabel?.trim() || null,
      amountAfn: String(conv.amountAfnWhole),
      afnPerUsdSnapshot: fx.snapshot,
      amount: conv.amountUsd,
      currency: parsed.data.currency,
      note: parsed.data.note?.trim() || null,
    })
    .where(eq(payrollPayments.id, parsed.data.id))
    .returning({ id: payrollPayments.id });
  if (!row) return { ok: false, error: "Payment not found." };
  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { ok: true };
}

export async function deletePayrollPaymentAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = deletePayrollPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  await db
    .delete(payrollPayments)
    .where(eq(payrollPayments.id, parsed.data.id));
  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { ok: true };
}
