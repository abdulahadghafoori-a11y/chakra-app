import Link from "next/link";
import { redirect } from "next/navigation";

import { ContactsToolbar } from "@/components/contacts-toolbar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listContactsWithStats } from "@/lib/contacts-list";
import { getPhonePresentation } from "@/lib/phone-display";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; order?: string; page?: string };

/** DB driver may return `Date` or ISO strings for `sql\`max(...)\`` columns. */
function formatWhen(d: Date | string | null | undefined) {
  if (d == null || d === "") return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatCreated(d: Date | string) {
  return formatWhen(d);
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim() || undefined;
  const order = sp.order === "oldest" ? "oldest" : "newest";
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { rows, total, page } = await listContactsWithStats({
    q,
    order,
    page: requestedPage,
  });
  if (total > 0 && requestedPage !== page) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("order", order);
    p.set("page", String(page));
    redirect(`/contacts?${p.toString()}`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Contacts
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Search WhatsApp contacts, CTWA session counts, and order history. Created
          time is when the contact first entered the system.
        </p>
      </div>

      <ContactsToolbar
        initialQ={q ?? ""}
        order={order}
        page={page}
        total={total}
      />

      <div className="-mx-3 overflow-x-auto sm:mx-0">
        <div className="inline-block min-w-full overflow-hidden rounded-xl border align-middle">
          <Table className="min-w-[48rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right tabular-nums">Sessions</TableHead>
                <TableHead className="text-right tabular-nums">Orders</TableHead>
                <TableHead className="text-right">Lifetime (USD)</TableHead>
                <TableHead>Last order</TableHead>
                <TableHead>Last CTWA</TableHead>
                <TableHead>
                  <span className="whitespace-nowrap">In system</span>
                </TableHead>
                <TableHead className="w-[1%]"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="text-muted-foreground"
                    colSpan={9}
                  >
                    {q
                      ? "No contacts match this search."
                      : "No contacts yet. WhatsApp CTWA webhooks will create them."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const phone = getPhonePresentation(r.phoneNumber);
                  const lifetime = r.lifetimeValue ?? "0";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="max-w-[12rem] font-medium">
                          {r.name?.trim() || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {r.countryName ?? r.countryCode ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[11rem] font-mono text-xs">
                        {phone.formattedInternational}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.sessionCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.orderCount}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {Number.parseFloat(lifetime).toFixed(2)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatWhen(r.lastOrderAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatWhen(r.lastSessionAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatCreated(r.createTime)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end sm:gap-1">
                          <Link
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "h-8",
                            )}
                            href={`/orders/new?phone=${encodeURIComponent(r.phoneNumber)}`}
                          >
                            New order
                          </Link>
                          <Link
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "sm" }),
                              "h-8",
                            )}
                            href={`/?contactId=${encodeURIComponent(r.id)}`}
                          >
                            Orders
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

    </div>
  );
}
