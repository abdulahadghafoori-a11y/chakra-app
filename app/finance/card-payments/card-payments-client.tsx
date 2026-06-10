"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addCardPaymentAction,
  deleteCardPaymentAction,
  previewCardPaymentReconciliationAction,
  updateCardPaymentAction,
} from "@/actions/card-payment";
import type { CardFxReconciliation } from "@/lib/card-payment-fx-reconcile";
import type { ExpenseCategoryOption } from "@/actions/expense-category";
import { ExpenseCategoryBadge } from "@/components/expense-category-badge";
import { OrderFormFxBar } from "@/components/order-form-fx-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import type { PublicFxState } from "@/lib/app-fx-usd-afn";
import type { CardPaymentRow } from "@/lib/card-payments-list";
import { APP_CURRENCY } from "@/lib/validations/order";
import {
  CARD_PAYEE_PRESETS,
} from "@/lib/validations/card-payment";

const CARD_CATEGORY_SLUGS = new Set([
  "marketing-non-meta",
  "software",
  "bank-fees",
]);

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function moneyUsd(amount: string) {
  const n = Number.parseFloat(amount);
  if (Number.isNaN(n)) return `${APP_CURRENCY} ${amount}`;
  return `${APP_CURRENCY} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAfn(n: string) {
  const v = Number.parseFloat(n);
  if (Number.isNaN(v)) return n;
  return `${Math.round(v).toLocaleString()} AFN`;
}

/** Calendar month before the charge date (typical Meta billing window). */
function insightsPeriodBeforeCharge(paidAt: string) {
  const [ys, ms] = paidAt.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const first = new Date(y, m - 2, 1);
  const last = new Date(y, m - 1, 0);
  const fmt = (d: Date) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  return { start: fmt(first), end: fmt(last) };
}

function isMetaPayee(payee: string) {
  return payee.trim().toLowerCase().startsWith("meta");
}

type EditState = {
  id: string;
  categoryId: string;
  paidAt: string;
  payee: string;
  amountAfn: string;
  statementRef: string;
  externalRef: string;
  note: string;
  insightsPeriodStart: string;
  insightsPeriodEnd: string;
  alsoUpdateLinkedExpense: boolean;
};

type Props = {
  rows: CardPaymentRow[];
  categories: ExpenseCategoryOption[];
  initialFx: PublicFxState | null;
  canStaffEditFx: boolean;
  filterSince?: string;
  filterUntil?: string;
};

export function CardPaymentsClient({
  rows,
  categories,
  initialFx,
  canStaffEditFx,
  filterSince,
  filterUntil,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const cardCategories = useMemo(
    () =>
      categories.filter(
        (c) => c.isActive && (CARD_CATEGORY_SLUGS.has(c.slug) || c.kind === "overhead"),
      ),
    [categories],
  );
  const defaultCardCategories = useMemo(
    () => categories.filter((c) => c.isActive && CARD_CATEGORY_SLUGS.has(c.slug)),
    [categories],
  );
  const pickList =
    defaultCardCategories.length > 0 ? defaultCardCategories : cardCategories;

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const categoryName = (id: string) => categoryById.get(id)?.name ?? "";

  const [addCategoryId, setAddCategoryId] = useState(() => pickList[0]?.id ?? "");
  const [addPayee, setAddPayee] = useState("Meta");
  const [addPaidAt, setAddPaidAt] = useState(todayIsoDate);
  const [insightsStart, setInsightsStart] = useState(() =>
    insightsPeriodBeforeCharge(todayIsoDate()).start,
  );
  const [insightsEnd, setInsightsEnd] = useState(() =>
    insightsPeriodBeforeCharge(todayIsoDate()).end,
  );
  const [reconcilePreview, setReconcilePreview] =
    useState<CardFxReconciliation | null>(null);
  const [alsoCreateExpense, setAlsoCreateExpense] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);

  useEffect(() => {
    if (isMetaPayee(addPayee)) {
      const p = insightsPeriodBeforeCharge(addPaidAt);
      setInsightsStart(p.start);
      setInsightsEnd(p.end);
    }
  }, [addPayee, addPaidAt]);

  useEffect(() => {
    if (!addCategoryId && pickList[0]) setAddCategoryId(pickList[0].id);
  }, [addCategoryId, pickList]);

  const totalUsd = useMemo(
    () => rows.reduce((s, r) => s + Number.parseFloat(r.amount || "0"), 0),
    [rows],
  );

  const pushFilters = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("page");
    router.push(`/finance/card-payments?${p.toString()}`);
  };

  const submitAdd = (fd: FormData) => {
    const amountAfn = Number.parseInt(fd.get("amountAfn")?.toString() ?? "", 10);
    const paidAt = fd.get("paidAt")?.toString();
    if (!addCategoryId || !addPayee.trim()) {
      toast.error("Category and payee are required.");
      return;
    }
    if (!paidAt || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      toast.error("Use a valid charge date.");
      return;
    }
    if (!Number.isFinite(amountAfn) || amountAfn <= 0) {
      toast.error("Enter a positive whole-number amount in AFN.");
      return;
    }
    const insightsPeriod =
      isMetaPayee(addPayee) && insightsStart && insightsEnd
        ? { insightsPeriodStart: insightsStart, insightsPeriodEnd: insightsEnd }
        : {};

    startTransition(async () => {
      const r = await addCardPaymentAction({
        categoryId: addCategoryId,
        paidAt,
        payee: addPayee.trim(),
        amountAfn,
        statementRef: fd.get("statementRef")?.toString().trim() || undefined,
        externalRef: fd.get("externalRef")?.toString().trim() || undefined,
        note: fd.get("note")?.toString().trim() || undefined,
        alsoCreateExpense,
        ...insightsPeriod,
      });
      if (r.ok) {
        toast.success(
          alsoCreateExpense
            ? "Card charge recorded and mirrored to expenses."
            : "Card charge recorded.",
        );
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const saveEdit = () => {
    if (!edit) return;
    const amountAfn = Number.parseInt(edit.amountAfn, 10);
    if (!Number.isFinite(amountAfn) || amountAfn <= 0) {
      toast.error("Enter a positive AFN amount.");
      return;
    }
    startTransition(async () => {
      const r = await updateCardPaymentAction({
        id: edit.id,
        categoryId: edit.categoryId,
        paidAt: edit.paidAt,
        payee: edit.payee.trim(),
        amountAfn,
        statementRef: edit.statementRef.trim() || undefined,
        externalRef: edit.externalRef.trim() || undefined,
        note: edit.note.trim() || undefined,
        insightsPeriodStart: edit.insightsPeriodStart || undefined,
        insightsPeriodEnd: edit.insightsPeriodEnd || undefined,
        alsoUpdateLinkedExpense: edit.alsoUpdateLinkedExpense,
      });
      if (r.ok) {
        toast.success("Updated.");
        setEdit(null);
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const onDelete = (row: CardPaymentRow) => {
    const msg = row.linkedExpenseId
      ? "Delete this card charge and its linked expense row?"
      : "Delete this card charge?";
    if (!globalThis.confirm(msg)) return;
    startTransition(async () => {
      const r = await deleteCardPaymentAction({
        id: row.id,
        deleteLinkedExpense: Boolean(row.linkedExpenseId),
      });
      if (r.ok) {
        toast.success("Deleted.");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  return (
    <div className="space-y-6">
      <OrderFormFxBar initialFx={initialFx} canStaffEditFx={canStaffEditFx} />

      <p className="text-muted-foreground text-sm leading-relaxed">
        Log each <strong>bank or card charge</strong> on the date your statement shows
        (cash basis). For <strong>Meta</strong>, set the <strong>Insights period</strong>{" "}
        the charge pays for — we compare synced daily Insights (USD) to your AFN charge
        at your app FX rate and store a <strong>scale factor</strong> for product reports.
        Optional mirror creates a matching row in{" "}
        <Link href="/expenses" className="text-primary underline-offset-2 hover:underline">
          expenses
        </Link>{" "}
        — only enable if you want overhead P&amp;L to include that charge; otherwise
        finance reconciliation compares card log vs expenses separately.
      </p>

      <div className="bg-muted/30 flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="h-9 w-[11rem]"
            value={filterSince ?? ""}
            onChange={(e) => pushFilters({ since: e.target.value || undefined })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Until</Label>
          <Input
            type="date"
            className="h-9 w-[11rem]"
            value={filterUntil ?? ""}
            onChange={(e) => pushFilters({ until: e.target.value || undefined })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => pushFilters({ since: undefined, until: undefined })}
        >
          Clear dates
        </Button>
      </div>

      <form
        className="border-border space-y-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitAdd(new FormData(e.currentTarget));
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Charge date</Label>
            <Input
              name="paidAt"
              type="date"
              className="h-9 w-[11rem]"
              value={addPaidAt}
              onChange={(e) => setAddPaidAt(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Payee</Label>
            <Select value={addPayee} onValueChange={(v) => v && setAddPayee(v)}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue>{addPayee}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CARD_PAYEE_PRESETS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Category</Label>
            <Select
              value={addCategoryId}
              onValueChange={(v) => v && setAddCategoryId(v)}
            >
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue>
                  {addCategoryId ? categoryName(addCategoryId) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {pickList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Amount (AFN)</Label>
            <Input
              name="amountAfn"
              type="number"
              step="1"
              min="1"
              className="h-9 w-32"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Statement ref</Label>
            <Input
              name="statementRef"
              className="h-9 w-36"
              placeholder="Bank SMS ref"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Invoice / billing id</Label>
            <Input
              name="externalRef"
              className="h-9 w-36"
              placeholder="Meta invoice"
            />
          </div>
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
            <Label className="text-xs">Note</Label>
            <Input name="note" className="h-9" placeholder="Optional" />
          </div>
        </div>
        {isMetaPayee(addPayee) ? (
          <div className="flex flex-wrap items-end gap-3 border-t pt-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Insights period start</Label>
              <Input
                type="date"
                className="h-9 w-[11rem]"
                value={insightsStart}
                onChange={(e) => setInsightsStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Insights period end</Label>
              <Input
                type="date"
                className="h-9 w-[11rem]"
                value={insightsEnd}
                onChange={(e) => setInsightsEnd(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={pending}
              onClick={() => {
                const afn = Number.parseInt(
                  (
                    document.querySelector(
                      'input[name="amountAfn"]',
                    ) as HTMLInputElement
                  )?.value ?? "0",
                  10,
                );
                if (!insightsStart || !insightsEnd || !(afn > 0)) {
                  toast.error("Set period, charge date, and AFN amount first.");
                  return;
                }
                startTransition(async () => {
                  const r = await previewCardPaymentReconciliationAction({
                    insightsPeriodStart: insightsStart,
                    insightsPeriodEnd: insightsEnd,
                    amountAfn: afn,
                  });
                  if (r.ok) setReconcilePreview(r.reconciliation);
                  else {
                    setReconcilePreview(null);
                    toast.error(r.error);
                  }
                });
              }}
            >
              Preview FX vs Insights
            </Button>
          </div>
        ) : null}
        {reconcilePreview ? (
          <div className="bg-muted/40 rounded-lg border p-3 text-sm">
            <p className="font-medium">Insights vs bank charge</p>
            <ul className="text-muted-foreground mt-2 space-y-1 tabular-nums">
              <li>
                Insights {reconcilePreview.insightsPeriodStart} →{" "}
                {reconcilePreview.insightsPeriodEnd}:{" "}
                {moneyUsd(String(reconcilePreview.insightsSpendUsd))}
              </li>
              <li>
                Card @ {reconcilePreview.afnPerUsdSnapshot.toFixed(2)} AFN/USD:{" "}
                {moneyUsd(String(reconcilePreview.cardAmountUsd))} (
                {formatAfn(String(reconcilePreview.cardAmountAfn))})
              </li>
              <li>
                Implied bank rate:{" "}
                {reconcilePreview.impliedBankAfnPerUsd.toFixed(2)} AFN/USD · Gap{" "}
                {moneyUsd(String(reconcilePreview.fxGapUsd))}
                {reconcilePreview.fxGapPercent != null
                  ? ` (${reconcilePreview.fxGapPercent >= 0 ? "+" : ""}${reconcilePreview.fxGapPercent.toFixed(1)}%)`
                  : ""}
              </li>
              <li>
                Scale factor for product reports:{" "}
                <strong>{reconcilePreview.cashScaleFactor.toFixed(4)}×</strong>
              </li>
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              checked={alsoCreateExpense}
              onChange={(e) => setAlsoCreateExpense(e.target.checked)}
            />
            Also add to business expenses (same date &amp; amount)
          </label>
          <Button type="submit" size="sm" disabled={pending || !addCategoryId}>
            Record card charge
          </Button>
        </div>
      </form>

      <p className="text-muted-foreground text-sm">
        Page total ({APP_CURRENCY}):{" "}
        <span className="text-foreground font-medium tabular-nums">
          {moneyUsd(String(totalUsd))}
        </span>
      </p>

      <div className="-mx-3 overflow-x-auto sm:mx-0">
        <div className="inline-block min-w-full overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">AFN</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead>Refs</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No card charges logged yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.paidAt}
                    </TableCell>
                    <TableCell className="font-medium">{r.payee}</TableCell>
                    <TableCell>
                      <ExpenseCategoryBadge
                        name={r.categoryName}
                        colorKey={r.categoryColorKey}
                      />
                      {r.insightsPeriodStart && r.insightsPeriodEnd ? (
                        <span className="text-muted-foreground mt-0.5 block text-[10px]">
                          Insights {r.insightsPeriodStart} → {r.insightsPeriodEnd}
                          {r.cashScaleFactor
                            ? ` · ${Number.parseFloat(r.cashScaleFactor).toFixed(3)}×`
                            : ""}
                        </span>
                      ) : null}
                      {r.linkedExpenseId ? (
                        <span className="text-muted-foreground mt-0.5 block text-[10px]">
                          Mirrored in expenses
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatAfn(r.amountAfn)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {moneyUsd(r.amount)}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs">
                      {[r.statementRef, r.externalRef, r.note]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEdit({
                            id: r.id,
                            categoryId: r.categoryId,
                            paidAt: r.paidAt,
                            payee: r.payee,
                            amountAfn: String(
                              Math.round(Number.parseFloat(r.amountAfn)),
                            ),
                            statementRef: r.statementRef ?? "",
                            externalRef: r.externalRef ?? "",
                            note: r.note ?? "",
                            insightsPeriodStart: r.insightsPeriodStart ?? "",
                            insightsPeriodEnd: r.insightsPeriodEnd ?? "",
                            alsoUpdateLinkedExpense: Boolean(r.linkedExpenseId),
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => onDelete(r)}
                      >
                        Del
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={edit != null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit card charge</DialogTitle>
          </DialogHeader>
          {edit ? (
            <div className="grid gap-3 py-2">
              <div className="flex flex-col gap-1.5">
                <Label>Charge date</Label>
                <Input
                  type="date"
                  value={edit.paidAt}
                  onChange={(e) =>
                    setEdit({ ...edit, paidAt: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Payee</Label>
                <Input
                  value={edit.payee}
                  onChange={(e) => setEdit({ ...edit, payee: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Select
                  value={edit.categoryId}
                  onValueChange={(v) => {
                    if (v) setEdit({ ...edit, categoryId: v });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {categoryName(edit.categoryId) || undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter((c) => c.isActive)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Amount (AFN)</Label>
                <Input
                  type="number"
                  value={edit.amountAfn}
                  onChange={(e) =>
                    setEdit({ ...edit, amountAfn: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Statement ref</Label>
                <Input
                  value={edit.statementRef}
                  onChange={(e) =>
                    setEdit({ ...edit, statementRef: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Invoice / billing id</Label>
                <Input
                  value={edit.externalRef}
                  onChange={(e) =>
                    setEdit({ ...edit, externalRef: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Note</Label>
                <Input
                  value={edit.note}
                  onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                />
              </div>
              {isMetaPayee(edit.payee) ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Insights period start</Label>
                    <Input
                      type="date"
                      value={edit.insightsPeriodStart}
                      onChange={(e) =>
                        setEdit({ ...edit, insightsPeriodStart: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Insights period end</Label>
                    <Input
                      type="date"
                      value={edit.insightsPeriodEnd}
                      onChange={(e) =>
                        setEdit({ ...edit, insightsPeriodEnd: e.target.value })
                      }
                    />
                  </div>
                </>
              ) : null}
              {edit.alsoUpdateLinkedExpense ? (
                <p className="text-muted-foreground text-xs">
                  Linked expense row will be updated to match.
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
