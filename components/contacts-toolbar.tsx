"use client";

import { SearchIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONTACTS_PAGE_SIZE } from "@/lib/contacts-list";

type Props = {
  initialQ: string;
  order: "newest" | "oldest";
  page: number;
  total: number;
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

const SEARCH_DEBOUNCE_MS = 400;

export function ContactsToolbar({ initialQ, order, page, total }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);

  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  const pageCount = Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pushUrl = useCallback(
    (updates: Record<string, string | undefined>) => {
      router.push(buildPath(pathname, searchParams, updates));
    },
    [pathname, router, searchParams],
  );

  const replaceUrl = useCallback(
    (updates: Record<string, string | undefined>) => {
      router.replace(buildPath(pathname, searchParams, updates));
    },
    [pathname, router, searchParams],
  );

  const urlQNormalized = (searchParams.get("q") ?? "").trim();

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed === urlQNormalized) return;

    const id = window.setTimeout(() => {
      replaceUrl({ q: trimmed || undefined, page: "1" });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(id);
  }, [q, replaceUrl, urlQNormalized]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <form
        className="flex min-w-0 max-w-md flex-1 flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          replaceUrl({ q: q.trim() || undefined, page: "1" });
        }}
      >
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            className="h-9 pl-8"
            placeholder="Search name, phone, country…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            name="q"
            aria-label="Search contacts"
          />
        </div>
        <Button type="submit" size="sm" className="shrink-0 sm:h-9">
          Search
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs sm:text-sm">Sort</span>
          <Select
            value={order ?? "newest"}
            onValueChange={(v) => {
              if (!v) return;
              pushUrl({ order: v, page: "1" });
            }}
          >
            <SelectTrigger className="h-9 w-[10.5rem]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest in system</SelectItem>
              <SelectItem value="oldest">Oldest in system</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {total > 0 ? (
          <div className="text-muted-foreground flex items-center gap-1 text-xs sm:text-sm">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              disabled={safePage <= 1}
              onClick={() =>
                pushUrl({ page: String(Math.max(1, safePage - 1)) })
              }
              aria-label="Previous page"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <span className="min-w-[7rem] tabular-nums">
              {safePage} / {pageCount} · {total} contacts
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              disabled={safePage >= pageCount}
              onClick={() =>
                pushUrl({ page: String(Math.min(pageCount, safePage + 1)) })
              }
              aria-label="Next page"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
