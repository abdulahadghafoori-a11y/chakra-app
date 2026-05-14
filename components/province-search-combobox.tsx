"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Command } from "cmdk";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  provinces: readonly string[];
  value: string;
  onChange: (province: string) => void;
  placeholder?: string;
  id?: string;
};

/** Searchable dropdown for Afghanistan provinces (excluding Kabul in typical lists). */
export function ProvinceSearchCombobox({
  provinces,
  value,
  onChange,
  placeholder = "Search province…",
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const trimmed = value.trim();

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [open]);

  const selectedLabel = useMemo(() => {
    if (!trimmed) return null;
    const found = provinces.find((p) => p === trimmed);
    return found ?? trimmed;
  }, [provinces, trimmed]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <button
        id={id}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "border-input bg-background hover:bg-accent/60 flex h-11 min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm shadow-xs transition-colors sm:h-9 sm:min-h-0",
          open && "ring-ring ring-[1.5px]",
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left font-medium",
            !selectedLabel && "text-muted-foreground font-normal",
          )}
        >
          {selectedLabel ?? "Select province…"}
        </span>
        <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 opacity-70" />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none"
          role="listbox"
        >
          <Command label="Province search">
            <Command.Input
              placeholder={placeholder}
              className="placeholder:text-muted-foreground border-input h-11 w-full border-0 border-b bg-transparent px-3 text-sm outline-none sm:h-9"
            />
            <Command.List className="max-h-[min(50vh,280px)] overflow-y-auto overscroll-contain p-1">
              <Command.Empty className="text-muted-foreground py-6 text-center text-sm">
                No province matches.
              </Command.Empty>
              <Command.Group>
                {provinces.map((p) => {
                  const selected = trimmed === p;
                  return (
                    <Command.Item
                      key={p}
                      value={p}
                      keywords={[p]}
                      onSelect={() => {
                        onChange(p);
                        setOpen(false);
                      }}
                      className="aria-selected:bg-accent aria-selected:text-accent-foreground relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2.5 text-sm outline-none sm:py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate">{p}</span>
                      {selected ? (
                        <CheckIcon className="text-primary size-4 shrink-0" />
                      ) : null}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      ) : null}
    </div>
  );
}
