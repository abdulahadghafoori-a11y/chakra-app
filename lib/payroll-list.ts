import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";

import { employees, payrollPayments } from "@/drizzle/schema";
import { db } from "@/lib/db";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  resolveTablePage,
} from "@/lib/table-pagination";

export type EmployeeRow = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
};

export type PayrollPaymentRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  paidAt: string;
  periodLabel: string | null;
  amount: string;
  amountAfn: string;
  currency: string;
  note: string | null;
  createdAt: Date;
};

export async function loadEmployees(): Promise<EmployeeRow[]> {
  const rows = await db
    .select()
    .from(employees)
    .orderBy(desc(employees.isActive), employees.name);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    phone: r.phone,
    isActive: r.isActive,
    notes: r.notes,
    createdAt: r.createdAt,
  }));
}

export async function loadPayrollPaymentsForList(input: {
  page: number;
  pageSize?: number;
  employeeId?: string;
}): Promise<{ rows: PayrollPaymentRow[]; total: number; page: number }> {
  const pageSize = Math.min(
    Math.max(1, input.pageSize ?? DEFAULT_TABLE_PAGE_SIZE),
    100,
  );
  const conditions = [];
  if (input.employeeId) {
    conditions.push(eq(payrollPayments.employeeId, input.employeeId));
  }
  const wherePart =
    conditions.length > 0 ? and(...conditions) : undefined;

  const countBase = db
    .select({ n: count() })
    .from(payrollPayments)
    .innerJoin(employees, eq(payrollPayments.employeeId, employees.id));
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
      id: payrollPayments.id,
      employeeId: payrollPayments.employeeId,
      employeeName: employees.name,
      paidAt: payrollPayments.paidAt,
      periodLabel: payrollPayments.periodLabel,
      amount: payrollPayments.amount,
      amountAfn: payrollPayments.amountAfn,
      currency: payrollPayments.currency,
      note: payrollPayments.note,
      createdAt: payrollPayments.createdAt,
    })
    .from(payrollPayments)
    .innerJoin(employees, eq(payrollPayments.employeeId, employees.id));

  const rows = await (wherePart ? listBase.where(wherePart) : listBase)
    .orderBy(desc(payrollPayments.paidAt), desc(payrollPayments.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      paidAt: r.paidAt,
      periodLabel: r.periodLabel,
      amount: String(r.amount),
      amountAfn: String(r.amountAfn),
      currency: r.currency,
      note: r.note,
      createdAt: r.createdAt,
    })),
    total,
    page,
  };
}

export async function sumPayrollUsd(input: {
  sinceDate: string;
  untilDate: string;
}): Promise<string> {
  const [row] = await db
    .select({
      s: sql<string>`coalesce(sum(${payrollPayments.amount}::numeric), 0)::text`,
    })
    .from(payrollPayments)
    .where(
      and(
        gte(payrollPayments.paidAt, input.sinceDate),
        lte(payrollPayments.paidAt, input.untilDate),
      ),
    );
  return row?.s ?? "0";
}
