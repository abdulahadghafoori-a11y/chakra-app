import { z } from "zod";

import { APP_CURRENCY } from "@/lib/validations/order";

const amountAfnField = z
  .number()
  .int("Amount in AFN must be a whole number")
  .positive("Enter a positive amount in AFN");

export const addBusinessExpenseSchema = z.object({
  categoryId: z.string().uuid(),
  amountAfn: amountAfnField,
  currency: z.enum([APP_CURRENCY]).default(APP_CURRENCY),
  note: z.string().max(2000).optional(),
  vendor: z.string().max(120).optional(),
  receiptRef: z.string().max(120).optional(),
  incurredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

export type AddBusinessExpenseInput = z.infer<typeof addBusinessExpenseSchema>;

export const updateBusinessExpenseSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  amountAfn: amountAfnField,
  currency: z.enum([APP_CURRENCY]).default(APP_CURRENCY),
  note: z.string().max(2000).optional(),
  vendor: z.string().max(120).optional(),
  receiptRef: z.string().max(120).optional(),
  incurredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const deleteBusinessExpenseSchema = z.object({
  id: z.string().uuid(),
});

export const listBusinessExpensesFilterSchema = z.object({
  categoryId: z.string().uuid().optional(),
  kind: z.string().optional(),
  sinceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  untilDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
