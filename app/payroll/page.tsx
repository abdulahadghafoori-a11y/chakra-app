import Link from "next/link";
import { redirect } from "next/navigation";

import { PayrollClient } from "@/app/payroll/payroll-client";
import { TablePagination } from "@/components/table-pagination";
import { buttonVariants } from "@/components/ui/button";
import { getCachedPublicFxForOrderForm } from "@/lib/cached-reads";
import {
  loadEmployees,
  loadPayrollPaymentsForList,
} from "@/lib/payroll-list";
import { getStaffSessionOptional } from "@/lib/staff-auth/guard";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePage,
} from "@/lib/table-pagination";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = { page?: string; employeeId?: string };

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const requestedPage = parseTablePage(sp.page);
  const employeeId = sp.employeeId?.trim() || undefined;

  const [session, fxState, employees, paymentsResult] = await Promise.all([
    getStaffSessionOptional(),
    getCachedPublicFxForOrderForm(),
    loadEmployees(),
    loadPayrollPaymentsForList({ page: requestedPage, employeeId }),
  ]);
  const { rows: payments, total, page } = paymentsResult;
  if (total > 0 && requestedPage !== page) {
    const p = new URLSearchParams();
    if (employeeId) p.set("employeeId", employeeId);
    p.set("page", String(page));
    redirect(`/payroll?${p.toString()}`);
  }
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_TABLE_PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/finance"
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            ← Finance
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Payroll
          </h1>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Record wage payments in AFN; amounts are stored in USD using the FX
            rate at save time.
          </p>
        </div>
        <Link
          href="/expenses"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 self-start",
          )}
        >
          Expenses
        </Link>
      </div>
      <PayrollClient
        employees={employees}
        payments={payments}
        initialFx={fxState}
        canStaffEditFx={Boolean(session)}
      />
      <TablePagination
        page={page}
        pageCount={pageCount}
        total={total}
        itemLabel="payments"
        preserveKeys={["employeeId"]}
      />
    </div>
  );
}
