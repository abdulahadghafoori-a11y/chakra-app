"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addBusinessExpenseAction,
  deleteBusinessExpenseAction,
  updateBusinessExpenseAction,
} from "@/actions/business-expense";
import type { BusinessExpenseRow } from "@/lib/business-expenses-list";
import { APP_CURRENCY } from "@/lib/validations/order";
import {
  businessExpenseCategories,
  type BusinessExpenseCategory,
} from "@/lib/validations/business-expense";
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

const categoryLabels: Record<string, string> = {
  rent: "Rent",
  electricity: "Electricity",
  utilities: "Utilities",
  other: "Other",
};

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(amount: string, currency: string) {
  const n = Number.parseFloat(amount);
  if (Number.isNaN(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type Props = { rows: BusinessExpenseRow[] };

type EditState = {
  id: string;
  category: BusinessExpenseCategory;
  amount: string;
  incurredDate: string;
  note: string;
};

export function ExpensesClient({ rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addCategory, setAddCategory] =
    useState<BusinessExpenseCategory>("rent");
  const addFormId = "add-business-expense";

  const [edit, setEdit] = useState<EditState | null>(null);

  const total = useMemo(
    () =>
      rows.reduce((s, r) => s + Number.parseFloat(r.amount || "0"), 0),
    [rows],
  );

  const submitAdd = (fd: FormData) => {
    const amountRaw = fd.get("amount")?.toString();
    const note = fd.get("note")?.toString();
    const incurredDate = fd.get("incurredDate")?.toString();
    const amount = Number.parseFloat(amountRaw ?? "");
    if (!incurredDate || !/^\d{4}-\d{2}-\d{2}$/.test(incurredDate)) {
      toast.error("Use a valid incurred date (YYYY-MM-DD).");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    startTransition(async () => {
      const r = await addBusinessExpenseAction({
        category: addCategory,
        amount,
        currency: APP_CURRENCY,
        note: note?.trim() || undefined,
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
    const amount = Number.parseFloat(edit.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.incurredDate)) {
      toast.error("Use YYYY-MM-DD for incurred date.");
      return;
    }
    startTransition(async () => {
      const r = await updateBusinessExpenseAction({
        id: edit.id,
        category: edit.category,
        amount,
        currency: APP_CURRENCY,
        note: edit.note.trim() || undefined,
        incurredDate: edit.incurredDate,
      });
      if (r.ok) {
        toast.success("Updated.");
        setEdit(null);
        router.refresh();
      } else toast.error(r.error);
    });
  };

  return (
    <div className="space-y-6">
      <form
        id={addFormId}
        className="border-border flex flex-wrap items-end gap-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitAdd(new FormData(e.currentTarget));
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Category</Label>
          <Select
            value={addCategory}
            onValueChange={(v) =>
              setAddCategory(v as BusinessExpenseCategory)
            }
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {businessExpenseCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {categoryLabels[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="be-amt" className="text-xs">
            Amount ({APP_CURRENCY})
          </Label>
          <Input
            id="be-amt"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
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
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
          <Label htmlFor="be-note" className="text-xs">
            Note
          </Label>
          <Input id="be-note" name="note" className="h-9" placeholder="Optional" />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          Add expense
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        Total ({APP_CURRENCY}, this list):{" "}
        <span className="text-foreground font-medium tabular-nums">
          {money(String(total), APP_CURRENCY)}
        </span>
        . These are not allocated to campaigns.
      </p>

      <div className="-mx-3 overflow-x-auto sm:mx-0">
        <div className="inline-block min-w-full overflow-hidden rounded-xl border align-middle">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
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
                      {categoryLabels[r.category] ?? r.category}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(r.amount, r.currency)}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm">
                      {r.note ?? "—"}
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
                            category: r.category as BusinessExpenseCategory,
                            amount: String(Number.parseFloat(r.amount)),
                            incurredDate: r.incurredDate,
                            note: r.note ?? "",
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
                <Label className="text-xs">Category</Label>
                <Select
                  value={edit.category}
                  onValueChange={(v) =>
                    setEdit({
                      ...edit,
                      category: v as BusinessExpenseCategory,
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {businessExpenseCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {categoryLabels[c] ?? c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-amt" className="text-xs">
                  Amount ({APP_CURRENCY})
                </Label>
                <Input
                  id="edit-amt"
                  value={edit.amount}
                  onChange={(e) =>
                    setEdit({ ...edit, amount: e.target.value })
                  }
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="h-9"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-date" className="text-xs">
                  Incurred date
                </Label>
                <Input
                  id="edit-date"
                  value={edit.incurredDate}
                  onChange={(e) =>
                    setEdit({ ...edit, incurredDate: e.target.value })
                  }
                  type="date"
                  className="h-9"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-note" className="text-xs">
                  Note
                </Label>
                <Input
                  id="edit-note"
                  value={edit.note}
                  onChange={(e) =>
                    setEdit({ ...edit, note: e.target.value })
                  }
                  className="h-9"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEdit(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !edit}
              onClick={saveEdit}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
