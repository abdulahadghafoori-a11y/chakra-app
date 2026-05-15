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
import { listContactsWithStats, CONTACTS_PAGE_SIZE } from "@/lib/contacts-list";
import { formatDateTimeKabul } from "@/lib/kabul-time";
import { getPhonePresentation } from "@/lib/phone-display";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; order?: string; page?: string };

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
  const rankOffset = (page - 1) * CONTACTS_PAGE_SIZE;
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
          time is when the contact first entered the system. Timestamps use{" "}
          <span className="text-foreground font-medium">Kabul</span> (UTC+4:30);
          the database stores UTC.
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
                <TableHead className="w-10 text-center align-middle tabular-nums">
                  #
                </TableHead>
                <TableHead className="text-center align-middle">Contact</TableHead>
                <TableHead className="text-center align-middle">Phone</TableHead>
                <TableHead className="text-center align-middle tabular-nums">
                  Sessions
                </TableHead>
                <TableHead className="text-center align-middle tabular-nums">
                  Orders
                </TableHead>
                <TableHead className="text-center align-middle">
                  Lifetime (USD)
                </TableHead>
                <TableHead className="text-center align-middle">
                  Last order
                </TableHead>
                <TableHead className="text-center align-middle">
                  Last CTWA
                </TableHead>
                <TableHead className="text-center align-middle">
                  <span className="inline-block leading-snug">
                    In system
                  </span>
                </TableHead>
                <TableHead className="w-[1%] text-center align-middle">
                  {" "}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="text-muted-foreground text-center align-middle"
                    colSpan={10}
                  >
                    {q
                      ? "No contacts match this search."
                      : "No contacts yet. WhatsApp CTWA webhooks will create them."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, rowIndex) => {
                  const phone = getPhonePresentation(r.phoneNumber);
                  const lifetime = r.lifetimeValue ?? "0";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground align-middle text-center text-xs tabular-nums">
                        {rankOffset + rowIndex + 1}
                      </TableCell>
                      <TableCell className="max-w-[14rem] min-w-0 align-middle text-center">
                        <div
                          className="line-clamp-2 break-words font-medium leading-snug"
                          title={r.name?.trim() || undefined}
                        >
                          {r.name?.trim() || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        <div
                          className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-snug break-words"
                          title={
                            r.countryName?.trim() ||
                            r.countryCode?.trim() ||
                            undefined
                          }
                        >
                          {r.countryName ?? r.countryCode ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[12rem] align-middle text-center font-mono text-xs leading-snug break-all">
                        {phone.formattedInternational}
                      </TableCell>
                      <TableCell className="align-middle text-center tabular-nums">
                        {r.sessionCount}
                      </TableCell>
                      <TableCell className="align-middle text-center tabular-nums">
                        {r.orderCount}
                      </TableCell>
                      <TableCell className="align-middle text-center font-medium tabular-nums">
                        {Number.parseFloat(lifetime).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[12rem] align-middle text-center text-xs leading-snug whitespace-normal break-words">
                        {formatDateTimeKabul(r.lastOrderAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[12rem] align-middle text-center text-xs leading-snug whitespace-normal break-words">
                        {formatDateTimeKabul(r.lastSessionAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[12rem] align-middle text-center text-xs leading-snug whitespace-normal break-words">
                        {formatDateTimeKabul(r.createTime)}
                      </TableCell>
                      <TableCell className="align-middle text-center">
                        <div className="flex flex-row flex-wrap items-center justify-center gap-2">
                          <Link
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "min-h-11 shrink-0 px-3 sm:min-h-9",
                            )}
                            href={`/orders/new?phone=${encodeURIComponent(r.phoneNumber)}`}
                          >
                            New order
                          </Link>
                          <Link
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "sm" }),
                              "min-h-11 shrink-0 px-3 sm:min-h-9",
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
