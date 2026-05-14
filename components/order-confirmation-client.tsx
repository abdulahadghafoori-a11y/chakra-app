"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { OrderConfirmationRow } from "@/actions/order";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  type OrderConfirmClientPayload,
  orderConfirmStorageKey,
} from "@/lib/order-confirmation-storage";
import { getPhonePresentation } from "@/lib/phone-display";
import { cn } from "@/lib/utils";

type Props = {
  orderId: string;
  data: OrderConfirmationRow;
};

export function OrderConfirmationClient({ orderId, data }: Props) {
  const [capiMeta, setCapiMeta] = useState<OrderConfirmClientPayload | null>(
    null,
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(orderConfirmStorageKey(orderId));
      if (!raw) {
        setCapiMeta(null);
        return;
      }
      const parsed = JSON.parse(raw) as OrderConfirmClientPayload;
      setCapiMeta(parsed);
      sessionStorage.removeItem(orderConfirmStorageKey(orderId));
    } catch {
      setCapiMeta(null);
    }
  }, [orderId]);

  const { order, contact, lines } = data;
  const presentation = getPhonePresentation(contact.phoneNumber);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Order confirmed
          </h1>
          <p className="text-muted-foreground break-all font-mono text-sm">
            {order.id}
          </p>
        </div>
        <Link
          href="/orders/new"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "min-h-11 w-full shrink-0 justify-center touch-manipulation sm:min-h-8 sm:w-auto",
          )}
        >
          New order
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Order</CardTitle>
          <CardDescription>
            Status <Badge variant="secondary">{order.status}</Badge>
            {" · "}
            {order.currency} {Number(order.value).toFixed(2)}
            {order.valueAfn != null && order.valueAfn.trim() !== "" ? (
              <>
                {" · "}
                AFN {Math.round(Number(order.valueAfn))} merchandise
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
              Line items
            </p>
            <ul className="space-y-2 text-sm">
              {lines.map((l) => (
                <li
                  key={l.lineIndex}
                  className="flex flex-wrap justify-between gap-2 border-b border-dashed pb-2 last:border-0"
                >
                  <span>
                    {l.productName}{" "}
                    <span className="text-muted-foreground">× {l.quantity}</span>
                  </span>
                  <span className="tabular-nums text-right">
                    <span className="block">
                      {order.currency} {Number(l.lineValue).toFixed(2)}
                    </span>
                    {l.lineValueAfn != null && l.lineValueAfn.trim() !== "" ? (
                      <span className="text-muted-foreground block text-xs">
                        AFN {Math.round(Number(l.lineValueAfn))}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Separator />
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
              Contact
            </p>
            <dl className="grid gap-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd>{contact.name?.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-mono">{presentation.formattedInternational}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Meta Conversions API</CardTitle>
          <CardDescription>
            Last attempt for this order (shown once after redirect).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!capiMeta ? (
            <p className="text-muted-foreground text-sm">
              CAPI details are not available (open this page from the order flow,
              or refresh cleared session storage). Sent status in database:{" "}
              <Badge variant={order.capiSent ? "default" : "secondary"}>
                {order.capiSent ? "capi_sent" : "not sent"}
              </Badge>
              {order.capiEventId ? (
                <span className="ml-2 font-mono text-xs">{order.capiEventId}</span>
              ) : null}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sent</span>
                <Badge variant={capiMeta.capiSent ? "default" : "destructive"}>
                  {capiMeta.capiSent ? "yes" : "no"}
                </Badge>
                {capiMeta.capiEventId ? (
                  <span className="font-mono text-xs">
                    event_id {capiMeta.capiEventId}
                  </span>
                ) : null}
              </div>
              {capiMeta.capiError ? (
                <p className="text-destructive text-sm">{capiMeta.capiError}</p>
              ) : null}
              <div>
                <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                  Payload
                </p>
                <pre className="bg-muted/50 max-h-[min(28rem,50vh)] overflow-auto break-words rounded-lg border p-3 text-[0.7rem] leading-relaxed sm:text-xs">
                  {capiMeta.capiPayloadJson}
                </pre>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
