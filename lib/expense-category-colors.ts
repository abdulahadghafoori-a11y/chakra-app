import { cn } from "@/lib/utils";

export const EXPENSE_CATEGORY_COLOR_KEYS = [
  "slate",
  "violet",
  "yellow",
  "orange",
  "amber",
  "rose",
  "sky",
  "teal",
  "cyan",
  "fuchsia",
  "indigo",
  "purple",
  "blue",
  "lime",
  "red",
  "emerald",
] as const;

export type ExpenseCategoryColorKey = (typeof EXPENSE_CATEGORY_COLOR_KEYS)[number];

const COLOR_CLASS_MAP: Record<ExpenseCategoryColorKey, string> = {
  slate:
    "border-slate-500/40 bg-slate-500/12 text-slate-900 dark:text-slate-100",
  violet:
    "border-violet-500/45 bg-violet-500/15 text-violet-950 dark:text-violet-100",
  yellow:
    "border-yellow-500/45 bg-yellow-500/15 text-yellow-950 dark:text-yellow-100",
  orange:
    "border-orange-500/45 bg-orange-500/15 text-orange-950 dark:text-orange-100",
  amber:
    "border-amber-500/45 bg-amber-500/15 text-amber-950 dark:text-amber-100",
  rose: "border-rose-500/45 bg-rose-500/15 text-rose-950 dark:text-rose-100",
  sky: "border-sky-500/45 bg-sky-500/15 text-sky-950 dark:text-sky-100",
  teal: "border-teal-500/45 bg-teal-500/15 text-teal-950 dark:text-teal-100",
  cyan: "border-cyan-500/45 bg-cyan-500/15 text-cyan-950 dark:text-cyan-100",
  fuchsia:
    "border-fuchsia-500/45 bg-fuchsia-500/15 text-fuchsia-950 dark:text-fuchsia-100",
  indigo:
    "border-indigo-500/45 bg-indigo-500/15 text-indigo-950 dark:text-indigo-100",
  purple:
    "border-purple-500/45 bg-purple-500/15 text-purple-950 dark:text-purple-100",
  blue: "border-blue-500/45 bg-blue-500/15 text-blue-950 dark:text-blue-100",
  lime: "border-lime-500/45 bg-lime-500/15 text-lime-950 dark:text-lime-100",
  red: "border-red-500/45 bg-red-500/15 text-red-950 dark:text-red-100",
  emerald:
    "border-emerald-600/40 bg-emerald-600/12 text-emerald-950 dark:text-emerald-100",
};

export const EXPENSE_CATEGORY_KINDS = [
  "overhead",
  "operations",
  "vehicle",
  "facilities",
  "other",
] as const;

export type ExpenseCategoryKind = (typeof EXPENSE_CATEGORY_KINDS)[number];

export function isExpenseCategoryColorKey(v: string): v is ExpenseCategoryColorKey {
  return (EXPENSE_CATEGORY_COLOR_KEYS as readonly string[]).includes(v);
}

export function expenseCategoryBadgeClass(colorKey: string): string {
  if (isExpenseCategoryColorKey(colorKey)) {
    return COLOR_CLASS_MAP[colorKey];
  }
  return COLOR_CLASS_MAP.slate;
}

export function formatExpenseCategoryKind(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function expenseCategoryBadge(
  colorKey: string,
  className?: string,
): string {
  return cn(
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
    expenseCategoryBadgeClass(colorKey),
    className,
  );
}
