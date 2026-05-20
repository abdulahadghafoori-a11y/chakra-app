"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  pageCount: number;
  total: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  className?: string;
};

export function ClientTablePagination({
  page,
  pageCount,
  total,
  itemLabel,
  onPageChange,
  className,
}: Props) {
  const safePage = Math.min(Math.max(1, page), pageCount);

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
        onClick={() => onPageChange(Math.max(1, safePage - 1))}
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
        onClick={() => onPageChange(Math.min(pageCount, safePage + 1))}
        aria-label="Next page"
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}
