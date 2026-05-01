"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  getContactByPhone,
  type ContactLookup,
} from "@/actions/contact";
import { createOrder, previewOrderCapiPayload } from "@/actions/order";
import type { CtwaSessionRow } from "@/actions/ctwa";
import { getCtwaSessionsByPhone } from "@/actions/ctwa";
import type { ProductRow } from "@/actions/products";
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
import { summarizeCtwaSessionLabel } from "@/lib/referral";
import { getPhonePresentation } from "@/lib/phone-display";
import { isValidE164Input } from "@/lib/phone-e164";
import {
  describeKabulLocalForMeta,
  getDefaultKabulDateTimeLocal,
} from "@/lib/kabul-time";
import {
  APP_CURRENCY,
  type NewOrderFormInput,
  newOrderFormSchema,
  orderStatuses,
} from "@/lib/validations/order";
import {
  orderConfirmStorageKey,
  type OrderConfirmClientPayload,
} from "@/lib/order-confirmation-storage";

type FormValues = NewOrderFormInput;

type ContactPhase =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "found"; contact: ContactLookup };

function formatTs(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function sessionTriggerLabel(s: CtwaSessionRow): string {
  const clid = s.ctwaClid?.slice(0, 12) ?? "—";
  return `${clid}… · ${formatTs(s.sendTime)}`;
}

function defaultLine(products: ProductRow[]) {
  const p = products[0];
  return {
    productId: p?.id ?? "",
    quantity: 1,
    unitSalePrice: p ? Number(p.defaultSalePrice) : 1,
  };
}

export function NewOrderForm({
  products,
  initialPhone,
}: {
  products: ProductRow[];
  /** E.164 from `?phone=` (e.g. from Contacts) */
  initialPhone?: string;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<CtwaSessionRow[]>([]);
  const [loadingPhoneData, setLoadingPhoneData] = useState(false);
  const [contactPhase, setContactPhase] = useState<ContactPhase>({
    status: "idle",
  });
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
      ctwaSessionId: "",
      lines: [defaultLine(products)],
      status: "paid",
      capiEventTimeKabul: getDefaultKabulDateTimeLocal(),
      deliveryCost: 0,
    },
  });

  const { setValue, control } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  useEffect(() => {
    if (initialPhone?.trim()) {
      setValue("phone", initialPhone.trim());
    }
  }, [initialPhone, setValue]);

  const phone = form.watch("phone");
  const lines = form.watch("lines");

  const latestSession = useMemo(
    () => (sessions.length > 0 ? sessions[0] : undefined),
    [sessions],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = (phone ?? "").trim();
      if (!trimmed) {
        setSessions([]);
        setValue("ctwaSessionId", "");
        setContactPhase({ status: "idle" });
        return;
      }
      if (!isValidE164Input(trimmed)) {
        setSessions([]);
        setValue("ctwaSessionId", "");
        setContactPhase({ status: "idle" });
        return;
      }
      setContactPhase({ status: "loading" });
      setLoadingPhoneData(true);
      void Promise.all([
        getCtwaSessionsByPhone(trimmed),
        getContactByPhone(trimmed),
      ])
        .then(([rows, contact]) => {
          setSessions(rows);
          setValue("ctwaSessionId", rows[0]?.id ?? "");
          if (contact) {
            setContactPhase({ status: "found", contact });
          } else {
            setContactPhase({ status: "not_found" });
          }
        })
        .finally(() => setLoadingPhoneData(false));
    }, 450);
    return () => clearTimeout(t);
  }, [phone, setValue]);

  useEffect(() => {
    if (contactPhase.status === "not_found") {
      form.setError("phone", {
        type: "manual",
        message:
          "No contact found for this number. The customer must reach you on WhatsApp first.",
      });
    } else {
      form.clearErrors("phone");
    }
  }, [contactPhase, form]);

  const orderTotal = useMemo(() => {
    return (lines ?? []).reduce((sum, line) => {
      const u = Number(line?.unitSalePrice);
      const q = Number.isFinite(line?.quantity) ? line.quantity : 1;
      if (!Number.isFinite(u) || u <= 0) return sum;
      return sum + u * q;
    }, 0);
  }, [lines]);

  const reviewSummary = useMemo(() => {
    if (!reviewValues) return null;
    const ctwaSession = reviewValues.ctwaSessionId
      ? sessions.find((s) => s.id === reviewValues.ctwaSessionId)
      : sessions[0];
    const lineRows = reviewValues.lines.map((line, i) => {
      const p = products.find((x) => x.id === line.productId);
      const unit = line.unitSalePrice;
      const qty = line.quantity;
      return {
        key: `${line.productId}-${i}`,
        lineNum: i + 1,
        name: p?.name ?? "Unknown product",
        sku: p?.sku ?? "—",
        unit,
        qty,
        lineTotal: unit * qty,
      };
    });
    const total = lineRows.reduce((s, r) => s + r.lineTotal, 0);
    return {
      ctwaSession,
      lineRows,
      total,
      deliveryCost: reviewValues.deliveryCost,
    };
  }, [reviewValues, products, sessions]);

  const isDevReviewUi = process.env.NODE_ENV === "development";

  const phoneOk = isValidE164Input((phone ?? "").trim());
  const contactPresentation =
    contactPhase.status === "found"
      ? getPhonePresentation(contactPhase.contact.phoneNumber)
      : null;
  const submitDisabled =
    pending ||
    loadingPhoneData ||
    !phoneOk ||
    contactPhase.status !== "found";

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
        toast.success(
          res.capiSent
            ? `Order ${res.orderId} saved.`
            : `Order ${res.orderId} saved (Meta CAPI skipped — no CTWA session).`,
        );
        router.push(`/orders/${res.orderId}/confirmation`);
        form.reset({
          phone: values.phone,
          ctwaSessionId: sessions[0]?.id ?? "",
          lines: [defaultLine(products)],
          status: "paid",
          capiEventTimeKabul: getDefaultKabulDateTimeLocal(),
          deliveryCost: 0,
        } satisfies FormValues);
      })();
    });
  }

  async function onSubmit(values: FormValues) {
    if (contactPhase.status !== "found") {
      toast.error(
        "No contact found for this number. The customer must reach you on WhatsApp first.",
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
    <Card className="mx-auto w-full max-w-xl shadow-sm">
      <CardHeader className="space-y-1 px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
        <CardTitle className="text-lg sm:text-xl">New order</CardTitle>
        <CardDescription className="text-pretty leading-relaxed">
          The phone must match a contact already in the system (from WhatsApp).
          The latest CTWA session is used when present (for{" "}
          <code className="text-xs">ctwa_clid</code>); otherwise the order is
          saved and Meta CAPI is skipped. You will review the payload before the
          order is created.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-6 sm:px-6">
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            {/* Attribution: compact phone + flexible session */}
            <div className="space-y-4">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Attribution
              </p>
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input
                          className="h-10 min-h-10 font-mono text-base tabular-nums sm:h-9 sm:min-h-0 sm:text-sm"
                          placeholder="+1 555…"
                          autoComplete="tel"
                          inputMode="tel"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ctwaSessionId"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>CTWA session (latest)</FormLabel>
                      <input type="hidden" {...field} />
                      <FormControl>
                        <Input
                          readOnly
                          tabIndex={-1}
                          className="h-10 min-h-10 w-full min-w-0 max-w-full cursor-default bg-muted/50 font-mono text-sm sm:h-9 sm:min-h-0"
                          disabled={loadingPhoneData}
                          value={
                            latestSession
                              ? `${sessionTriggerLabel(latestSession)} · ${summarizeCtwaSessionLabel(latestSession)}`
                              : loadingPhoneData
                                ? "…"
                                : "No session for this number"
                          }
                        />
                      </FormControl>
                      {latestSession?.wabaId ? (
                        <p className="text-muted-foreground font-mono text-xs">
                          WABA {latestSession.wabaId}
                          {latestSession.phoneNumberId
                            ? ` · phone_number_id ${latestSession.phoneNumberId}`
                            : null}
                        </p>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Looks up the saved contact and CTWA sessions for this number.
              </p>
              {loadingPhoneData ? (
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  Loading contact & sessions…
                </p>
              ) : null}
              {contactPhase.status === "found" && contactPresentation ? (
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
                        {contactPresentation.formattedInternational}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Country</dt>
                      <dd>
                        {contactPhase.contact.countryName ??
                          contactPresentation.countryName ??
                          "—"}
                        {(contactPhase.contact.countryCode ??
                          contactPresentation.countryCode)
                          ? ` (${contactPhase.contact.countryCode ?? contactPresentation.countryCode})`
                          : null}
                      </dd>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-muted-foreground">In system since</dt>
                      <dd>
                        {formatTs(contactPhase.contact.createTime)}
                      </dd>
                    </div>
                  </dl>
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
                  onClick={() => append(defaultLine(products))}
                >
                  <PlusIcon className="mr-1 size-3.5" />
                  Add product
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((fieldRow, index) => {
                  const lineProductId = lines?.[index]?.productId;
                  const lineProduct = products.find((p) => p.id === lineProductId);
                  const lineUnit = Number(lines?.[index]?.unitSalePrice);
                  const lineQty = Number.isFinite(lines?.[index]?.quantity)
                    ? lines[index].quantity
                    : 1;
                  const lineSum =
                    Number.isFinite(lineUnit) && lineUnit > 0
                      ? lineUnit * lineQty
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
                                if (p) {
                                  setValue(
                                    `lines.${index}.unitSalePrice`,
                                    Number(p.defaultSalePrice),
                                  );
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
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex flex-wrap items-end gap-3">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.unitSalePrice`}
                          render={({ field }) => (
                            <FormItem className="w-[7.5rem] shrink-0">
                              <FormLabel className="text-xs">Unit (USD)</FormLabel>
                              <FormControl>
                                <Input
                                  className="h-9 font-mono text-sm tabular-nums"
                                  min={0}
                                  step="0.01"
                                  type="number"
                                  value={field.value}
                                  onBlur={field.onBlur}
                                  onChange={(e) =>
                                    field.onChange(
                                      Number.parseFloat(e.target.value || "0"),
                                    )
                                  }
                                  name={field.name}
                                  ref={field.ref}
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
                            <FormItem className="w-[5.5rem] shrink-0">
                              <FormLabel className="text-xs">Qty</FormLabel>
                              <FormControl>
                                <Input
                                  className="h-9 font-mono text-sm tabular-nums"
                                  min={1}
                                  step={1}
                                  type="number"
                                  value={field.value}
                                  onBlur={field.onBlur}
                                  onChange={(e) =>
                                    field.onChange(
                                      Number.parseInt(
                                        e.target.value || "1",
                                        10,
                                      ) || 1,
                                    )
                                  }
                                  name={field.name}
                                  ref={field.ref}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="min-w-[8rem] flex-1 pb-2 pl-1">
                          <p className="text-muted-foreground text-xs">Line total</p>
                          <p className="text-base font-semibold tabular-nums">
                            {lineProduct ? `USD ${lineSum.toFixed(2)}` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
                <p className="text-muted-foreground text-xs">
                  Unit price defaults from the product; override for discounts.
                </p>
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">Order total</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {APP_CURRENCY} {orderTotal.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Delivery cost
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Optional. Saved as <code className="text-xs">delivery_cost</code>{" "}
                on the order. Counts toward campaign operational cost when the
                order is paid and attributed. There is no other way to set this
                in the app after the order exists.
              </p>
              <FormField
                control={form.control}
                name="deliveryCost"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel className="text-xs">
                      Delivery ({APP_CURRENCY})
                    </FormLabel>
                    <FormControl>
                      <Input
                        className="h-9 font-mono text-sm tabular-nums"
                        min={0}
                        step="0.01"
                        type="number"
                        value={field.value}
                        onBlur={field.onBlur}
                        onChange={(e) =>
                          field.onChange(
                            Number.parseFloat(e.target.value || "0"),
                          )
                        }
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Order details
              </p>
              <div className="flex max-w-full flex-col gap-4 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-end">
                <div className="max-w-[12rem]">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
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
                <div className="min-w-0 max-w-full sm:min-w-[11rem] sm:max-w-[20rem] sm:flex-1">
                  <FormField
                    control={form.control}
                    name="capiEventTimeKabul"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Event time{" "}
                          <span className="text-muted-foreground font-normal">
                            (Kabul · UTC+4:30)
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
                          Used for Meta CAPI <code className="text-xs">event_time</code>{" "}
                          (Unix seconds, GMT) and the order timestamp. The value is the
                          local date and time in Kabul, not your device timezone.
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
              <DialogTitle>Review order &amp; CAPI payload</DialogTitle>
              <DialogDescription>
                {isDevReviewUi ? (
                  <>
                    Preview uses placeholder order id{" "}
                    <code className="text-xs">PREVIEW</code> until you confirm.
                    After you confirm, Meta CAPI is called and the order is saved
                    only if Meta accepts the event.
                  </>
                ) : (
                  <>
                    Confirm contact, line items, and payment status. JSON below
                    is the CAPI body (placeholder order id{" "}
                    <code className="text-xs">PREVIEW</code> until you confirm).
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-4">
              {reviewValues && contactPhase.status === "found" && reviewSummary ? (
                <div className="space-y-4 text-sm">
                  {isDevReviewUi ? (
                    <>
                      <div>
                        <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                          Attribution
                        </p>
                        <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
                          <div className="min-w-0 sm:col-span-2">
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd className="font-mono tabular-nums">
                              {
                                getPhonePresentation(
                                  contactPhase.contact.phoneNumber,
                                ).formattedInternational
                              }
                            </dd>
                          </div>
                          <div className="min-w-0 sm:col-span-2">
                            <dt className="text-muted-foreground">CTWA session</dt>
                            <dd>
                              {reviewSummary.ctwaSession
                                ? `${sessionTriggerLabel(reviewSummary.ctwaSession)} · ${summarizeCtwaSessionLabel(reviewSummary.ctwaSession)}`
                                : "No session — CAPI without ctwa_clid"}
                            </dd>
                          </div>
                          {reviewSummary.ctwaSession?.wabaId ? (
                            <div className="min-w-0 sm:col-span-2">
                              <dt className="text-muted-foreground">WABA</dt>
                              <dd className="font-mono text-xs break-all">
                                {reviewSummary.ctwaSession.wabaId}
                                {reviewSummary.ctwaSession.phoneNumberId
                                  ? ` · phone_number_id ${reviewSummary.ctwaSession.phoneNumberId}`
                                  : null}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>

                      <div className="bg-muted/50 space-y-2 rounded-lg border p-3">
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
                              {
                                getPhonePresentation(
                                  contactPhase.contact.phoneNumber,
                                ).formattedInternational
                              }
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
                            <dt className="text-muted-foreground">
                              In system since
                            </dt>
                            <dd>{formatTs(contactPhase.contact.createTime)}</dd>
                          </div>
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
                            {contactPhase.contact.name?.trim() || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">Phone</dt>
                          <dd className="font-mono text-sm tabular-nums">
                            {
                              getPhonePresentation(
                                contactPhase.contact.phoneNumber,
                              ).formattedInternational
                            }
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}

                  <div className="bg-muted/40 rounded-lg border px-3 py-2 text-xs">
                    <p className="text-muted-foreground font-medium tracking-wide uppercase">
                      CAPI event time
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
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead className="min-w-[7rem] whitespace-normal">
                              Product
                            </TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Unit</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Line total</TableHead>
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
                                USD {row.unit.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.qty}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                USD {row.lineTotal.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-right text-muted-foreground"
                            >
                              Order total
                            </TableCell>
                            <TableCell className="text-right text-base font-semibold tabular-nums">
                              USD {reviewSummary.total.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[8rem] whitespace-normal">
                              Product
                            </TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Total</TableHead>
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
                                USD {row.lineTotal.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell
                              colSpan={2}
                              className="text-right text-muted-foreground"
                            >
                              Order total
                            </TableCell>
                            <TableCell className="text-right text-base font-semibold tabular-nums">
                              USD {reviewSummary.total.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    )}
                    <div className="bg-muted/40 mt-3 rounded-lg border px-3 py-2 text-xs">
                      <p className="text-muted-foreground font-medium tracking-wide uppercase">
                        Delivery cost (saved on order · not in CAPI)
                      </p>
                      <p className="mt-2 tabular-nums font-medium">
                        {APP_CURRENCY}{" "}
                        {reviewSummary.deliveryCost.toFixed(2)}
                      </p>
                    </div>
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
                    CAPI JSON (preview)
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
