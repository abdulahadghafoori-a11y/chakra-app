import { z } from "zod";

import {
  EXPENSE_CATEGORY_COLOR_KEYS,
  EXPENSE_CATEGORY_KINDS,
} from "@/lib/expense-category-colors";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const createExpenseCategorySchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(EXPENSE_CATEGORY_KINDS),
  colorKey: z.enum(EXPENSE_CATEGORY_COLOR_KEYS),
  slug: z
    .string()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens")
    .optional(),
});

export type CreateExpenseCategoryInput = z.infer<
  typeof createExpenseCategorySchema
>;

export function resolveExpenseCategorySlug(
  input: CreateExpenseCategoryInput,
): string {
  const custom = input.slug?.trim();
  if (custom) return custom;
  const base = slugify(input.name);
  return base || `category-${Date.now()}`;
}

export const updateExpenseCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  kind: z.enum(EXPENSE_CATEGORY_KINDS),
  colorKey: z.enum(EXPENSE_CATEGORY_COLOR_KEYS),
  isActive: z.boolean(),
});

export const deactivateExpenseCategorySchema = z.object({
  id: z.string().uuid(),
});
