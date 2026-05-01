import { z } from "zod";

import { APP_CURRENCY } from "@/lib/validations/order";

export const businessExpenseCategories = [
  "rent",
  "electricity",
  "utilities",
  "other",
] as const;

export type BusinessExpenseCategory = (typeof businessExpenseCategories)[number];

export const addBusinessExpenseSchema = z.object({
  category: z.enum(businessExpenseCategories),
  amount: z.number().positive(),
  currency: z.enum([APP_CURRENCY]).default(APP_CURRENCY),
  note: z.string().max(2000).optional(),
  incurredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

export type AddBusinessExpenseInput = z.infer<typeof addBusinessExpenseSchema>;

export const updateBusinessExpenseSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(businessExpenseCategories),
  amount: z.number().positive(),
  currency: z.enum([APP_CURRENCY]).default(APP_CURRENCY),
  note: z.string().max(2000).optional(),
  incurredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const deleteBusinessExpenseSchema = z.object({
  id: z.string().uuid(),
});
