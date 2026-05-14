"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Command } from "cmdk";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { MetaCampaignPickerOption } from "@/lib/campaigns-rollups";

const NONE_SENTINEL = "__none_attributed";

type Props = {
  options: MetaCampaignPickerOption[];
  value: string;
  onChange: (campaignId: string) => void;
  disabled?: boolean;
  /** Hides “Not attributed” — pairing with form + server enforcement. */
  required?: boolean;
  placeholder?: string;
  id?: string;
};

export function MetaCampaignCombobox({
  options,
  value,
  onChange,
  disabled,
  required = false,
  placeholder = "Search campaigns…",
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const trimmed = value.trim();
  const selectedLabel = useMemo(() => {
    if (!trimmed) return null;
    const row = options.find((o) => o.id === trimmed);
    return row?.name?.trim() ? row.name : trimmed;
  }, [options, trimmed]);

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

  return (
    <div ref={wrapRef} className="relative w-full">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "border-input bg-background hover:bg-accent/60 flex h-11 min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm shadow-xs transition-colors sm:h-9 sm:min-h-0",
          "disabled:pointer-events-none disabled:opacity-50",
          open && "ring-ring ring-[1.5px]",
        )}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left font-medium",
            !selectedLabel && "text-muted-foreground font-normal",
          )}
        >
          {selectedLabel ??
            (required ? "Select a campaign…" : "Not attributed")}
        </span>
        <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 opacity-70" />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none"
          role="listbox"
        >
          <Command
            label="Meta campaign search"
            className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
          >
            <Command.Input
              placeholder={placeholder}
              className="placeholder:text-muted-foreground border-input h-11 w-full border-0 border-b bg-transparent px-3 text-sm outline-none sm:h-9"
            />
            <Command.List className="max-h-[min(50vh,280px)] overflow-y-auto overscroll-contain p-1">
              <Command.Empty className="text-muted-foreground py-6 text-center text-sm">
                No campaign matches.
              </Command.Empty>
              <Command.Group>
                {!required ? (
                  <Command.Item
                    value={NONE_SENTINEL}
                    keywords={["none", "not", "attributed"]}
                    onSelect={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    className="aria-selected:bg-accent aria-selected:text-accent-foreground relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2.5 text-sm outline-none sm:py-1.5"
                  >
                    <span className="flex-1">Not attributed</span>
                    {!trimmed ? (
                      <CheckIcon className="text-primary size-4 shrink-0" />
                    ) : null}
                  </Command.Item>
                ) : null}
                {options.map((c) => {
                  const label = c.name?.trim() ? c.name : c.id;
                  const isSelected = trimmed === c.id;
                  return (
                    <Command.Item
                      key={c.id}
                      value={c.id}
                      keywords={[c.name ?? "", c.id]}
                      onSelect={() => {
                        onChange(c.id);
                        setOpen(false);
                      }}
                      className="aria-selected:bg-accent aria-selected:text-accent-foreground relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2.5 text-sm outline-none sm:py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {isSelected ? (
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
