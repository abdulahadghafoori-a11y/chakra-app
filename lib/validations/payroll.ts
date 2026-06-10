import { z } from "zod";

import { APP_CURRENCY } from "@/lib/validations/order";

const amountAfnField = z
  .number()
  .int("Amount in AFN must be a whole number")
  .positive("Enter a positive amount in AFN");

export const createEmployeeSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.extend({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export const addPayrollPaymentSchema = z.object({
  employeeId: z.string().uuid(),
  amountAfn: amountAfnField,
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  periodLabel: z.string().max(80).optional(),
  note: z.string().max(2000).optional(),
  currency: z.enum([APP_CURRENCY]).default(APP_CURRENCY),
});

export const updatePayrollPaymentSchema = addPayrollPaymentSchema.extend({
  id: z.string().uuid(),
});

export const deletePayrollPaymentSchema = z.object({
  id: z.string().uuid(),
});
