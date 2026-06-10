import { z } from "zod";

import { APP_CURRENCY } from "@/lib/validations/order";

const amountAfnField = z
  .number()
  .int("Amount in AFN must be a whole number")
  .positive("Enter a positive amount in AFN");

export const CARD_PAYEE_PRESETS = [
  "Meta",
  "Subscription / SaaS",
  "Bank fee",
  "Other",
] as const;

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const addCardPaymentSchema = z.object({
  categoryId: z.string().uuid(),
  paidAt: dateField,
  payee: z.string().min(1).max(120),
  amountAfn: amountAfnField,
  currency: z.enum([APP_CURRENCY]).default(APP_CURRENCY),
  statementRef: z.string().max(120).optional(),
  externalRef: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
  /** Meta Insights date range this bank charge covers (recommended for Meta payee). */
  insightsPeriodStart: dateField.optional(),
  insightsPeriodEnd: dateField.optional(),
  /** Mirror the same charge in business expenses (same date & amount). */
  alsoCreateExpense: z.boolean().optional().default(false),
});

export const previewCardReconciliationSchema = z.object({
  insightsPeriodStart: dateField,
  insightsPeriodEnd: dateField,
  amountAfn: amountAfnField,
});

export const updateCardPaymentSchema = addCardPaymentSchema
  .omit({ alsoCreateExpense: true })
  .extend({
    id: z.string().uuid(),
    alsoUpdateLinkedExpense: z.boolean().optional().default(true),
  });

export const deleteCardPaymentSchema = z.object({
  id: z.string().uuid(),
  deleteLinkedExpense: z.boolean().optional().default(true),
});
