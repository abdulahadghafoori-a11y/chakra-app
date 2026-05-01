import Link from "next/link";

import { ExpensesClient } from "@/app/expenses/expenses-client";
import { buttonVariants } from "@/components/ui/button";
import { loadBusinessExpensesForList } from "@/lib/business-expenses-list";
import { APP_CURRENCY } from "@/lib/validations/order";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const rows = await loadBusinessExpensesForList(500);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/"
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Business expenses
          </h1>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Overhead (rent, electricity, etc.) in {APP_CURRENCY}. Not tied to
            orders or campaign rollups.
          </p>
        </div>
        <Link
          href="/orders"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 self-start",
          )}
        >
          Orders
        </Link>
      </div>
      <ExpensesClient rows={rows} />
    </div>
  );
}
