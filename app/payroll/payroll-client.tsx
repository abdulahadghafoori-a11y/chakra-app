"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addPayrollPaymentAction,
  createEmployeeAction,
  deletePayrollPaymentAction,
  updateEmployeeAction,
  updatePayrollPaymentAction,
} from "@/actions/payroll";
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
import { afnAmountToUsd2 } from "@/lib/fx-afn-usd";
import type { EmployeeRow, PayrollPaymentRow } from "@/lib/payroll-list";
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

function formatAfn(n: string) {
  const v = Number.parseFloat(n);
  if (Number.isNaN(v)) return n;
  return `${Math.round(v).toLocaleString()} AFN`;
}

type Props = {
  employees: EmployeeRow[];
  payments: PayrollPaymentRow[];
  initialFx: PublicFxState | null;
  canStaffEditFx: boolean;
};

export function PayrollClient({
  employees,
  payments,
  initialFx,
  canStaffEditFx,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.isActive),
    [employees],
  );
  const [payEmployeeId, setPayEmployeeId] = useState(
    () => activeEmployees[0]?.id ?? "",
  );
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [editEmployee, setEditEmployee] = useState<EmployeeRow | null>(null);
  const [editPayment, setEditPayment] = useState<PayrollPaymentRow | null>(null);

  const afnPerUsd = initialFx?.afnPerOneUsd ?? 0;

  const totalUsd = useMemo(
    () =>
      payments.reduce((s, p) => s + Number.parseFloat(p.amount || "0"), 0),
    [payments],
  );

  const addEmployee = () => {
    if (!newName.trim()) {
      toast.error("Enter a name.");
      return;
    }
    startTransition(async () => {
      const r = await createEmployeeAction({
        name: newName.trim(),
        role: newRole.trim() || undefined,
        phone: newPhone.trim() || undefined,
      });
      if (r.ok) {
        toast.success("Employee added.");
        setNewName("");
        setNewRole("");
        setNewPhone("");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const submitPayment = (fd: FormData) => {
    const amountAfn = Number.parseInt(fd.get("amountAfn")?.toString() ?? "", 10);
    const paidAt = fd.get("paidAt")?.toString();
    const periodLabel = fd.get("periodLabel")?.toString();
    const note = fd.get("note")?.toString();
    if (!payEmployeeId) {
      toast.error("Select an employee.");
      return;
    }
    if (!paidAt || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      toast.error("Use a valid paid date.");
      return;
    }
    if (!Number.isFinite(amountAfn) || amountAfn <= 0) {
      toast.error("Enter a positive whole-number amount in AFN.");
      return;
    }
    startTransition(async () => {
      const r = await addPayrollPaymentAction({
        employeeId: payEmployeeId,
        amountAfn,
        paidAt,
        periodLabel: periodLabel?.trim() || undefined,
        note: note?.trim() || undefined,
      });
      if (r.ok) {
        toast.success("Payment recorded.");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const saveEmployee = () => {
    if (!editEmployee) return;
    startTransition(async () => {
      const r = await updateEmployeeAction({
        id: editEmployee.id,
        name: editEmployee.name,
        role: editEmployee.role ?? undefined,
        phone: editEmployee.phone ?? undefined,
        notes: editEmployee.notes ?? undefined,
        isActive: editEmployee.isActive,
      });
      if (r.ok) {
        toast.success("Employee updated.");
        setEditEmployee(null);
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const savePayment = () => {
    if (!editPayment) return;
    const amountAfn = Number.parseInt(editPayment.amountAfn, 10);
    if (!Number.isFinite(amountAfn) || amountAfn <= 0) {
      toast.error("Enter a positive AFN amount.");
      return;
    }
    startTransition(async () => {
      const r = await updatePayrollPaymentAction({
        id: editPayment.id,
        employeeId: editPayment.employeeId,
        amountAfn,
        paidAt: editPayment.paidAt,
        periodLabel: editPayment.periodLabel ?? undefined,
        note: editPayment.note ?? undefined,
      });
      if (r.ok) {
        toast.success("Payment updated.");
        setEditPayment(null);
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const onDeletePayment = (id: string) => {
    if (!globalThis.confirm("Delete this payment?")) return;
    startTransition(async () => {
      const r = await deletePayrollPaymentAction({ id });
      if (r.ok) {
        toast.success("Deleted.");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  return (
    <div className="space-y-8">
      <OrderFormFxBar initialFx={initialFx} canStaffEditFx={canStaffEditFx} />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Employees</h2>
        <div className="flex flex-wrap items-end gap-2 rounded-xl border p-4">
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Role</Label>
            <Input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-36"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Phone</Label>
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="w-40"
            />
          </div>
          <Button type="button" size="sm" disabled={pending} onClick={addEmployee}>
            Add employee
          </Button>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {employees.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <div>
                <p className="font-medium">
                  {e.name}
                  {!e.isActive ? (
                    <span className="text-muted-foreground ml-1 text-xs font-normal">
                      (inactive)
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {[e.role, e.phone].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditEmployee({ ...e })}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Record payment</h2>
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitPayment(new FormData(e.currentTarget));
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Employee</Label>
            <Select
              value={payEmployeeId}
              onValueChange={(v) => v && setPayEmployeeId(v)}
            >
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {activeEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
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
            <Label className="text-xs">Paid date</Label>
            <Input
              name="paidAt"
              type="date"
              className="h-9 w-[11rem]"
              defaultValue={todayIsoDate()}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Period label</Label>
            <Input
              name="periodLabel"
              className="h-9 w-40"
              placeholder="May 2026"
            />
          </div>
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
            <Label className="text-xs">Note</Label>
            <Input name="note" className="h-9" placeholder="Optional" />
          </div>
          <Button type="submit" size="sm" disabled={pending || !payEmployeeId}>
            Record payment
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payment history</h2>
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
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">AFN</TableHead>
                  <TableHead className="text-right">USD</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No payments yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {p.paidAt}
                      </TableCell>
                      <TableCell>{p.employeeName}</TableCell>
                      <TableCell className="text-sm">
                        {p.periodLabel ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatAfn(p.amountAfn)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {moneyUsd(p.amount)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {p.note ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setEditPayment({
                              ...p,
                              amountAfn: String(
                                Math.round(Number.parseFloat(p.amountAfn)),
                              ),
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
                          onClick={() => onDeletePayment(p.id)}
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
      </section>

      <Dialog
        open={editEmployee != null}
        onOpenChange={(o) => !o && setEditEmployee(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit employee</DialogTitle>
          </DialogHeader>
          {editEmployee ? (
            <div className="grid gap-3 py-2">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input
                  value={editEmployee.name}
                  onChange={(e) =>
                    setEditEmployee({ ...editEmployee, name: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Input
                  value={editEmployee.role ?? ""}
                  onChange={(e) =>
                    setEditEmployee({ ...editEmployee, role: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Phone</Label>
                <Input
                  value={editEmployee.phone ?? ""}
                  onChange={(e) =>
                    setEditEmployee({ ...editEmployee, phone: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="emp-active"
                  checked={editEmployee.isActive}
                  onChange={(e) =>
                    setEditEmployee({
                      ...editEmployee,
                      isActive: e.target.checked,
                    })
                  }
                />
                <Label htmlFor="emp-active">Active (can receive payments)</Label>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEmployee(null)}>
              Cancel
            </Button>
            <Button onClick={saveEmployee} disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editPayment != null}
        onOpenChange={(o) => !o && setEditPayment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit payment</DialogTitle>
          </DialogHeader>
          {editPayment ? (
            <div className="grid gap-3 py-2">
              <div className="flex flex-col gap-1.5">
                <Label>Employee</Label>
                <Select
                  value={editPayment.employeeId}
                  onValueChange={(v) => {
                    if (v) setEditPayment({ ...editPayment, employeeId: v });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {employees
                      .filter((e) => e.isActive || e.id === editPayment.employeeId)
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Amount (AFN)</Label>
                <Input
                  type="number"
                  value={editPayment.amountAfn}
                  onChange={(e) =>
                    setEditPayment({ ...editPayment, amountAfn: e.target.value })
                  }
                />
                {afnPerUsd > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    ≈{" "}
                    {moneyUsd(
                      String(
                        afnAmountToUsd2(
                          Number.parseInt(editPayment.amountAfn, 10) || 0,
                          afnPerUsd,
                        ),
                      ),
                    )}{" "}
                    at current FX
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Paid date</Label>
                <Input
                  type="date"
                  value={editPayment.paidAt}
                  onChange={(e) =>
                    setEditPayment({ ...editPayment, paidAt: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Period label</Label>
                <Input
                  value={editPayment.periodLabel ?? ""}
                  onChange={(e) =>
                    setEditPayment({
                      ...editPayment,
                      periodLabel: e.target.value,
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Note</Label>
                <Input
                  value={editPayment.note ?? ""}
                  onChange={(e) =>
                    setEditPayment({ ...editPayment, note: e.target.value })
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPayment(null)}>
              Cancel
            </Button>
            <Button onClick={savePayment} disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
