"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addBusinessExpenseAction,
  deleteBusinessExpenseAction,
  updateBusinessExpenseAction,
} from "@/actions/business-expense";
import {
  createExpenseCategoryAction,
  deactivateExpenseCategoryAction,
  updateExpenseCategoryAction,
  type ExpenseCategoryOption,
} from "@/actions/expense-category";
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
import type { BusinessExpenseRow } from "@/lib/business-expenses-list";
import {
  EXPENSE_CATEGORY_COLOR_KEYS,
  EXPENSE_CATEGORY_KINDS,
  formatExpenseCategoryKind,
} from "@/lib/expense-category-colors";
import { afnAmountToUsd2 } from "@/lib/fx-afn-usd";
import { APP_CURRENCY } from "@/lib/validations/order";

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

function formatAfn(n: string | number) {
  const v = typeof n === "string" ? Number.parseFloat(n) : n;
  if (Number.isNaN(v)) return String(n);
  return `${Math.round(v).toLocaleString()} AFN`;
}

type CategoryDraft = {
  name: string;
  kind: (typeof EXPENSE_CATEGORY_KINDS)[number];
  colorKey: (typeof EXPENSE_CATEGORY_COLOR_KEYS)[number];
};

type EditState = {
  id: string;
  categoryId: string;
  amountAfn: string;
  incurredDate: string;
  note: string;
  vendor: string;
  receiptRef: string;
};

type Props = {
  rows: BusinessExpenseRow[];
  categories: ExpenseCategoryOption[];
  initialFx: PublicFxState | null;
  canStaffEditFx: boolean;
  filterSince?: string;
  filterUntil?: string;
  filterCategoryId?: string;
  filterKind?: string;
};

export function ExpensesClient({
  rows,
  categories,
  initialFx,
  canStaffEditFx,
  filterSince,
  filterUntil,
  filterCategoryId,
  filterKind,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive),
    [categories],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const categoryName = (id: string) => categoryById.get(id)?.name ?? "";
  const [addCategoryId, setAddCategoryId] = useState(
    () => activeCategories[0]?.id ?? "",
  );
  const [edit, setEdit] = useState<EditState | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(
    null,
  );

  useEffect(() => {
    if (activeCategories.length === 0) {
      setAddCategoryId("");
      return;
    }
    if (!addCategoryId || !activeCategories.some((c) => c.id === addCategoryId)) {
      setAddCategoryId(activeCategories[0]!.id);
    }
  }, [activeCategories, addCategoryId]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatKind, setNewCatKind] = useState<
    (typeof EXPENSE_CATEGORY_KINDS)[number]
  >("other");
  const [newCatColor, setNewCatColor] = useState<
    (typeof EXPENSE_CATEGORY_COLOR_KEYS)[number]
  >("slate");

  const afnPerUsd = initialFx?.afnPerOneUsd ?? 0;

  const totalUsd = useMemo(
    () =>
      rows.reduce((s, r) => s + Number.parseFloat(r.amount || "0"), 0),
    [rows],
  );

  const previewUsd = (afnText: string) => {
    const afn = Number.parseInt(afnText, 10);
    if (!Number.isFinite(afn) || afn <= 0 || !(afnPerUsd > 0)) return null;
    return afnAmountToUsd2(afn, afnPerUsd);
  };

  const pushFilters = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("page");
    router.push(`/expenses?${p.toString()}`);
  };

  const submitAdd = (fd: FormData) => {
    const amountAfn = Number.parseInt(fd.get("amountAfn")?.toString() ?? "", 10);
    const note = fd.get("note")?.toString();
    const vendor = fd.get("vendor")?.toString();
    const receiptRef = fd.get("receiptRef")?.toString();
    const incurredDate = fd.get("incurredDate")?.toString();
    if (!addCategoryId) {
      toast.error("Select a category.");
      return;
    }
    if (!incurredDate || !/^\d{4}-\d{2}-\d{2}$/.test(incurredDate)) {
      toast.error("Use a valid incurred date (YYYY-MM-DD).");
      return;
    }
    if (!Number.isFinite(amountAfn) || amountAfn <= 0) {
      toast.error("Enter a positive whole-number amount in AFN.");
      return;
    }
    startTransition(async () => {
      const r = await addBusinessExpenseAction({
        categoryId: addCategoryId,
        amountAfn,
        note: note?.trim() || undefined,
        vendor: vendor?.trim() || undefined,
        receiptRef: receiptRef?.trim() || undefined,
        incurredDate,
      });
      if (r.ok) {
        toast.success("Expense recorded.");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const onDelete = (id: string) => {
    if (!globalThis.confirm("Delete this expense?")) return;
    startTransition(async () => {
      const r = await deleteBusinessExpenseAction({ id });
      if (r.ok) {
        toast.success("Deleted.");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const saveEdit = () => {
    if (!edit) return;
    const amountAfn = Number.parseInt(edit.amountAfn, 10);
    if (!Number.isFinite(amountAfn) || amountAfn <= 0) {
      toast.error("Enter a positive whole-number amount in AFN.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.incurredDate)) {
      toast.error("Use YYYY-MM-DD for incurred date.");
      return;
    }
    startTransition(async () => {
      const r = await updateBusinessExpenseAction({
        id: edit.id,
        categoryId: edit.categoryId,
        amountAfn,
        note: edit.note.trim() || undefined,
        vendor: edit.vendor.trim() || undefined,
        receiptRef: edit.receiptRef.trim() || undefined,
        incurredDate: edit.incurredDate,
      });
      if (r.ok) {
        toast.success("Updated.");
        setEdit(null);
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const createCategory = () => {
    if (!newCatName.trim()) {
      toast.error("Enter a category name.");
      return;
    }
    startTransition(async () => {
      const r = await createExpenseCategoryAction({
        name: newCatName.trim(),
        kind: newCatKind,
        colorKey: newCatColor,
      });
      if (r.ok) {
        toast.success("Category created.");
        setNewCatName("");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const saveCategoryEdit = (cat: ExpenseCategoryOption, patch: Partial<ExpenseCategoryOption>) => {
    startTransition(async () => {
      const r = await updateExpenseCategoryAction({
        id: cat.id,
        name: patch.name ?? cat.name,
        kind: (patch.kind ?? cat.kind) as (typeof EXPENSE_CATEGORY_KINDS)[number],
        colorKey: (patch.colorKey ?? cat.colorKey) as (typeof EXPENSE_CATEGORY_COLOR_KEYS)[number],
        isActive: patch.isActive ?? cat.isActive,
      });
      if (r.ok) {
        toast.success("Category updated.");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const startEditCategory = (cat: ExpenseCategoryOption) => {
    setEditingCategoryId(cat.id);
    setCategoryDraft({
      name: cat.name,
      kind: cat.kind as CategoryDraft["kind"],
      colorKey: cat.colorKey as CategoryDraft["colorKey"],
    });
  };

  const cancelEditCategory = () => {
    setEditingCategoryId(null);
    setCategoryDraft(null);
  };

  const saveCategoryDraft = () => {
    if (!editingCategoryId || !categoryDraft?.name.trim()) {
      toast.error("Enter a category name.");
      return;
    }
    const existing = categoryById.get(editingCategoryId);
    if (!existing) return;
    startTransition(async () => {
      const r = await updateExpenseCategoryAction({
        id: editingCategoryId,
        name: categoryDraft.name.trim(),
        kind: categoryDraft.kind,
        colorKey: categoryDraft.colorKey,
        isActive: existing.isActive,
      });
      if (r.ok) {
        toast.success("Category updated.");
        cancelEditCategory();
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const deleteCategory = (cat: ExpenseCategoryOption) => {
    const msg = cat.isActive
      ? `Delete "${cat.name}"?\n\nIf any expenses use it, the category will be deactivated instead of removed.`
      : `Permanently remove inactive category "${cat.name}"?`;
    if (!globalThis.confirm(msg)) return;
    startTransition(async () => {
      const r = await deactivateExpenseCategoryAction({ id: cat.id });
      if (r.ok) {
        toast.success(
          r.outcome === "deleted"
            ? "Category deleted."
            : "Category deactivated (still shown on past expenses).",
        );
        if (editingCategoryId === cat.id) cancelEditCategory();
        router.refresh();
      } else toast.error(r.error);
    });
  };

  return (
    <div className="space-y-6">
      <OrderFormFxBar initialFx={initialFx} canStaffEditFx={canStaffEditFx} />

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
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Category</Label>
          <Select
            value={filterCategoryId ?? "all"}
            onValueChange={(v) => {
              if (!v) return;
              pushFilters({ categoryId: v === "all" ? undefined : v });
            }}
          >
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="All categories">
                {filterCategoryId
                  ? categoryName(filterCategoryId) || "Category"
                  : "All categories"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Kind</Label>
          <Select
            value={filterKind ?? "all"}
            onValueChange={(v) => {
              if (!v) return;
              pushFilters({ kind: v === "all" ? undefined : v });
            }}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="All kinds">
                {filterKind
                  ? formatExpenseCategoryKind(filterKind)
                  : "All kinds"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {EXPENSE_CATEGORY_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {formatExpenseCategoryKind(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() =>
            pushFilters({
              since: undefined,
              until: undefined,
              categoryId: undefined,
              kind: undefined,
            })
          }
        >
          Clear filters
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-9"
          onClick={() => setManageOpen(true)}
        >
          Manage categories
        </Button>
      </div>

      <p className="text-muted-foreground text-sm leading-relaxed">
        Record overhead in <strong>AFN</strong> (USD stored at save-time FX). Log{" "}
        <strong>Meta ad card charges</strong>, subscriptions, and rent when the bank
        card is actually charged — use categories like Marketing (non-Meta) or
        Software. Per-order courier belongs on the order form, not here.
      </p>

      <form
        className="border-border flex flex-wrap items-end gap-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitAdd(new FormData(e.currentTarget));
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Category</Label>
          <Select
            value={addCategoryId}
            onValueChange={(v) => v && setAddCategoryId(v)}
          >
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Select category">
                {addCategoryId ? categoryName(addCategoryId) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {activeCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="be-afn" className="text-xs">
            Amount (AFN)
          </Label>
          <Input
            id="be-afn"
            name="amountAfn"
            type="number"
            step="1"
            min="1"
            className="h-9 w-32"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="be-date" className="text-xs">
            Incurred date
          </Label>
          <Input
            id="be-date"
            name="incurredDate"
            type="date"
            className="h-9 w-[11rem]"
            defaultValue={todayIsoDate()}
            required
          />
        </div>
        <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
          <Label
            htmlFor="be-vendor"
            className="text-xs"
            title="Who you paid — shop, landlord, etc. (optional)"
          >
            Paid to
          </Label>
          <Input
            id="be-vendor"
            name="vendor"
            className="h-9"
            placeholder="Optional"
          />
        </div>
        <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
          <Label htmlFor="be-note" className="text-xs">
            Note
          </Label>
          <Input id="be-note" name="note" className="h-9" placeholder="Optional" />
        </div>
        <Button type="submit" size="sm" disabled={pending || !addCategoryId}>
          Add expense
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        Total ({APP_CURRENCY}, this page):{" "}
        <span className="text-foreground font-medium tabular-nums">
          {moneyUsd(String(totalUsd))}
        </span>
      </p>

      <div className="-mx-3 overflow-x-auto sm:mx-0">
        <div className="inline-block min-w-full overflow-hidden rounded-xl border align-middle">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">AFN</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    No overhead expenses yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.incurredDate}
                    </TableCell>
                    <TableCell>
                      <ExpenseCategoryBadge
                        name={r.categoryName}
                        colorKey={r.categoryColorKey}
                        inactive={!r.categoryIsActive}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatAfn(r.amountAfn)}
                      <span className="text-muted-foreground block text-xs">
                        @ {Number.parseFloat(r.afnPerUsdSnapshot).toFixed(2)} AFN/USD
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {moneyUsd(r.amount)}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm">
                      {[r.vendor, r.note].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          setEdit({
                            id: r.id,
                            categoryId: r.categoryId,
                            amountAfn: String(
                              Math.round(Number.parseFloat(r.amountAfn)),
                            ),
                            incurredDate: r.incurredDate,
                            note: r.note ?? "",
                            vendor: r.vendor ?? "",
                            receiptRef: r.receiptRef ?? "",
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
                        disabled={pending}
                        onClick={() => onDelete(r.id)}
                      >
                        Delete
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
            <DialogTitle>Edit expense</DialogTitle>
          </DialogHeader>
          {edit ? (
            <div className="grid gap-3 py-2">
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Select
                  value={edit.categoryId}
                  onValueChange={(v) => {
                    if (v) setEdit({ ...edit, categoryId: v });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category">
                      {categoryName(edit.categoryId) || undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} disabled={!c.isActive}>
                        {c.name}
                        {!c.isActive ? " (inactive)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Amount (AFN)</Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  value={edit.amountAfn}
                  onChange={(e) =>
                    setEdit({ ...edit, amountAfn: e.target.value })
                  }
                />
                {previewUsd(edit.amountAfn) != null ? (
                  <p className="text-muted-foreground text-xs">
                    ≈ {moneyUsd(String(previewUsd(edit.amountAfn)))} at current FX
                    (saved snapshot updates on save)
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Incurred date</Label>
                <Input
                  type="date"
                  value={edit.incurredDate}
                  onChange={(e) =>
                    setEdit({ ...edit, incurredDate: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label title="Who you paid (optional)">Paid to</Label>
                <Input
                  value={edit.vendor}
                  placeholder="Optional"
                  onChange={(e) => setEdit({ ...edit, vendor: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Note</Label>
                <Input
                  value={edit.note}
                  onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                />
              </div>
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

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Expense categories</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-2 border-b pb-4">
              <Input
                placeholder="New category name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="min-w-[10rem] flex-1"
              />
              <Select
                value={newCatKind}
                onValueChange={(v) =>
                  setNewCatKind(v as (typeof EXPENSE_CATEGORY_KINDS)[number])
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue>
                    {formatExpenseCategoryKind(newCatKind)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORY_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {formatExpenseCategoryKind(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={newCatColor}
                onValueChange={(v) => {
                  if (!v) return;
                  setNewCatColor(v as (typeof EXPENSE_CATEGORY_COLOR_KEYS)[number]);
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue>
                    <ExpenseCategoryBadge name={newCatColor} colorKey={newCatColor} />
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORY_COLOR_KEYS.map((c) => (
                    <SelectItem key={c} value={c}>
                      <ExpenseCategoryBadge name={c} colorKey={c} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" disabled={pending} onClick={createCategory}>
                Add
              </Button>
            </div>
            <ul className="space-y-3">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border px-3 py-2"
                >
                  {editingCategoryId === c.id && categoryDraft ? (
                    <div className="space-y-2">
                      <Input
                        value={categoryDraft.name}
                        onChange={(e) =>
                          setCategoryDraft({ ...categoryDraft, name: e.target.value })
                        }
                        placeholder="Category name"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Select
                          value={categoryDraft.kind}
                          onValueChange={(v) => {
                            if (!v) return;
                            setCategoryDraft({
                              ...categoryDraft,
                              kind: v as CategoryDraft["kind"],
                            });
                          }}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue>
                              {formatExpenseCategoryKind(categoryDraft.kind)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORY_KINDS.map((k) => (
                              <SelectItem key={k} value={k}>
                                {formatExpenseCategoryKind(k)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={categoryDraft.colorKey}
                          onValueChange={(v) => {
                            if (!v) return;
                            setCategoryDraft({
                              ...categoryDraft,
                              colorKey: v as CategoryDraft["colorKey"],
                            });
                          }}
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue>
                              <ExpenseCategoryBadge
                                name={categoryDraft.colorKey}
                                colorKey={categoryDraft.colorKey}
                              />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORY_COLOR_KEYS.map((color) => (
                              <SelectItem key={color} value={color}>
                                <ExpenseCategoryBadge name={color} colorKey={color} />
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={saveCategoryDraft}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={cancelEditCategory}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ExpenseCategoryBadge
                        name={c.name}
                        colorKey={c.colorKey}
                        inactive={!c.isActive}
                      />
                      <span className="text-muted-foreground text-xs">
                        {formatExpenseCategoryKind(c.kind)}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditCategory(c)}
                        >
                          Edit
                        </Button>
                        {!c.isActive ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => saveCategoryEdit(c, { isActive: true })}
                          >
                            Reactivate
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => deleteCategory(c)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
