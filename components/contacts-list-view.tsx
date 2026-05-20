import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ContactListRow } from "@/lib/contacts-list";
import { formatDateTimeKabul } from "@/lib/kabul-time";
import { getPhonePresentation } from "@/lib/phone-display";
import { cn } from "@/lib/utils";

type Props = {
  rows: ContactListRow[];
  rankOffset: number;
  emptyMessage: string;
};

function ContactCard({
  row,
  rank,
}: {
  row: ContactListRow;
  rank: number;
}) {
  const phone = getPhonePresentation(row.phoneNumber);
  const lifetime = Number.parseFloat(row.lifetimeValue ?? "0").toFixed(2);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-muted-foreground text-xs tabular-nums">#{rank}</p>
            <p className="truncate font-medium leading-snug">
              {row.name?.trim() || (
                <span className="text-muted-foreground">No name</span>
              )}
            </p>
            <p className="text-muted-foreground font-mono text-xs break-all">
              {phone.formattedInternational}
            </p>
          </div>
          <p className="text-muted-foreground shrink-0 text-right text-xs">
            {row.countryName ?? row.countryCode ?? "—"}
          </p>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 px-4 py-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Sessions</p>
          <p className="font-medium tabular-nums">{row.sessionCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Orders</p>
          <p className="font-medium tabular-nums">{row.orderCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Lifetime (USD)</p>
          <p className="font-medium tabular-nums">{lifetime}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Last order</p>
          <p className="text-xs leading-snug">
            {formatDateTimeKabul(row.lastOrderAt)}
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2 border-t px-4 py-3">
        <Link
          href={`/orders/new?phone=${encodeURIComponent(row.phoneNumber)}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "min-h-11 flex-1 no-underline",
          )}
        >
          New order
        </Link>
        <Link
          href={`/orders?contactId=${encodeURIComponent(row.id)}`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "min-h-11 flex-1 no-underline",
          )}
        >
          Orders
        </Link>
      </CardFooter>
    </Card>
  );
}

export function ContactsListView({ rows, rankOffset, emptyMessage }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border px-4 py-8 text-center text-sm">
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3 md:hidden" aria-label="Contacts list">
        {rows.map((r, i) => (
          <li key={r.id}>
            <ContactCard row={r} rank={rankOffset + i + 1} />
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <div className="overflow-hidden rounded-xl border">
          <Table className="min-w-[48rem]" aria-label="Contacts">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="w-10 text-center align-middle tabular-nums">
                  #
                </TableHead>
                <TableHead scope="col" className="text-center align-middle">
                  Contact
                </TableHead>
                <TableHead scope="col" className="text-center align-middle">
                  Phone
                </TableHead>
                <TableHead scope="col" className="text-center align-middle tabular-nums">
                  Sessions
                </TableHead>
                <TableHead scope="col" className="text-center align-middle tabular-nums">
                  Orders
                </TableHead>
                <TableHead scope="col" className="text-center align-middle">
                  Lifetime (USD)
                </TableHead>
                <TableHead scope="col" className="text-center align-middle">
                  Last order
                </TableHead>
                <TableHead scope="col" className="text-center align-middle">
                  Last CTWA
                </TableHead>
                <TableHead scope="col" className="text-center align-middle">
                  In system
                </TableHead>
                <TableHead scope="col" className="w-[1%] text-center align-middle">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, rowIndex) => {
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
                          href={`/orders?contactId=${encodeURIComponent(r.id)}`}
                        >
                          Orders
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
