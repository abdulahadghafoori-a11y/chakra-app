"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  pageCount: number;
  total: number;
  /** Plural noun, e.g. "orders", "contacts". */
  itemLabel: string;
  /** URL query key for page (default `page`). */
  paramKey?: string;
  /** Query keys to preserve when changing page (all current params if omitted). */
  preserveKeys?: string[];
  className?: string;
};

function buildPath(
  pathname: string,
  params: URLSearchParams,
  updates: Record<string, string | undefined>,
): string {
  const next = new URLSearchParams(params.toString());
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined || v === "") {
      next.delete(k);
    } else {
      next.set(k, v);
    }
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function TablePagination({
  page,
  pageCount,
  total,
  itemLabel,
  paramKey = "page",
  preserveKeys,
  className,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const safePage = Math.min(Math.max(1, page), pageCount);

  const pushUrl = useCallback(
    (updates: Record<string, string | undefined>) => {
      if (preserveKeys?.length) {
        const next = new URLSearchParams();
        for (const key of preserveKeys) {
          const v = searchParams.get(key);
          if (v != null && v !== "") next.set(key, v);
        }
        for (const [k, v] of Object.entries(updates)) {
          if (v === undefined || v === "") next.delete(k);
          else next.set(k, v);
        }
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
        return;
      }
      router.push(buildPath(pathname, searchParams, updates));
    },
    [pathname, preserveKeys, router, searchParams],
  );

  if (total <= 0) return null;

  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap items-center justify-end gap-1 text-xs sm:text-sm",
        className,
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 shrink-0"
        disabled={safePage <= 1}
        onClick={() =>
          pushUrl({ [paramKey]: String(Math.max(1, safePage - 1)) })
        }
        aria-label="Previous page"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      <span className="min-w-[7rem] tabular-nums">
        {safePage} / {pageCount} · {total} {itemLabel}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 shrink-0"
        disabled={safePage >= pageCount}
        onClick={() =>
          pushUrl({
            [paramKey]: String(Math.min(pageCount, safePage + 1)),
          })
        }
        aria-label="Next page"
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}
