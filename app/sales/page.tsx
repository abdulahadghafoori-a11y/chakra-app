import Link from "next/link";

import { Badge } from "@/components/ui/badge";
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
import { SalesSignOutButton } from "@/components/sales-sign-out-button";
import { listSalesInboxConversations } from "@/lib/sales-inbox/data";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = {
  stage?: string;
  lead?: string;
  preset?: string;
};

function withSalesQuery(path: string, extra: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) {
    if (v) p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

export default async function SalesInboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const presetRaw = sp.preset?.trim() ?? "all";
  const preset =
    presetRaw === "handoff" ||
    presetRaw === "ready" ||
    presetRaw === "unanswered"
      ? presetRaw
      : "all";
  const stage = sp.stage?.trim() || undefined;
  const lead = sp.lead?.trim() || undefined;

  const rows = await listSalesInboxConversations({
    stage,
    lead,
    preset,
  });

  const base = "/sales";

  const filterLink = (
    label: string,
    active: boolean,
    href: string,
    variant: "default" | "outline" | "ghost" = "outline",
  ) => (
    <Link
      href={href}
      className={cn(
        buttonVariants({
          variant: active ? "default" : variant,
          size: "sm",
        }),
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales inbox</h1>
        <p className="text-muted-foreground text-sm">
          WhatsApp sales conversations, lead scores, and draft orders.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link
            href={withSalesQuery("/sales/knowledge", {})}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Business knowledge
          </Link>
          <Link
            href="/campaigns"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Campaigns
          </Link>
          <SalesSignOutButton />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Presets combine with stage / lead when set.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {filterLink(
            "All",
            preset === "all",
            withSalesQuery(base, { stage, lead }),
          )}
          {filterLink(
            "Handoff",
            preset === "handoff",
            withSalesQuery(base, { preset: "handoff", stage, lead }),
          )}
          {filterLink(
            "Ready for order",
            preset === "ready",
            withSalesQuery(base, { preset: "ready", stage, lead }),
          )}
          {filterLink(
            "Unanswered",
            preset === "unanswered",
            withSalesQuery(base, {
              preset: "unanswered",
              stage,
              lead,
            }),
          )}
          {filterLink(
            "Stage: confirming",
            false,
            withSalesQuery(base, {
              preset,
              lead,
              stage: "confirming_order",
            }),
          )}
          {filterLink(
            "Lead hot",
            false,
            withSalesQuery(base, { preset, stage, lead: "hot" }),
          )}
          {filterLink(
            "Clear stage/lead",
            false,
            withSalesQuery(base, {}),
            "ghost",
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversations</CardTitle>
          <CardDescription>{rows.length} rows (max 200)</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Updated</TableHead>
                <TableHead>Phone / WA</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last</TableHead>
                <TableHead className="text-end">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No conversations match.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {r.contactPhone ?? r.waId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.stage}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.leadScore ? (
                        <Badge variant="outline">{r.leadScore}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell className="text-sm">
                      {r.lastRole ?? "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <Link
                        href={withSalesQuery(`${base}/${r.id}`, {})}
                        className={cn(buttonVariants({ variant: "link", size: "sm" }))}
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
