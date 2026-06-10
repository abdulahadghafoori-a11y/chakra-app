"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangleIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { createOrder, previewOrderCapiPayload } from "@/actions/order";
import type { ProductRow } from "@/actions/products";
import type { WhatsAppWabaAccountOption } from "@/actions/whatsapp-waba";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPhonePresentation } from "@/lib/phone-display";
import { isValidE164Input } from "@/lib/phone-e164";
import {
  describeKabulLocalForMeta,
  formatDateTimeKabul,
  getDefaultKabulDateTimeLocal,
} from "@/lib/kabul-time";
import {
  formatContactSourceLabel,
  formatOrderSalesChannelLabel,
  isOrderSalesChannel,
  ORDER_SALES_CHANNEL_OPTIONS,
  type OrderSalesChannel,
} from "@/lib/sales-channel";
import { formatStoredContactPhone } from "@/lib/phone-display";
import { ContactExistingOrders } from "@/components/new-order-form/contact-existing-orders";
import {
  CtwaSessionAttributionFooter,
  defaultLine,
  sessionOptionLabel,
  type FormValues,
} from "@/components/new-order-form/shared";
import { useCtwaSessionOrders } from "@/components/new-order-form/use-ctwa-session-orders";
import { usePhoneLookup } from "@/components/new-order-form/use-phone-lookup";
import { isOfflinePlaceholderPhone } from "@/lib/offline-contact-phone";
import {
  newOrderFormSchema,
  orderStatuses,
} from "@/lib/validations/order";
import type { PublicFxState } from "@/lib/app-fx-usd-afn";
import {
  afnAmountToUsd2,
  catalogUsdToDefaultAfn,
  roundAfnWhole,
  roundUsd2,
} from "@/lib/fx-afn-usd";
import { OrderFormFxBar } from "@/components/order-form-fx-bar";
import {
  orderConfirmStorageKey,
  type OrderConfirmClientPayload,
} from "@/lib/order-confirmation-storage";
import { MetaCampaignCombobox } from "@/components/meta-campaign-combobox";
import { ProvinceSearchCombobox } from "@/components/province-search-combobox";
import { DraftNumericInput } from "@/components/draft-numeric-input";
import { AFGHANISTAN_PROVINCES_OUTSIDE_KABUL } from "@/lib/afghanistan-provinces";
import type { MetaCampaignPickerOption } from "@/lib/campaigns-rollups";
import { orderFormNeedsWabaPicker } from "@/lib/order-capi-waba";

export function NewOrderForm({
  products,
  metaCampaignOptions,
  wabaAccountOptions,
  initialPhone,
  initialSalesChannel,
  initialOfflineContactName,
  initialFx,
  canStaffEditFx,
}: {
  products: ProductRow[];
  metaCampaignOptions: MetaCampaignPickerOption[];
  wabaAccountOptions: WhatsAppWabaAccountOption[];
  /** E.164 from `?phone=` (e.g. from Contacts) */
  initialPhone?: string;
  /** From `?contactId=` when opening new order for an in-store contact. */
  initialSalesChannel?: OrderSalesChannel;
  initialOfflineContactName?: string;
  /** Current AFN per 1 USD; required to convert AFN inputs to stored USD server-side */
  initialFx: PublicFxState | null;
  canStaffEditFx: boolean;
}) {
  const router = useRouter();
  const fxRateValid =
    !!initialFx &&
    Number.isFinite(initialFx.afnPerOneUsd) &&
    initialFx.afnPerOneUsd > 0;
  const fxRateNumber = fxRateValid ? initialFx.afnPerOneUsd : Number.NaN;
  const [pending, startTransition] = useTransition();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewPayloadJson, setReviewPayloadJson] = useState<string | null>(
    null,
  );
  const [reviewValues, setReviewValues] = useState<FormValues | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(newOrderFormSchema),
    defaultValues: {
      phone: initialPhone?.trim() ?? "",
      salesChannel: initialSalesChannel ?? "online",
      offlineContactName: initialOfflineContactName ?? "",
      ctwaSessionId: "",
      capiWabaId: "",
      lines: [defaultLine(products, fxRateValid, initialFx?.afnPerOneUsd ?? 0)],
      status: "confirmed",
      capiEventTimeKabul: getDefaultKabulDateTimeLocal(),
      deliveryCost: 0,
      manualMetaCampaignId: "",
      manualCampaignAttributedAtKabul: getDefaultKabulDateTimeLocal(),
      interProvinceAfghanistanDelivery: false,
      deliveryProvinceAfghanistan: "",
      deliveryTrackingNumber: "",
    },
  });

  const { setValue, control } = form;
  const { sessions, contactOrders, loadingPhoneData, contactPhase, phone } =
    usePhoneLookup(form);
  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  useEffect(() => {
    if (initialPhone?.trim()) {
      setValue("phone", initialPhone.trim());
    }
  }, [initialPhone, setValue]);

  useEffect(() => {
    if (initialSalesChannel) {
      setValue("salesChannel", initialSalesChannel);
    }
  }, [initialSalesChannel, setValue]);

  useEffect(() => {
    if (initialOfflineContactName?.trim()) {
      setValue("offlineContactName", initialOfflineContactName.trim());
    }
  }, [initialOfflineContactName, setValue]);

  const phoneTrimmed = (phone ?? "").trim();
  const phoneOk = isValidE164Input(phoneTrimmed);

  const interProvince = form.watch("interProvinceAfghanistanDelivery");
  const manualMetaCampaignId = form.watch("manualMetaCampaignId");
  const salesChannel = form.watch("salesChannel");
  const isInStore = salesChannel === "offline";

  const watchedLines =
    useWatch({
      control,
      name: "lines",
      defaultValue: form.getValues("lines"),
    }) ?? [];

  const latestSession = useMemo(
    () => (sessions.length > 0 ? sessions[0] : undefined),
    [sessions],
  );

  const ctwaSessionId = form.watch("ctwaSessionId");
  const selectedSession = useMemo(
    () =>
      sessions.find((s) => s.id === ctwaSessionId) ?? latestSession,
    [sessions, ctwaSessionId, latestSession],
  );
  const { orders: ctwaSessionOrders, loading: loadingCtwaSessionOrders } =
    useCtwaSessionOrders(
      ctwaSessionId,
      !isInStore && Boolean((ctwaSessionId ?? "").trim()),
    );

  useEffect(() => {
    if (!interProvince) {
      setValue("deliveryProvinceAfghanistan", "");
      setValue("deliveryTrackingNumber", "");
      setValue("deliveryCost", 0);
    }
  }, [interProvince, setValue]);

  useEffect(() => {
    if (sessions.length > 0) {
      setValue("manualMetaCampaignId", "");
    }
  }, [sessions.length, setValue]);

  const hasNoCtwaSession =
    !isInStore &&
    contactPhase.status === "found" &&
    !loadingPhoneData &&
    sessions.length === 0 &&
    phoneOk;

  const needsWabaPicker =
    !isInStore &&
    contactPhase.status === "found" &&
    !loadingPhoneData &&
    phoneOk &&
    orderFormNeedsWabaPicker({
      isInStore,
      sessions,
      selectedSessionId: ctwaSessionId,
    });

  const capiWabaId = form.watch("capiWabaId");
  const selectedWabaLabel = useMemo(
    () => wabaAccountOptions.find((w) => w.id === capiWabaId)?.label ?? null,
    [wabaAccountOptions, capiWabaId],
  );

  useEffect(() => {
    if (!needsWabaPicker) {
      setValue("capiWabaId", "");
    }
  }, [needsWabaPicker, setValue]);

  const orderTotalAfn = useMemo(() => {
    return (watchedLines ?? []).reduce((sum, line) => {
      const u = Number(line?.unitSalePrice);
      const q = Number.isFinite(line?.quantity) ? line.quantity : 1;
      if (!Number.isFinite(u) || u <= 0) return sum;
      return sum + roundAfnWhole(u) * q;
    }, 0);
  }, [watchedLines]);

  const orderTotalUsdRounded = useMemo(() => {
    if (!fxRateValid) return Number.NaN;
    let sum = 0;
    for (const line of watchedLines ?? []) {
      const uRaw = Number(line?.unitSalePrice);
      const q = Number.isFinite(line?.quantity) ? line.quantity : 1;
      if (!Number.isFinite(uRaw) || uRaw <= 0) continue;
      const u = roundAfnWhole(uRaw);
      const unitUsd = afnAmountToUsd2(u, fxRateNumber);
      sum += roundUsd2(unitUsd * q);
    }
    return roundUsd2(sum);
  }, [watchedLines, fxRateValid, fxRateNumber]);

  const reviewSummary = useMemo(() => {
    if (!reviewValues) return null;
    const ctwaSession = reviewValues.ctwaSessionId
      ? sessions.find((s) => s.id === reviewValues.ctwaSessionId)
      : undefined;
    const lineRows = reviewValues.lines.map((line, i) => {
      const p = products.find((x) => x.id === line.productId);
      const unitAfn = roundAfnWhole(line.unitSalePrice);
      const qty = line.quantity;
      let unitUsd = Number.NaN;
      let lineUsd = Number.NaN;
      if (fxRateValid) {
        unitUsd = afnAmountToUsd2(unitAfn, fxRateNumber);
        lineUsd = roundUsd2(unitUsd * qty);
      }
      return {
        key: `${line.productId}-${i}`,
        lineNum: i + 1,
        name: p?.name ?? "Unknown product",
        sku: p?.sku ?? "—",
        unitAfn,
        qty,
        unitUsd,
        lineAfnTotal: unitAfn * qty,
        lineUsd,
      };
    });
    const totalAfn = lineRows.reduce((s, r) => s + r.lineAfnTotal, 0);
    const totalUsd = fxRateValid
      ? roundUsd2(lineRows.reduce((s, r) => s + (Number.isFinite(r.lineUsd) ? r.lineUsd : 0), 0))
      : Number.NaN;

    let manualCampaignLine: string | null = null;
    const mcId = reviewValues.manualMetaCampaignId.trim();
    if (mcId) {
      const c = metaCampaignOptions.find((x) => x.id === mcId);
      manualCampaignLine = c?.name?.trim() ? c.name : mcId;
    }

    const interProv = reviewValues.interProvinceAfghanistanDelivery;
    let deliveryUsd = Number.NaN;
    const deliveryAfnSummary = reviewValues.deliveryCost;
    if (interProv && fxRateValid) {
      deliveryUsd = afnAmountToUsd2(deliveryAfnSummary, fxRateNumber);
    }

    return {
      ctwaSession,
      lineRows,
      totalAfn,
      totalUsd,
      deliveryAfnSummary,
      deliveryUsd,
      manualCampaignLine,
      interProvinceShipment: interProv,
      shipmentProvince: interProv
        ? reviewValues.deliveryProvinceAfghanistan.trim()
        : "",
      shipmentTracking: interProv
        ? reviewValues.deliveryTrackingNumber.trim()
        : "",
    };
  }, [
    reviewValues,
    products,
    sessions,
    metaCampaignOptions,
    fxRateValid,
    fxRateNumber,
  ]);

  const isDevReviewUi = process.env.NODE_ENV === "development";

  const contactPresentation =
    contactPhase.status === "found" &&
    !isOfflinePlaceholderPhone(contactPhase.contact.phoneNumber)
      ? getPhonePresentation(contactPhase.contact.phoneNumber)
      : null;
  const reviewContactPhone =
    contactPhase.status === "found"
      ? isOfflinePlaceholderPhone(contactPhase.contact.phoneNumber)
        ? ""
        : contactPhase.contact.phoneNumber
      : phoneTrimmed;
  const reviewContactName =
    contactPhase.status === "found"
      ? contactPhase.contact.name
      : reviewValues?.offlineContactName?.trim() || null;
  const reviewPhonePresentation =
    reviewContactPhone && isValidE164Input(reviewContactPhone)
      ? getPhonePresentation(reviewContactPhone)
      : null;
  const phoneEntered = phoneTrimmed.length > 0;
  const phoneValidForChannel =
    isInStore ? !phoneEntered || phoneOk : phoneOk;
  const contactReady = isInStore || contactPhase.status === "found";
  const submitDisabled =
    pending ||
    loadingPhoneData ||
    !phoneValidForChannel ||
    !contactReady ||
    !fxRateValid;

  function runCreateOrder(values: FormValues) {
    startTransition(() => {
      void (async () => {
        const res = await createOrder({
          ...values,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        const capiPayload: OrderConfirmClientPayload = {
          capiPayloadJson: res.capiPayloadJson,
          capiSent: res.capiSent,
          capiError: res.capiError,
          capiEventId: res.capiEventId,
        };
        try {
          sessionStorage.setItem(
            orderConfirmStorageKey(res.orderId),
            JSON.stringify(capiPayload),
          );
        } catch {
          /* ignore quota / private mode */
        }
        setReviewOpen(false);
        setReviewPayloadJson(null);
        setReviewValues(null);
        let summary = `Order ${res.orderId} saved.`;
        if (res.capiSent) {
          summary = `Order ${res.orderId} saved. Meta Purchase sent.`;
        } else {
          try {
            const meta = JSON.parse(res.capiPayloadJson) as {
              capiDeferred?: boolean;
              capiOffline?: boolean;
            };
            if (meta.capiOffline) {
              summary = `Order ${res.orderId} saved (in-store — no Meta event).`;
            } else if (meta.capiDeferred) {
              summary = `Order ${res.orderId} saved. Meta Purchase will be sent when status is Confirmed, Shipped, or Paid.`;
            }
          } catch {
            summary = `Order ${res.orderId} saved.`;
          }
        }
        toast.success(summary);
        router.push(`/orders/${res.orderId}/confirmation`);
        form.reset({
          phone: values.phone,
          ctwaSessionId: sessions[0]?.id ?? "",
          capiWabaId: "",
          lines: [defaultLine(products, fxRateValid, initialFx?.afnPerOneUsd ?? 0)],
          status: "confirmed",
          capiEventTimeKabul: getDefaultKabulDateTimeLocal(),
          deliveryCost: 0,
          manualMetaCampaignId: "",
          salesChannel: values.salesChannel,
          offlineContactName: "",
          manualCampaignAttributedAtKabul: getDefaultKabulDateTimeLocal(),
          interProvinceAfghanistanDelivery: false,
          deliveryProvinceAfghanistan: "",
          deliveryTrackingNumber: "",
        } satisfies FormValues);
      })();
    });
  }

  async function onSubmit(values: FormValues) {
    if (values.salesChannel !== "offline" && contactPhase.status !== "found") {
      toast.error(
        "No contact found for this number. The customer must reach you on WhatsApp first.",
      );
      return;
    }

    const wabaRequired = orderFormNeedsWabaPicker({
      isInStore: values.salesChannel === "offline",
      sessions,
      selectedSessionId: values.ctwaSessionId,
    });
    if (wabaRequired && !(values.capiWabaId ?? "").trim()) {
      toast.error("Choose a WhatsApp business line for Meta CAPI.");
      return;
    }
    if (wabaRequired && wabaAccountOptions.length === 0) {
      toast.error(
        "META_WABA_ACCOUNTS is not configured — ask staff to set up WhatsApp business lines.",
      );
      return;
    }

    setReviewLoading(true);
    const preview = await previewOrderCapiPayload({ ...values });
    setReviewLoading(false);
    if (!preview.ok) {
      toast.error(preview.error);
      return;
    }
    setReviewPayloadJson(preview.payloadJson);
    setReviewValues(values);
    setReviewOpen(true);
  }

  return (
    <Card className="mx-auto w-full min-w-0 max-w-xl shadow-sm">
      <CardHeader className="space-y-1 px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
        <CardTitle className="text-lg sm:text-xl">New order</CardTitle>
        <CardDescription className="text-pretty leading-relaxed">
          Online orders need a WhatsApp contact (or CTWA session). In-store sales
          register the customer by phone with no Meta Purchase event and are excluded
          from Campaign reports. You review the payload (or in-store summary) before
          saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 px-4 pb-6 sm:px-6">
        {!fxRateValid ? (
          <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-lg border px-3 py-2 text-sm leading-relaxed">
            Set the USD→AFN rate above or apply the{" "}
            <code className="text-xs">app_fx_usd_afn</code> migration so we can convert
            your Afghanis into stored USD before creating an order.
          </p>
        ) : null}
        <OrderFormFxBar
          initialFx={initialFx}
          canStaffEditFx={canStaffEditFx}
        />
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            {/* Attribution: compact phone + flexible session */}
            <div className="space-y-4">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Attribution
              </p>
              <FormField
                control={form.control}
                name="salesChannel"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>Sale channel</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        if (v && isOrderSalesChannel(v)) {
                          field.onChange(v);
                          if (v === "offline") {
                            setValue("ctwaSessionId", "");
                            setValue("manualMetaCampaignId", "");
                            setValue("manualCampaignAttributedAtKabul", "");
                          }
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue placeholder="Choose sale channel">
                            {formatOrderSalesChannelLabel(field.value)}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ORDER_SALES_CHANNEL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      In-store orders never send Meta CAPI and do not count toward
                      Campaign P&amp;L.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isInStore && sessions.length > 1 ? (
                <div
                  className="flex gap-2.5 rounded-lg border border-amber-500/45 bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed"
                  role="alert"
                >
                  <AlertTriangleIcon
                    className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-amber-950 dark:text-amber-50">
                      {sessions.length} CTWA sessions — pick the right one
                    </p>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      This contact clicked more than one WhatsApp ad. Select the session
                      that matches <strong className="text-foreground font-medium">this</strong>{" "}
                      order (campaign, ad, and time).{" "}
                      <strong className="text-foreground font-medium">Latest</strong> is
                      pre-selected but may not be the click you want for Meta CAPI.
                    </p>
                  </div>
                </div>
              ) : null}
              {isInStore ? (
                <div className="bg-muted/20 space-y-3 rounded-lg border border-dashed p-3">
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Phone is optional for walk-in customers. Leave it blank if
                    they did not share a number — a contact is still created when
                    you save the order.
                  </p>
                  {contactPhase.status === "not_found" &&
                  phoneOk &&
                  phoneEntered &&
                  !loadingPhoneData ? (
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      No contact for this number yet — they will be registered as
                      in-store when you create the order.
                    </p>
                  ) : null}
                  <FormField
                    control={form.control}
                    name="offlineContactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Name (optional)</FormLabel>
                        <FormControl>
                          <Input
                            className="h-9"
                            placeholder="Customer name"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>
                        Phone
                        {isInStore ? (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            (optional)
                          </span>
                        ) : null}
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="h-10 min-h-10 font-mono text-base tabular-nums sm:h-9 sm:min-h-0 sm:text-sm"
                          placeholder={isInStore ? "+93 … or leave blank" : "+1 555…"}
                          autoComplete="tel"
                          inputMode="tel"
                          aria-busy={loadingPhoneData}
                          aria-describedby="phone-lookup-hint"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!isInStore ? (
                <FormField
                  control={form.control}
                  name="ctwaSessionId"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>
                        CTWA session
                        {sessions.length > 1 ? (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            ({sessions.length} for this contact)
                          </span>
                        ) : null}
                      </FormLabel>
                      {sessions.length > 1 ? (
                        <Select
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                          disabled={loadingPhoneData}
                        >
                          <FormControl>
                            <SelectTrigger className="h-auto min-h-10 w-full min-w-0 py-2 font-mono text-sm sm:min-h-9">
                              <SelectValue placeholder="Choose CTWA session">
                                {selectedSession
                                  ? sessionOptionLabel(selectedSession)
                                  : loadingPhoneData
                                    ? "Loading…"
                                    : "Choose session"}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-w-[min(100vw-2rem,28rem)]">
                            {sessions.map((s, index) => (
                              <SelectItem
                                key={s.id}
                                value={s.id}
                                className="items-start py-2"
                              >
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  {index === 0 ? (
                                    <Badge
                                      variant="secondary"
                                      className="shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase"
                                    >
                                      Latest
                                    </Badge>
                                  ) : null}
                                  <span className="font-mono text-xs leading-snug">
                                    {sessionOptionLabel(s)}
                                  </span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <FormControl>
                          <Input
                            readOnly
                            tabIndex={-1}
                            className="h-10 min-h-10 w-full min-w-0 max-w-full cursor-default bg-muted/50 font-mono text-sm sm:h-9 sm:min-h-0"
                            disabled={loadingPhoneData}
                            value={
                              latestSession
                                ? sessionOptionLabel(latestSession)
                                : loadingPhoneData
                                  ? "…"
                                  : "No session for this number"
                            }
                          />
                        </FormControl>
                      )}
                      <CtwaSessionAttributionFooter session={selectedSession} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                ) : null}
              </div>
              {needsWabaPicker ? (
                <FormField
                  control={form.control}
                  name="capiWabaId"
                  render={({ field }) => (
                    <FormItem className="max-w-md">
                      <FormLabel>WhatsApp business line</FormLabel>
                      {wabaAccountOptions.length === 0 ? (
                        <p className="text-destructive text-xs leading-relaxed">
                          No lines configured. Set{" "}
                          <code className="text-[11px]">META_WABA_ACCOUNTS</code> in
                          environment (see README).
                        </p>
                      ) : (
                        <Select
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="h-10 w-full min-w-0 sm:h-9">
                              <SelectValue placeholder="Choose business line">
                                {selectedWabaLabel ?? "Choose business line"}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {wabaAccountOptions.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                {w.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {hasNoCtwaSession
                          ? "No CTWA session — pick which WhatsApp Business Account should receive this Purchase in Events Manager."
                          : "This session has no click id — pick which business line should receive the Meta event."}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              {!isInStore &&
              ctwaSessionOrders.length > 0 &&
              (ctwaSessionId ?? "").trim() ? (
                <div
                  className="flex gap-2.5 rounded-lg border border-amber-500/45 bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed"
                  role="alert"
                >
                  <AlertTriangleIcon
                    className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-2">
                    <p className="font-medium text-amber-950 dark:text-amber-50">
                      {ctwaSessionOrders.length === 1
                        ? "An order is already linked to this CTWA session"
                        : `${ctwaSessionOrders.length} orders are already linked to this CTWA session`}
                    </p>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      Another order on the same session can duplicate Meta
                      attribution. Open an existing order below or continue only if
                      this is a separate legitimate sale.
                    </p>
                    <ul className="space-y-1 text-xs">
                      {ctwaSessionOrders.map((o) => (
                        <li key={o.id}>
                          <Link
                            href={`/orders/${o.id}`}
                            className="text-foreground font-medium underline underline-offset-2"
                          >
                            {o.id}
                          </Link>
                          <span className="text-muted-foreground">
                            {" "}
                            · {o.status} · USD {o.valueUsd}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {loadingCtwaSessionOrders ? (
                      <p className="text-muted-foreground text-xs">Checking…</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {hasNoCtwaSession ? (
                <div className="bg-muted/20 space-y-3 rounded-lg border border-dashed p-3">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Meta campaign (optional · no CTWA session)
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    This contact has <strong className="text-foreground font-medium">no</strong>{" "}
                    WhatsApp CTWA session. Choose a business line above for Meta Purchase
                    (hashed phone, no <code className="text-[11px]">ctwa_clid</code>).
                    Optionally link a synced
                    campaign so revenue appears under{" "}
                    <strong className="text-foreground font-medium">Campaigns</strong>.
                  </p>
                  {metaCampaignOptions.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No campaigns synced yet.{" "}
                      <Link
                        className="text-foreground underline underline-offset-2"
                        href="/campaigns"
                      >
                        Campaigns
                      </Link>{" "}
                      → Sync from Meta — or create the order without campaign attribution.
                    </p>
                  ) : (
                    <FormField
                      control={form.control}
                      name="manualMetaCampaignId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">
                            Meta campaign (reporting)
                          </FormLabel>
                          <FormControl>
                            <MetaCampaignCombobox
                              options={metaCampaignOptions}
                              value={field.value}
                              onChange={field.onChange}
                              id={field.name}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {(manualMetaCampaignId?.trim() ?? "").length > 0 ? (
                    <FormField
                      control={form.control}
                      name="manualCampaignAttributedAtKabul"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">
                            Campaign attribution date &amp; time{" "}
                            <span className="text-muted-foreground font-normal">
                              (Kabul)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              className="h-9 font-mono text-sm tabular-nums"
                              type="datetime-local"
                              step={60}
                              name={field.name}
                              onBlur={field.onBlur}
                              ref={field.ref}
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <p className="text-muted-foreground text-xs leading-relaxed">
                            Lead instant for Campaign reports (first message or ad
                            click), not the sale confirmation time below.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}
                </div>
              ) : null}
              <p
                id="phone-lookup-hint"
                className="text-muted-foreground text-xs"
              >
                {isInStore
                  ? "Optional: looks up an existing contact and prior orders when you enter a number."
                  : "Looks up the saved contact and CTWA sessions for this number."}
              </p>
              {loadingPhoneData ? (
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  Loading contact & sessions…
                </p>
              ) : null}
              {contactPhase.status === "found" ? (
                <div className="bg-muted/50 space-y-2 rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Contact
                  </p>
                  <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-muted-foreground">Name</dt>
                      <dd className="font-medium">
                        {contactPhase.contact.name?.trim() || "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd className="font-mono tabular-nums">
                        {formatStoredContactPhone(contactPhase.contact.phoneNumber)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Country</dt>
                      <dd>
                        {contactPhase.contact.countryName ??
                          contactPresentation?.countryName ??
                          "—"}
                        {(contactPhase.contact.countryCode ??
                          contactPresentation?.countryCode)
                          ? ` (${contactPhase.contact.countryCode ?? contactPresentation?.countryCode})`
                          : null}
                      </dd>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-muted-foreground">In system since</dt>
                      <dd>
                        {formatDateTimeKabul(contactPhase.contact.createTime)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Type</dt>
                      <dd>
                        {formatContactSourceLabel(contactPhase.contact.source)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
              {contactPhase.status === "found" ? (
                <div className="bg-muted/30 rounded-lg border p-3">
                  <ContactExistingOrders
                    orders={contactOrders}
                    loading={loadingPhoneData}
                    contactId={contactPhase.contact.id}
                  />
                </div>
              ) : null}
            </div>

            <Separator />

            {/* Line items */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Products
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!products.length}
                  onClick={() =>
                    append(defaultLine(products, fxRateValid, initialFx?.afnPerOneUsd ?? 0))
                  }
                >
                  <PlusIcon className="mr-1 size-3.5" />
                  Add product
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((fieldRow, index) => {
                  const lineProductId = watchedLines?.[index]?.productId;
                  const lineProduct = products.find((p) => p.id === lineProductId);
                  const lineUnit = Number(watchedLines?.[index]?.unitSalePrice);
                  const lineQty = Number.isFinite(watchedLines?.[index]?.quantity)
                    ? watchedLines[index].quantity
                    : 1;
                  const lineUsdApprox =
                    fxRateValid &&
                    Number.isFinite(lineUnit) &&
                    lineUnit > 0
                      ? roundUsd2(
                          afnAmountToUsd2(
                            roundAfnWhole(lineUnit),
                            fxRateNumber,
                          ) * lineQty,
                        )
                      : Number.NaN;

                  const lineSumAfn =
                    Number.isFinite(lineUnit) && lineUnit > 0
                      ? roundAfnWhole(lineUnit) * lineQty
                      : 0;

                  return (
                    <div
                      key={fieldRow.id}
                      className="bg-muted/30 space-y-3 rounded-lg border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-muted-foreground text-xs">
                          Line {index + 1}
                        </span>
                        {fields.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive -mr-1 -mt-1"
                            onClick={() => remove(index)}
                            aria-label="Remove line"
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                      <FormField
                        control={form.control}
                        name={`lines.${index}.productId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Product</FormLabel>
                            <Select
                              onValueChange={(v) => {
                                field.onChange(v);
                                const p = products.find((x) => x.id === v);
                                if (p && fxRateValid) {
                                  const afn = catalogUsdToDefaultAfn(
                                    Number(p.defaultSalePrice),
                                    fxRateNumber,
                                  );
                                  setValue(
                                    `lines.${index}.unitSalePrice`,
                                    Number.isFinite(afn) && afn > 0 ? afn : 1,
                                  );
                                } else if (p) {
                                  setValue(`lines.${index}.unitSalePrice`, 1);
                                }
                              }}
                              value={field.value}
                              disabled={!products.length}
                            >
                              <FormControl>
                                <SelectTrigger
                                  size="sm"
                                  className="h-9 w-full min-w-0 max-w-full"
                                >
                                  <SelectValue placeholder="Choose a product">
                                    {lineProduct ? (
                                      <span className="truncate font-medium">
                                        {lineProduct.name}
                                      </span>
                                    ) : undefined}
                                  </SelectValue>
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                    <span className="text-muted-foreground">
                                      {" "}
                                      · USD {p.defaultSalePrice}
                                    {fxRateValid
                                      ? ` · ≈ ${String(catalogUsdToDefaultAfn(Number(p.defaultSalePrice), fxRateNumber))} AFN`
                                      : ""}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.unitSalePrice`}
                          render={({ field }) => (
                            <FormItem className="min-w-0 flex-1 sm:max-w-[10rem]">
                              <FormLabel className="text-xs">Unit (AFN)</FormLabel>
                              <FormControl>
                                <DraftNumericInput
                                  ref={field.ref}
                                  name={field.name}
                                  variant="unitAfn"
                                  className="focus-visible:ring-ring h-12 min-h-12 font-mono text-base tabular-nums sm:h-9 sm:min-h-0 sm:text-sm"
                                  value={field.value}
                                  onValueChange={field.onChange}
                                  onBlur={field.onBlur}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`lines.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem className="w-full min-w-[6.5rem] sm:w-auto sm:flex-none">
                              <FormLabel className="text-xs">Qty</FormLabel>
                              <FormControl>
                                <DraftNumericInput
                                  ref={field.ref}
                                  name={field.name}
                                  variant="qty"
                                  className="focus-visible:ring-ring h-12 min-h-12 font-mono text-base tabular-nums sm:h-9 sm:min-h-0 sm:w-[6.25rem] sm:text-sm"
                                  value={field.value}
                                  onValueChange={field.onChange}
                                  onBlur={field.onBlur}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="min-h-[52px] w-full shrink-0 border-t pt-2 sm:min-h-0 sm:w-auto sm:min-w-[7.5rem] sm:border-l sm:border-t-0 sm:pb-2 sm:pl-4 md:pb-3">
                          <p className="text-muted-foreground text-xs">
                            Line total
                          </p>
                          <div className="space-y-0.5">
                            <p className="text-lg font-semibold tabular-nums sm:text-base">
                              {lineProduct ? `AFN ${lineSumAfn}` : "—"}
                            </p>
                            {lineProduct && fxRateValid ? (
                              <p className="text-muted-foreground text-[11px] tabular-nums">
                                ≈ USD {lineUsdApprox.toFixed(2)} stored
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
                <p className="text-muted-foreground text-xs">
                  Whole-number Afghanis only; merchandise is stored as USD (two decimals) for Meta and accounting.
                </p>
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">Merchandise total</p>
                  <p className="text-xl font-semibold tabular-nums tracking-tight sm:text-lg">
                    AFN {orderTotalAfn}
                  </p>
                  {fxRateValid ? (
                    <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
                      ≈ USD {orderTotalUsdRounded.toFixed(2)} for Meta / database
                    </p>
                  ) : (
                    <p className="text-destructive mt-1 text-[11px]">
                      Set FX rate above to preview USD amounts.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Shipping
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Default fulfillment is treated as{" "}
                <strong className="text-foreground font-medium">
                  local delivery (Kabul)
                </strong>
                . Enable <strong className="text-foreground font-medium">outside Kabul</strong>{" "}
                to capture destination province, courier fee in AFN (saved as USD), and optional
                tracking. There is{" "}
                <strong className="text-foreground font-medium">no</strong> delivery fee stored
                for Kabul-local orders here.
              </p>
              {!interProvince ? (
                <div className="bg-muted/40 text-muted-foreground rounded-lg border px-3 py-2 text-xs leading-relaxed">
                  <span className="text-foreground font-medium">
                    Delivering locally in Kabul
                  </span>{" "}
                  — courier cost is tracked only when you ship to another province.
                </div>
              ) : null}
              <FormField
                control={form.control}
                name="interProvinceAfghanistanDelivery"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 rounded-lg border bg-muted/20 p-3">
                    <FormControl>
                      <input
                        id="outside-kabul-delivery"
                        type="checkbox"
                        className="border-input mt-1 size-[1.125rem] shrink-0 rounded border ring-offset-background accent-primary disabled:opacity-50"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </FormControl>
                    <div className="min-w-0 space-y-1 leading-snug">
                      <FormLabel
                        htmlFor="outside-kabul-delivery"
                        className="cursor-pointer font-normal leading-snug"
                      >
                        Ship to another province{" "}
                        <span className="text-muted-foreground">(outside Kabul)</span>
                      </FormLabel>
                      <p className="text-muted-foreground text-xs">
                        Choose province, enter courier fee, and optionally add logistics
                        tracking.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
              {interProvince ? (
                <div className="bg-muted/15 space-y-4 rounded-lg border p-4">
                  <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                    <FormField
                      control={form.control}
                      name="deliveryProvinceAfghanistan"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel className="text-xs">
                            Province <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <ProvinceSearchCombobox
                              provinces={AFGHANISTAN_PROVINCES_OUTSIDE_KABUL}
                              value={field.value}
                              onChange={field.onChange}
                              id={field.name}
                              placeholder="Search province…"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="deliveryTrackingNumber"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel className="text-xs">
                            Tracking number{" "}
                            <span className="text-muted-foreground font-normal">
                              (optional)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              className="h-11 min-h-11 font-mono text-base tabular-nums sm:h-9 sm:min-h-0 sm:text-sm"
                              placeholder="AWB / reference"
                              autoComplete="off"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="deliveryCost"
                    render={({ field }) => (
                      <FormItem className="max-w-xs">
                        <FormLabel className="text-xs">Courier fee (AFN)</FormLabel>
                        <p className="text-muted-foreground text-[11px] leading-relaxed">
                          Whole Afghanis only; we save{" "}
                          <code className="text-[11px]">delivery_cost</code> in USD (two
                          decimals). Not sent to Meta CAPI. Not used for Kabul-local orders.
                        </p>
                        <FormControl>
                          <DraftNumericInput
                            ref={field.ref}
                            name={field.name}
                            variant="courierAfn"
                            className="h-11 min-h-11 font-mono text-base tabular-nums sm:h-9 sm:min-h-0 sm:text-sm"
                            value={field.value}
                            onValueChange={field.onChange}
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : null}
            </div>

            <Separator />

            <div className="space-y-4">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Order details
              </p>
              <div className="flex min-w-0 max-w-full flex-col gap-4 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-end">
                <div className="min-w-0 w-full max-w-full sm:w-auto sm:max-w-[12rem]">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger size="sm" className="h-9 w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {orderStatuses.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="min-w-0 w-full max-w-full sm:min-w-[11rem] sm:max-w-[20rem] sm:flex-1">
                  <FormField
                    control={form.control}
                    name="capiEventTimeKabul"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>
                          Sale / event time{" "}
                          <span className="text-muted-foreground font-normal">
                            (Kabul · UTC+4:30)
                          </span>
                        </FormLabel>
                        <FormControl className="min-w-0 w-full">
                          <Input
                            className="box-border h-11 min-h-11 w-full max-w-full min-w-0 font-mono text-base tabular-nums sm:h-9 sm:min-h-9 sm:text-sm"
                            type="datetime-local"
                            step={60}
                            name={field.name}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          {isInStore
                            ? "When the in-store sale was recorded (order record only — no Meta event)."
                            : "When the sale was confirmed (Meta CAPI event_time and order record). Campaign P&L uses the lead instant from CTWA or manual attribution above."}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            <Button
              className="min-h-11 w-full touch-manipulation sm:min-h-8 sm:w-auto"
              disabled={submitDisabled || reviewLoading}
              type="submit"
            >
              {pending || reviewLoading ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  {reviewLoading ? "Preparing review…" : "Working…"}
                </>
              ) : isInStore ? (
                "Review in-store order"
              ) : (
                "Review & create order"
              )}
            </Button>
          </form>
        </Form>

        <Dialog
          open={reviewOpen}
          onOpenChange={(open) => {
            setReviewOpen(open);
            if (!open) {
              setReviewPayloadJson(null);
              setReviewValues(null);
            }
          }}
        >
          <DialogContent className="flex h-[min(90dvh,40rem)] max-h-[min(90dvh,40rem)] w-[calc(100vw-1rem)] max-w-[42rem] flex-col gap-0 p-0 sm:h-auto sm:max-h-[min(90vh,40rem)] sm:w-full">
            <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-6 sm:py-4">
              <DialogTitle>
                {reviewValues?.salesChannel === "offline"
                  ? "Review in-store order"
                  : "Review order & CAPI payload"}
              </DialogTitle>
              <DialogDescription>
                {isDevReviewUi ? (
                  <>
                    Preview uses placeholder order id{" "}
                    <code className="text-xs">PREVIEW</code>. Meta Purchase runs
                    only when status is <strong>Confirmed</strong> or{" "}
                    <strong>Paid</strong> and CTWA exists; otherwise it is deferred or
                    skipped and you can fire it later from the order page.
                  </>
                ) : (
                  <>
                    Confirm contact, line items, and status. Purchase JSON appears
                    when Confirmed/Paid would send CAPI.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-4">
              {reviewValues &&
              (contactPhase.status === "found" ||
                reviewValues.salesChannel === "offline") &&
              reviewSummary ? (
                <div className="space-y-4 text-sm">
                  {reviewValues.salesChannel === "offline" ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed">
                      <strong className="text-foreground font-medium">In-store sale</strong>{" "}
                      — no Meta Purchase event. This order is excluded from Campaign
                      reports.
                    </p>
                  ) : null}
                  {isDevReviewUi ? (
                    <>
                      {reviewValues.salesChannel !== "offline" ? (
                      <div>
                        <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                          Attribution
                        </p>
                        <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
                          <div className="min-w-0 sm:col-span-2">
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd className="font-mono tabular-nums">
                              {reviewPhonePresentation?.formattedInternational ??
                                reviewContactPhone}
                            </dd>
                          </div>
                          <div className="min-w-0 sm:col-span-2">
                            <dt className="text-muted-foreground">CTWA session</dt>
                            <dd>
                              {reviewSummary.ctwaSession
                                ? sessionOptionLabel(reviewSummary.ctwaSession)
                                : "No session — CAPI without ctwa_clid"}
                            </dd>
                            {reviewSummary.ctwaSession ? (
                              <dd className="text-muted-foreground mt-1 text-xs">
                                Campaign:{" "}
                                <span className="text-foreground font-medium">
                                  {reviewSummary.ctwaSession.campaignName?.trim() ||
                                    "— (not linked to a synced campaign)"}
                                </span>
                              </dd>
                            ) : null}
                          </div>
                          <div className="min-w-0 sm:col-span-2">
                            <dt className="text-muted-foreground">WhatsApp business line</dt>
                            <dd className="text-xs">
                              {reviewSummary.ctwaSession?.ctwaClid?.trim() ? (
                                <span className="font-mono break-all">
                                  {reviewSummary.ctwaSession.wabaId ?? "—"}
                                  {reviewSummary.ctwaSession.phoneNumberId
                                    ? ` · phone_number_id ${reviewSummary.ctwaSession.phoneNumberId}`
                                    : null}
                                  <span className="text-muted-foreground">
                                    {" "}
                                    (from CTWA session)
                                  </span>
                                </span>
                              ) : (
                                <span className="font-medium">
                                  {wabaAccountOptions.find(
                                    (w) => w.id === reviewValues.capiWabaId,
                                  )?.label ?? reviewValues.capiWabaId?.trim() ?? "—"}
                                  {reviewValues.capiWabaId?.trim() ? (
                                    <span className="text-muted-foreground font-mono font-normal">
                                      {" "}
                                      · WABA {reviewValues.capiWabaId}
                                    </span>
                                  ) : null}
                                </span>
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      ) : null}

                      <div className="bg-muted/50 space-y-2 rounded-lg border p-3">
                        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                          Contact
                        </p>
                        <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
                          <div className="min-w-0 sm:col-span-2">
                            <dt className="text-muted-foreground">Name</dt>
                            <dd className="font-medium">
                              {reviewContactName?.trim() || "—"}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd className="font-mono tabular-nums">
                              {reviewPhonePresentation?.formattedInternational ??
                                reviewContactPhone}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-muted-foreground">Country</dt>
                            <dd>
                              {contactPhase.status === "found"
                                ? (contactPhase.contact.countryName ??
                                  reviewPhonePresentation?.countryName ??
                                  "—")
                                : (reviewPhonePresentation?.countryName ?? "—")}
                              {(contactPhase.status === "found"
                                ? contactPhase.contact.countryCode
                                : reviewPhonePresentation?.countryCode)
                                ? ` (${contactPhase.status === "found" ? contactPhase.contact.countryCode : reviewPhonePresentation?.countryCode})`
                                : null}
                            </dd>
                          </div>
                          {contactPhase.status === "found" ? (
                            <div className="min-w-0 sm:col-span-2">
                              <dt className="text-muted-foreground">
                                In system since
                              </dt>
                              <dd>
                                {formatDateTimeKabul(contactPhase.contact.createTime)}
                              </dd>
                            </div>
                          ) : (
                            <div className="min-w-0 sm:col-span-2">
                              <dt className="text-muted-foreground">Customer</dt>
                              <dd className="text-muted-foreground">
                                New in-store contact (created on save)
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    </>
                  ) : (
                    <div className="bg-muted/50 space-y-2 rounded-lg border p-3">
                      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        Contact
                      </p>
                      <dl className="grid gap-2 text-sm">
                        <div>
                          <dt className="text-muted-foreground text-xs">Name</dt>
                          <dd className="font-medium">
                            {reviewContactName?.trim() || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">Phone</dt>
                          <dd className="font-mono text-sm tabular-nums">
                            {reviewPhonePresentation?.formattedInternational ??
                              reviewContactPhone}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}

                  <div className="bg-muted/40 rounded-lg border px-3 py-2 text-xs">
                    <p className="text-muted-foreground font-medium tracking-wide uppercase">
                      {reviewValues.salesChannel === "offline"
                        ? "Sale time"
                        : "CAPI event time"}
                    </p>
                    <p className="mt-1 break-words font-mono tabular-nums leading-relaxed">
                      {(() => {
                        const x = describeKabulLocalForMeta(
                          reviewValues.capiEventTimeKabul,
                        );
                        return `${x.kabulLabel} (Kabul) · event_time ${x.unixSeconds} (Unix s)`;
                      })()}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                      Products
                    </p>
                    {isDevReviewUi ? (
                      <>
                        <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead className="min-w-[7rem] whitespace-normal">
                              Product
                            </TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Unit (AFN)</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Stored USD (line)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reviewSummary.lineRows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="text-muted-foreground">
                                {row.lineNum}
                              </TableCell>
                              <TableCell className="max-w-[14rem] whitespace-normal font-medium">
                                {row.name}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {row.sku}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.unitAfn}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.qty}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {Number.isFinite(row.lineUsd)
                                  ? `USD ${row.lineUsd.toFixed(2)}`
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-right text-muted-foreground text-xs uppercase tracking-wide"
                            >
                              Merchandise (stored USD · CAPI value)
                            </TableCell>
                            <TableCell className="text-right text-base font-semibold tabular-nums">
                              {Number.isFinite(reviewSummary.totalUsd)
                                ? `USD ${reviewSummary.totalUsd.toFixed(2)}`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                      <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                        Whole AFN per line. Merchandise subtotal (AFN):{" "}
                        <span className="text-foreground font-medium tabular-nums">
                          {reviewSummary.totalAfn}
                        </span>
                        .
                      </p>
                      </>
                    ) : (
                      <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[8rem] whitespace-normal">
                              Product
                            </TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Stored USD (line)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reviewSummary.lineRows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="max-w-[16rem] whitespace-normal font-medium">
                                {row.name}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.qty}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {Number.isFinite(row.lineUsd)
                                  ? `USD ${row.lineUsd.toFixed(2)}`
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell
                              colSpan={2}
                              className="text-right text-muted-foreground text-xs uppercase tracking-wide"
                            >
                              Merchandise (USD · Meta)
                            </TableCell>
                            <TableCell className="text-right text-base font-semibold tabular-nums">
                              {Number.isFinite(reviewSummary.totalUsd)
                                ? `USD ${reviewSummary.totalUsd.toFixed(2)}`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                      <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                        Merchandise subtotal (AFN):{" "}
                        <span className="text-foreground font-medium tabular-nums">
                          {reviewSummary.totalAfn}
                        </span>
                      </p>
                      </>
                    )}
                    {reviewSummary.interProvinceShipment ? (
                      <div className="bg-muted/40 mt-3 space-y-2 rounded-lg border px-3 py-2 text-xs">
                        <p className="text-muted-foreground font-medium tracking-wide uppercase">
                          Outside Kabul (province delivery)
                        </p>
                        <p>
                          <span className="text-muted-foreground">Province: </span>
                          <span className="font-medium">
                            {reviewSummary.shipmentProvince || "—"}
                          </span>
                        </p>
                        <p className="break-all font-mono tabular-nums">
                          <span className="text-muted-foreground font-sans">
                            Tracking:{" "}
                          </span>
                          {reviewSummary.shipmentTracking || "—"}
                        </p>
                        <p>
                          <span className="text-muted-foreground font-sans font-medium tracking-wide uppercase">
                            Courier fee (saved · not CAPI):{" "}
                          </span>
                          <span className="tabular-nums font-medium">
                            AFN {reviewSummary.deliveryAfnSummary}
                            {Number.isFinite(reviewSummary.deliveryUsd) ? (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                → USD {reviewSummary.deliveryUsd.toFixed(2)}
                              </span>
                            ) : null}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <div className="bg-muted/40 mt-3 rounded-lg border px-3 py-2 text-xs">
                        <p className="text-muted-foreground font-medium tracking-wide uppercase">
                          Delivery
                        </p>
                        <p className="mt-2 text-muted-foreground leading-relaxed">
                          <span className="text-foreground font-medium">
                            Local (Kabul)
                          </span>{" "}
                          — courier fee applies only outside Kabul. Nothing stored under{" "}
                          <code className="text-[11px]">delivery_cost</code> for this
                          preference.
                        </p>
                      </div>
                    )}
                    {reviewSummary.manualCampaignLine ? (
                      <div className="bg-muted/40 mt-3 rounded-lg border px-3 py-2 text-xs">
                        <p className="text-muted-foreground font-medium tracking-wide uppercase">
                          Manual Meta campaign
                        </p>
                        <p className="mt-2 font-medium leading-relaxed">
                          {reviewSummary.manualCampaignLine}
                        </p>
                      </div>
                    ) : null}
                    <p className="text-muted-foreground mt-2 text-xs">
                      Payment status{" "}
                      <span className="font-medium text-foreground capitalize">
                        {reviewValues.status}
                      </span>
                    </p>
                  </div>
                </div>
              ) : null}
              {reviewPayloadJson ? (
                <div>
                  <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                    {reviewValues?.salesChannel === "offline"
                      ? "In-store summary"
                      : "CAPI JSON (preview)"}
                  </p>
                  <pre className="bg-muted/50 max-h-[min(50vh,22rem)] overflow-auto break-words rounded-lg border p-3 text-[0.7rem] leading-relaxed sm:text-xs">
                    {reviewPayloadJson}
                  </pre>
                </div>
              ) : null}
            </div>
            <DialogFooter className="mx-0 mb-0 shrink-0 gap-2 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full touch-manipulation sm:min-h-8 sm:w-auto"
                onClick={() => setReviewOpen(false)}
              >
                Back
              </Button>
              <Button
                type="button"
                className="min-h-11 w-full touch-manipulation sm:min-h-8 sm:w-auto"
                disabled={pending || !reviewValues}
                onClick={() => {
                  if (reviewValues) runCreateOrder(reviewValues);
                }}
              >
                {pending ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Confirm & create order"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
