"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 350;

type Props = {
  initialQuery: string;
  /** Preserve other query keys (sort, contactId, …). */
  preserveKeys?: string[];
};

export function OrdersSearchToolbar({
  initialQuery,
  preserveKeys = ["sort", "contactId"],
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(initialQuery);

  useEffect(() => {
    setDraft(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = draft.trim();
      const nextParams = new URLSearchParams();
      for (const key of preserveKeys) {
        const v = searchParams.get(key);
        if (v) nextParams.set(key, v);
      }
      if (trimmed) nextParams.set("q", trimmed);
      nextParams.delete("page");
      const qs = nextParams.toString();
      const nextUrl = qs ? `${pathname}?${qs}` : pathname;
      const currentQs = searchParams.toString();
      const currentUrl = currentQs ? `${pathname}?${currentQs}` : pathname;
      if (nextUrl !== currentUrl) {
        router.replace(nextUrl);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, pathname, preserveKeys, router, searchParams]);

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <label className="text-muted-foreground text-xs sm:text-sm" htmlFor="orders-search">
        Search orders
      </label>
      <Input
        id="orders-search"
        type="search"
        placeholder="Order id, phone, customer, product, province, tracking, status…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-9 max-w-xl"
        autoComplete="off"
      />
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        Filters after {DEBOUNCE_MS}ms. Matches products on the order, delivery fields, and
        contact phone.
      </p>
    </div>
  );
}
