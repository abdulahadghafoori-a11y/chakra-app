"use client";

import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { NewOrderContactOrderRow } from "@/actions/order";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatContactOrderProductsSummary,
  formatOrderStatusLabel,
  formatOrderUsdTable,
} from "@/lib/orders-list";
import { formatDateTimeKabul } from "@/lib/kabul-time";
import { cn } from "@/lib/utils";

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid" || status === "confirmed" || status === "shipped") {
    return "default";
  }
  if (status === "cancelled" || status === "returned") {
    return "destructive";
  }
  return "secondary";
}

function formatCollapsedOrderSummary(o: NewOrderContactOrderRow): string {
  const valuePart = o.valueAfn
    ? `${formatOrderUsdTable(o.valueUsd)} ${o.currency} · ${o.valueAfn} AFN`
    : `${formatOrderUsdTable(o.valueUsd)} ${o.currency}`;
  const parts = [
    formatOrderStatusLabel(o.status),
    valuePart,
    formatContactOrderProductsSummary(o.lines),
    formatDateTimeKabul(new Date(o.orderEventAtIso)),
  ];
  return parts.join(" · ");
}

export function ContactExistingOrders({
  orders,
  loading,
  contactId,
}: {
  orders: NewOrderContactOrderRow[];
  loading: boolean;
  contactId: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [contactId]);

  if (loading) {
    return (
      <p className="text-muted-foreground text-xs">Loading existing orders…</p>
    );
  }

  if (orders.length === 0) {
    return (
      <p className="text-muted-foreground text-xs leading-relaxed">
        No previous orders for this contact in the system.
      </p>
    );
  }

  const panelId = "contact-existing-orders-panel";

  return (
    <div className="min-w-0 space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground -ml-2 h-8 w-full justify-between gap-2 px-2 text-xs font-medium tracking-wide uppercase"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          Existing orders ({orders.length})
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 opacity-70 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </Button>

      {!open ? (
        <ul className="space-y-1.5 text-xs leading-snug">
          {orders.map((o) => (
            <li key={o.id} className="min-w-0">
              <Link
                href={`/orders/${encodeURIComponent(o.id)}`}
                className="font-mono font-medium tabular-nums underline-offset-2 hover:underline"
              >
                {o.id}
              </Link>
              <span className="text-muted-foreground">
                {" "}
                — {formatCollapsedOrderSummary(o)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div id={panelId} className="space-y-2">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {orders.length} recent order{orders.length === 1 ? "" : "s"} for this
            number — cross-check before submitting.
          </p>
          <ul className="max-h-56 space-y-2 overflow-y-auto overscroll-contain rounded-lg border bg-muted/20 p-2">
            {orders.map((o) => (
              <li
                key={o.id}
                className="bg-card flex min-w-0 flex-col gap-1 rounded-md border px-2.5 py-2 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/orders/${encodeURIComponent(o.id)}`}
                    className="font-mono font-medium tabular-nums underline-offset-2 hover:underline"
                  >
                    {o.id}
                  </Link>
                  <dl className="text-muted-foreground mt-1 grid gap-0.5 text-[11px] leading-snug">
                    <div className="flex flex-wrap gap-x-2 gap-y-0">
                      <dt className="shrink-0">Campaign</dt>
                      <dd className="text-foreground min-w-0">
                        {o.campaignName ? (
                          <>
                            {o.campaignVia === "manual" ? (
                              <span className="text-muted-foreground">
                                Manual ·{" "}
                              </span>
                            ) : o.campaignVia === "ctwa" ? (
                              <span className="text-muted-foreground">CTWA · </span>
                            ) : null}
                            {o.campaignName}
                          </>
                        ) : o.ctwaSessionUnlinked ? (
                          <span className="text-muted-foreground italic">
                            CTWA session (campaign not linked)
                          </span>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="shrink-0">Products</dt>
                      <dd className="text-foreground mt-0.5 leading-snug">
                        {formatContactOrderProductsSummary(o.lines)}
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0">
                      <dt className="shrink-0">Order event</dt>
                      <dd className="text-foreground tabular-nums">
                        {formatDateTimeKabul(new Date(o.orderEventAtIso))}
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0">
                      <dt className="shrink-0">Recorded</dt>
                      <dd className="text-foreground tabular-nums">
                        {formatDateTimeKabul(new Date(o.createdAtIso))}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={statusBadgeVariant(o.status)}
                    className="text-[10px]"
                  >
                    {formatOrderStatusLabel(o.status)}
                  </Badge>
                  <span className="font-medium tabular-nums">
                    {formatOrderUsdTable(o.valueUsd)} {o.currency}
                    {o.valueAfn ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {o.valueAfn} AFN
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wide",
                      o.capiSent
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    CAPI {o.capiSent ? "sent" : "—"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-[11px]">
            <Link
              href={`/orders?contactId=${encodeURIComponent(contactId)}`}
              className="text-foreground underline underline-offset-2"
            >
              All orders for this contact
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
