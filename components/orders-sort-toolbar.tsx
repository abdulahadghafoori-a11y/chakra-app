"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrdersTableSort } from "@/lib/orders-list";

const SORT_OPTIONS: { value: OrdersTableSort; label: string }[] = [
  { value: "recorded_desc", label: "Recorded (newest first)" },
  { value: "recorded_asc", label: "Recorded (oldest first)" },
  { value: "event_desc", label: "Order event (newest first)" },
  { value: "event_asc", label: "Order event (oldest first)" },
  { value: "total_desc", label: "Total (high → low)" },
  { value: "total_asc", label: "Total (low → high)" },
];

/** Base UI `<Select.Value>` shows raw `value` unless `items` maps value → label (especially on narrow triggers). */
const SORT_ITEMS = Object.fromEntries(
  SORT_OPTIONS.map((o) => [o.value, o.label]),
) as Record<OrdersTableSort, string>;

export function OrdersSortToolbar({ sort }: { sort: OrdersTableSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function applySort(next: OrdersTableSort) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (next === "recorded_desc") {
      nextParams.delete("sort");
    } else {
      nextParams.set("sort", next);
    }
    const qs = nextParams.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs sm:text-sm">Sort</span>
      <Select
        items={SORT_ITEMS}
        value={sort}
        onValueChange={(v) => {
          if (!v) return;
          applySort(v as OrdersTableSort);
        }}
      >
        <SelectTrigger className="h-9 w-full min-w-0 max-w-[min(100%,20rem)] sm:w-[12.5rem]" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
