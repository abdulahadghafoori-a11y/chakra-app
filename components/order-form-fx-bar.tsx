"use client";

import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  saveManualAfnPerUsd,
  syncAfnPerUsdFromApi,
} from "@/actions/fx-usd-afn";
import type { PublicFxState } from "@/lib/app-fx-usd-afn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrderFormFxBar({
  initialFx,
  canStaffEditFx,
}: {
  initialFx: PublicFxState | null;
  canStaffEditFx: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [manualText, setManualText] = useState(() =>
    initialFx && initialFx.afnPerOneUsd > 0
      ? String(initialFx.afnPerOneUsd)
      : "",
  );

  useEffect(() => {
    if (initialFx && initialFx.afnPerOneUsd > 0) {
      setManualText(String(initialFx.afnPerOneUsd));
    }
  }, [
    initialFx?.afnPerOneUsd,
    initialFx?.rateSource,
    initialFx?.syncedAt,
    initialFx?.updatedAt,
  ]);

  const sourceLabel = useMemo(() => {
    if (!initialFx) return "—";
    switch (initialFx.rateSource) {
      case "manual":
        return "Manual";
      case "frankfurter":
        return "Frankfurter (API)";
      case "exchangerate_host":
        return "ExchangeRate.host";
      case "open_er_api":
        return "Open Exchange Rates API";
      default:
        return initialFx.rateSource;
    }
  }, [initialFx]);

  const readOnlyBadge = (
    <div className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-xs">
      <p className="text-muted-foreground font-medium uppercase tracking-wide">
        USD ↔ AFN
      </p>
      {!initialFx ? (
        <p className="text-destructive font-medium">
          No FX rate configured. Set AFN per 1 USD below or sync from an API before
          saving orders.
        </p>
      ) : (
        <>
          <p className="text-foreground">
            <strong className="tabular-nums">1 USD</strong> ={" "}
            <strong className="tabular-nums">
              {initialFx.afnPerOneUsd.toFixed(2)}
            </strong>{" "}
            AFN
          </p>
          <p className="text-muted-foreground">
            Source {sourceLabel}
            {initialFx.syncedAt
              ? ` · synced ${new Date(initialFx.syncedAt).toLocaleString()}`
              : ""}
          </p>
        </>
      )}
    </div>
  );

  if (!canStaffEditFx) return readOnlyBadge;

  function applyManualRate() {
    const n = Number.parseFloat(manualText.trim().replace(",", "."));
    startTransition(() => {
      void (async () => {
        const res = await saveManualAfnPerUsd({ afnPerOneUsd: n });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Manual AFN-per-USD rate saved.");
        router.refresh();
      })();
    });
  }

  function runSyncFromApi() {
    startTransition(() => {
      void (async () => {
        const res = await syncAfnPerUsdFromApi();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          `Synced: 1 USD ≈ ${res.afnPerOneUsd.toFixed(2)} AFN (${res.source}).`,
        );
        router.refresh();
      })();
    });
  }

  return (
    <div className="bg-muted/30 space-y-3 rounded-lg border p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          USD ↔ AFN
        </p>
        <p className="text-muted-foreground text-[11px]">
          Line/courier amounts are <strong className="text-foreground">whole AFN</strong>
          ; you can use decimals here for an accurate <strong className="text-foreground">AFN per 1 USD</strong> rate.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[8rem] flex-1 space-y-1.5">
          <Label htmlFor="afn-per-usd-manual" className="text-xs">
            AFN per 1 USD
          </Label>
          <Input
            id="afn-per-usd-manual"
            className="h-9 font-mono text-sm tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={manualText}
            disabled={pending}
            onChange={(e) => setManualText(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 shrink-0"
          disabled={pending}
          onClick={applyManualRate}
        >
          {pending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            "Save rate"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1.5"
          disabled={pending}
          onClick={runSyncFromApi}
          title="Try free APIs (Frankfurter, then fallbacks)."
        >
          {pending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-3.5" />
          )}
          Sync API
        </Button>
      </div>
      {initialFx ? (
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Current stored rate:{" "}
          <span className="text-foreground font-mono tabular-nums font-medium">
            {initialFx.afnPerOneUsd.toFixed(2)}
          </span>{" "}
          AFN / USD ({sourceLabel}
          {initialFx.syncedAt
            ? ` · last sync ${new Date(initialFx.syncedAt).toLocaleString()}`
            : ""}
          ).
        </p>
      ) : (
        <p className="text-muted-foreground text-[11px]">
          Save a positive number or sync from an API once the database migration for{" "}
          <code className="text-[10px]">app_fx_usd_afn</code> has been applied.
        </p>
      )}
    </div>
  );
}
