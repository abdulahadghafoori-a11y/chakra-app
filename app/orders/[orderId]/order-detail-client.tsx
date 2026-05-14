"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteOrder,
  linkOrderManualCampaign,
  prepareResendOrderPurchaseCapi,
  resendOrderPurchaseCapi,
  updateOrderMetadata,
  updateOrderStatus,
} from "@/actions/order";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraftNumericInput } from "@/components/draft-numeric-input";
import { ProvinceSearchCombobox } from "@/components/province-search-combobox";
import { AFGHANISTAN_PROVINCES_OUTSIDE_KABUL } from "@/lib/afghanistan-provinces";
import { getDefaultKabulDateTimeLocal } from "@/lib/kabul-time";
import type { OrderDetail } from "@/lib/order-detail";
import { parseAfnPerOneUsdFromDb } from "@/lib/fx-afn-usd";
import {
  orderStatuses,
  orderStatusEligibleForPurchaseCapi,
  type UpdateOrderStatusInput,
} from "@/lib/validations/order";

import type { MetaCampaignPickerOption } from "@/lib/campaigns-rollups";

const MANUAL_CAMPAIGN_NONE = "__none__";

type Props = {
  order: OrderDetail;
  metaCampaignOptions: MetaCampaignPickerOption[];
};

function money(amount: string, currency: string) {
  const n = Number.parseFloat(amount);
  if (Number.isNaN(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shippingBaseline(order: OrderDetail) {
  const interProvinceAfghanistanDelivery = !!(
    order.deliveryProvinceAfghanistan?.trim() ||
    order.deliveryTrackingNumber?.trim() ||
    Number(order.deliveryCost) > 0
  );
  const deliveryCostAfn =
    order.deliveryCostAfn != null && order.deliveryCostAfn.trim() !== ""
      ? Math.max(0, Math.round(Number(order.deliveryCostAfn)))
      : 0;
  return {
    interProvinceAfghanistanDelivery,
    deliveryProvinceAfghanistan: order.deliveryProvinceAfghanistan ?? "",
    deliveryTrackingNumber: order.deliveryTrackingNumber ?? "",
    deliveryCost: interProvinceAfghanistanDelivery ? deliveryCostAfn : 0,
  };
}

export function OrderDetailClient({ order, metaCampaignOptions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [campaignPick, setCampaignPick] = useState<string>(
    () => order.manualMetaCampaignId ?? MANUAL_CAMPAIGN_NONE,
  );
  const [nextStatus, setNextStatus] = useState(order.status);
  const [capiEventTimeKabul, setCapiEventTimeKabul] = useState(
    getDefaultKabulDateTimeLocal(),
  );
  const [resendCapiEventTimeKabul, setResendCapiEventTimeKabul] = useState(
    getDefaultKabulDateTimeLocal(),
  );

  const [shippingInterProvince, setShippingInterProvince] = useState(
    () => shippingBaseline(order).interProvinceAfghanistanDelivery,
  );
  const [shippingProvince, setShippingProvince] = useState(
    () => shippingBaseline(order).deliveryProvinceAfghanistan,
  );
  const [shippingTracking, setShippingTracking] = useState(
    () => shippingBaseline(order).deliveryTrackingNumber,
  );
  const [shippingDeliveryCostAfn, setShippingDeliveryCostAfn] = useState(
    () => shippingBaseline(order).deliveryCost,
  );

  const [deleteOpen, setDeleteOpen] = useState(false);

  const [resendReviewOpen, setResendReviewOpen] = useState(false);
  const [resendPreview, setResendPreview] = useState<{
    payloadJson: string;
    eventIdOverride: string;
  } | null>(null);
  const [resendPreviewError, setResendPreviewError] = useState<string | null>(
    null,
  );
  const [resendPreviewLoading, setResendPreviewLoading] = useState(false);

  useEffect(() => {
    setNextStatus(order.status);
  }, [order.id, order.status]);

  useEffect(() => {
    setCampaignPick(order.manualMetaCampaignId ?? MANUAL_CAMPAIGN_NONE);
  }, [order.id, order.manualMetaCampaignId]);

  useEffect(() => {
    const b = shippingBaseline(order);
    setShippingInterProvince(b.interProvinceAfghanistanDelivery);
    setShippingProvince(b.deliveryProvinceAfghanistan);
    setShippingTracking(b.deliveryTrackingNumber);
    setShippingDeliveryCostAfn(b.deliveryCost);
  }, [order]);

  useEffect(() => {
    if (!shippingInterProvince) {
      setShippingProvince("");
      setShippingTracking("");
      setShippingDeliveryCostAfn(0);
    }
  }, [shippingInterProvince]);

  const canEditManualCampaign = order.ctwaSessionId == null;
  const manualCampaignDirty =
    campaignPick !== (order.manualMetaCampaignId ?? MANUAL_CAMPAIGN_NONE);

  const needsCapiEventTime =
    !order.capiSent && orderStatusEligibleForPurchaseCapi(nextStatus);

  const fxRateOk = useMemo(() => {
    const r = parseAfnPerOneUsdFromDb(order.afnPerUsdSnapshot ?? undefined);
    return Number.isFinite(r) && r > 0;
  }, [order.afnPerUsdSnapshot]);

  const shippingDirty = useMemo(() => {
    const b = shippingBaseline(order);
    return (
      shippingInterProvince !== b.interProvinceAfghanistanDelivery ||
      shippingProvince !== b.deliveryProvinceAfghanistan ||
      shippingTracking !== b.deliveryTrackingNumber ||
      shippingDeliveryCostAfn !== b.deliveryCost
    );
  }, [
    order,
    shippingInterProvince,
    shippingProvince,
    shippingTracking,
    shippingDeliveryCostAfn,
  ]);

  const canSaveShipping =
    shippingDirty &&
    (!shippingInterProvince || (shippingInterProvince && fxRateOk));

  const capiEligibleNow = orderStatusEligibleForPurchaseCapi(order.status);

  useEffect(() => {
    if (!resendReviewOpen || !capiEligibleNow) return;
    let cancelled = false;
    setResendPreview(null);
    setResendPreviewError(null);
    setResendPreviewLoading(true);
    void (async () => {
      const res = await prepareResendOrderPurchaseCapi({
        orderId: order.id,
        capiEventTimeKabul: resendCapiEventTimeKabul,
      });
      if (cancelled) return;
      setResendPreviewLoading(false);
      if (!res.ok) {
        setResendPreviewError(res.error);
        return;
      }
      setResendPreview({
        payloadJson: res.payloadJson,
        eventIdOverride: res.eventIdOverride,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    resendReviewOpen,
    capiEligibleNow,
    order.id,
    resendCapiEventTimeKabul,
  ]);

  function onSaveStatus() {
    startTransition(() => {
      void (async () => {
        const res = await updateOrderStatus({
          orderId: order.id,
          status: nextStatus as UpdateOrderStatusInput["status"],
          capiEventTimeKabul: needsCapiEventTime ? capiEventTimeKabul : undefined,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          res.capiSent && !order.capiSent
            ? "Status updated. Meta Purchase sent."
            : "Status updated.",
        );
        router.refresh();
      })();
    });
  }

  function onSaveCampaignAttribution() {
    startTransition(() => {
      void (async () => {
        const res = await linkOrderManualCampaign({
          orderId: order.id,
          metaCampaignId:
            campaignPick === MANUAL_CAMPAIGN_NONE ? "" : campaignPick,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          campaignPick === MANUAL_CAMPAIGN_NONE
            ? "Manual campaign attribution cleared."
            : "Campaign attribution saved.",
        );
        router.refresh();
      })();
    });
  }

  function onSaveShipping() {
    startTransition(() => {
      void (async () => {
        const res = await updateOrderMetadata({
          orderId: order.id,
          interProvinceAfghanistanDelivery: shippingInterProvince,
          deliveryProvinceAfghanistan: shippingProvince,
          deliveryTrackingNumber: shippingTracking,
          deliveryCost: shippingDeliveryCostAfn,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Shipping details saved.");
        router.refresh();
      })();
    });
  }

  function onConfirmResendCapi() {
    if (!resendPreview) return;
    startTransition(() => {
      void (async () => {
        const res = await resendOrderPurchaseCapi({
          orderId: order.id,
          capiEventTimeKabul: resendCapiEventTimeKabul,
          eventIdOverride: resendPreview.eventIdOverride,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          `Purchase event sent again. New Meta event_id: ${res.capiEventId}`,
        );
        setResendReviewOpen(false);
        setResendPreview(null);
        router.refresh();
      })();
    });
  }

  function onConfirmDelete() {
    startTransition(() => {
      void (async () => {
        const res = await deleteOrder({ orderId: order.id });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Order deleted.");
        setDeleteOpen(false);
        router.push("/orders");
      })();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fulfillment status</CardTitle>
          <CardDescription>
            Move the order through your COD flow. Meta Purchase is sent once when
            status becomes{" "}
            <span className="text-foreground font-medium">Confirmed</span> or{" "}
            <span className="text-foreground font-medium">Paid</span> (if CTWA
            exists and CAPI was not sent yet).{" "}
            <span className="text-foreground font-medium">Returned</span> does not
            send CAPI. Use{" "}
            <span className="text-foreground font-medium">Resend Meta Purchase</span>{" "}
            below if Events Manager missed the event.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-status-select" className="text-xs">
              Status
            </Label>
            <Select
              value={nextStatus}
              onValueChange={(v) => {
                if (v) setNextStatus(v);
              }}
            >
              <SelectTrigger id="order-status-select" className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orderStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsCapiEventTime ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-capi-time" className="text-xs">
                Meta Purchase event time (Kabul)
              </Label>
              <Input
                id="order-capi-time"
                type="datetime-local"
                className="w-[11rem]"
                value={capiEventTimeKabul}
                onChange={(e) => setCapiEventTimeKabul(e.target.value)}
              />
              <p className="text-muted-foreground max-w-md text-xs">
                Used as Meta <code className="text-[11px]">event_time</code> for
                this Purchase only.
              </p>
            </div>
          ) : null}
          <Button
            type="button"
            disabled={pending || nextStatus === order.status}
            onClick={onSaveStatus}
          >
            Save status
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meta Conversions API</CardTitle>
          <CardDescription>
            The app stores the last successful <code className="text-[11px]">event_id</code>{" "}
            returned for this order. Non-production sends{" "}
            <span className="text-foreground font-medium">TestEvent</span>—open
            Events Manager → <strong>Test events</strong> to verify. Production sends
            live <span className="text-foreground font-medium">Purchase</span>. Wrong{" "}
            <code className="text-[11px]">META_DATASET_ID</code> can make Graph return
            OK while nothing useful appears in reporting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Primary send (from create or first Confirm/Paid)
            </p>
            <p className="mt-1">
              {order.capiSent ? (
                <span className="text-foreground font-medium">Recorded as sent</span>
              ) : (
                <span className="text-muted-foreground">Not sent yet</span>
              )}
            </p>
            {order.capiEventId ? (
              <p className="mt-2 font-mono text-xs break-all text-muted-foreground">
                Stored event_id:{" "}
                <span className="text-foreground">{order.capiEventId}</span>
              </p>
            ) : (
              <p className="mt-2 text-muted-foreground text-xs">
                No event_id stored (deferred or not eligible yet).
              </p>
            )}
          </div>

          {capiEligibleNow ? (
            <div className="border-muted space-y-3 rounded-lg border bg-muted/15 p-4">
              <p className="text-muted-foreground text-xs leading-relaxed">
                <strong className="text-foreground">Resend</strong> posts another server{" "}
                Purchase/TestEvent with a <strong className="text-foreground">new</strong>{" "}
                <code className="text-[11px]">event_id</code> so Meta does not dedupe it
                against the first attempt. Merchandise totals come from current line items.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="resend-capi-time" className="text-xs">
                  Event time for this resend (Kabul)
                </Label>
                <Input
                  id="resend-capi-time"
                  type="datetime-local"
                  className="w-[11rem]"
                  value={resendCapiEventTimeKabul}
                  onChange={(e) => setResendCapiEventTimeKabul(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setResendReviewOpen(true)}
              >
                Review payload &amp; resend…
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Set status to Confirmed or Paid to enable Purchase resend.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign attribution (manual)</CardTitle>
          <CardDescription>
            For orders with <strong>no</strong> WhatsApp CTWA session, pick a synced Meta
            campaign so revenue appears on the{" "}
            <span className="text-foreground font-medium">Campaigns</span> P&amp;L. Once a
            CTWA session exists on the order, this path is unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          {!canEditManualCampaign ? (
            <p className="text-muted-foreground text-sm">
              This order is linked to a WhatsApp CTWA session—campaign attribution uses that
              path. Manual Meta campaign assignment is not available on this screen.
            </p>
          ) : metaCampaignOptions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No campaigns in the database. Open{" "}
              <span className="text-foreground font-medium">Campaigns</span> and
              run <strong>Sync from Meta</strong> first.
            </p>
          ) : (
            <>
              <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-md sm:flex-1">
                <Label htmlFor="manual-campaign-attrib" className="text-xs">
                  Meta campaign
                </Label>
                <Select
                  value={campaignPick}
                  onValueChange={(v) => v && setCampaignPick(v)}
                >
                  <SelectTrigger id="manual-campaign-attrib" className="w-full">
                    <SelectValue placeholder="Choose campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MANUAL_CAMPAIGN_NONE}>
                      Not attributed
                    </SelectItem>
                    {metaCampaignOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name?.trim() ? c.name : c.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                disabled={pending || !manualCampaignDirty}
                onClick={onSaveCampaignAttribution}
              >
                Save attribution
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
          {order.valueAfn != null && order.valueAfn.trim() !== "" ? (
            <CardDescription className="tabular-nums">
              Merchandise {money(order.value, order.currency)}
              {" · AFN "}
              {Math.round(Number(order.valueAfn))}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Line</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.lines.map((l) => (
                <TableRow key={l.lineIndex}>
                  <TableCell>{l.lineIndex}</TableCell>
                  <TableCell>{l.productName ?? "—"}</TableCell>
                  <TableCell className="text-right">{l.quantity}</TableCell>
                  <TableCell className="max-w-[10rem] text-right text-xs tabular-nums leading-tight">
                    <span className="block">
                      {money(l.lineValue, order.currency)}
                    </span>
                    {l.lineValueAfn != null && l.lineValueAfn.trim() !== "" ? (
                      <span className="text-muted-foreground block">
                        AFN {Math.round(Number(l.lineValueAfn))}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping &amp; delivery cost</CardTitle>
          <CardDescription>
            Courier fee is entered in whole Afghanis and stored as USD using this order&apos;s
            FX snapshot from checkout. This affects campaign net profit rollups for confirmed /
            paid orders. Toggle off “outside Kabul” to clear provincial shipment and zero the
            stored courier fee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!fxRateOk ? (
            <p className="text-destructive text-xs">
              This order has no valid AFN→USD snapshot—you cannot save provincial courier until
              the rate at order time exists in the database.
            </p>
          ) : null}
          <label className="flex cursor-pointer flex-row items-start gap-3 rounded-lg border bg-muted/20 p-3">
            <input
              type="checkbox"
              className="border-input mt-1 size-[1.125rem] shrink-0 rounded border ring-offset-background accent-primary disabled:opacity-50"
              checked={shippingInterProvince}
              onChange={(e) => setShippingInterProvince(e.target.checked)}
            />
            <div className="min-w-0 space-y-1 leading-snug">
              <span className="font-normal leading-snug">
                Ship to another province{" "}
                <span className="text-muted-foreground">(outside Kabul)</span>
              </span>
              <p className="text-muted-foreground text-xs">
                Choose province, courier fee in AFN, optional tracking—same rules as create order.
              </p>
            </div>
          </label>

          {shippingInterProvince ? (
            <div className="bg-muted/15 space-y-4 rounded-lg border p-4">
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs">
                    Province <span className="text-destructive">*</span>
                  </Label>
                  <ProvinceSearchCombobox
                    provinces={AFGHANISTAN_PROVINCES_OUTSIDE_KABUL}
                    value={shippingProvince}
                    onChange={setShippingProvince}
                    id="order-edit-province"
                    placeholder="Search province…"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="order-edit-tracking" className="text-xs">
                    Tracking number{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="order-edit-tracking"
                    className="font-mono text-sm tabular-nums"
                    placeholder="AWB / reference"
                    autoComplete="off"
                    value={shippingTracking}
                    onChange={(e) => setShippingTracking(e.target.value)}
                  />
                </div>
              </div>
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="order-edit-courier-afn" className="text-xs">
                  Courier fee (AFN, whole)
                </Label>
                <DraftNumericInput
                  id="order-edit-courier-afn"
                  variant="courierAfn"
                  value={shippingDeliveryCostAfn}
                  onValueChange={setShippingDeliveryCostAfn}
                />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Local Kabul delivery: no courier fee is stored here.
            </p>
          )}

          <p className="text-muted-foreground text-xs tabular-nums">
            Current DB: {money(order.deliveryCost, order.currency)}
            {order.deliveryCostAfn != null && order.deliveryCostAfn.trim() !== ""
              ? ` · ≈ AFN ${Math.round(Number(order.deliveryCostAfn))}`
              : null}
          </p>

          <Button
            type="button"
            disabled={pending || !canSaveShipping}
            onClick={onSaveShipping}
          >
            Save shipping
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Delete order</CardTitle>
          <CardDescription>
            Permanently removes this order and its line items (and per-order expenses). This
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => setDeleteOpen(true)}
          >
            Delete order…
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={resendReviewOpen}
        onOpenChange={(open) => {
          setResendReviewOpen(open);
          if (!open) {
            setResendPreview(null);
            setResendPreviewError(null);
            setResendPreviewLoading(false);
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-[min(42rem,calc(100%-2rem))] gap-4 overflow-hidden sm:max-w-2xl"
          showCloseButton={!pending && !resendPreviewLoading}
        >
          <DialogHeader>
            <DialogTitle>Confirm Meta Purchase resend</DialogTitle>
            <DialogDescription>
              This is the JSON body that will be POSTed to Meta Graph as Conversions API.
              The{" "}
              <code className="text-[11px]">event_id</code> below matches what will be sent
              when you confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            {resendPreviewLoading ? (
              <p className="text-muted-foreground text-sm">Building preview…</p>
            ) : null}
            {resendPreviewError ? (
              <p className="text-destructive text-sm">{resendPreviewError}</p>
            ) : null}
            {resendPreview ? (
              <>
                <p className="font-mono text-muted-foreground text-[11px] break-all">
                  event_id:{" "}
                  <span className="text-foreground">{resendPreview.eventIdOverride}</span>
                </p>
                <pre className="bg-muted/40 ring-border max-h-[min(22rem,50vh)] overflow-auto rounded-lg p-3 font-mono text-[11px] leading-snug break-words whitespace-pre-wrap ring-1">
                  {resendPreview.payloadJson}
                </pre>
              </>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setResendReviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                pending ||
                resendPreviewLoading ||
                !!resendPreviewError ||
                !resendPreview
              }
              onClick={onConfirmResendCapi}
            >
              Send to Meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Delete this order?</DialogTitle>
            <DialogDescription>
              Order <span className="font-mono">{order.id}</span> will be removed from the
              database. Line items and related expenses go with it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={onConfirmDelete}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
