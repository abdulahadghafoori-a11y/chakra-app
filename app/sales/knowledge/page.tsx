import Link from "next/link";
import { redirect } from "next/navigation";

import { SalesSignOutButton } from "@/components/sales-sign-out-button";
import { TablePagination } from "@/components/table-pagination";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listBusinessKnowledgeSummariesPage } from "@/lib/knowledge/business-knowledge";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePage,
} from "@/lib/table-pagination";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = { page?: string };

export default async function SalesKnowledgeIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const requestedPage = parseTablePage(sp.page);
  const { rows, total, page } = await listBusinessKnowledgeSummariesPage({
    page: requestedPage,
  });
  if (total > 0 && requestedPage !== page) {
    redirect(`/sales/knowledge?page=${page}`);
  }
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_TABLE_PAGE_SIZE));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/sales"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Sales inbox
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/sales/knowledge/new"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            New article
          </Link>
          <SalesSignOutButton />
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Business knowledge
        </h1>
        <p className="text-muted-foreground text-sm">
          Articles in Postgres (<code className="text-xs">business_knowledge</code>
          ). The sales agent reads these via tools — not from code.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Articles</CardTitle>
          <CardDescription>
            Slugs like <code>payment</code>, <code>shipping</code> map to{" "}
            <code>get_store_policy</code>; add custom slugs anytime.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sort</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-end">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No rows. Run migration 0018 or add an article.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.slug}>
                    <TableCell className="tabular-nums">{r.sortOrder}</TableCell>
                    <TableCell className="font-mono text-sm">{r.slug}</TableCell>
                    <TableCell>{r.title ?? "—"}</TableCell>
                    <TableCell className="text-end">
                      <Link
                        href={`/sales/knowledge/${encodeURIComponent(r.slug)}`}
                        className={cn(buttonVariants({ variant: "link", size: "sm" }))}
                      >
                        Edit
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            pageCount={pageCount}
            total={total}
            itemLabel="articles"
            className="mt-4"
          />
        </CardContent>
      </Card>
    </div>
  );
}
