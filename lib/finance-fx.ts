import { getAppFxUsdAfnRow } from "@/lib/app-fx-usd-afn";
import {
  afnAmountToUsd2,
  formatUsd2,
  parseAfnPerOneUsdFromDb,
  roundAfnWhole,
} from "@/lib/fx-afn-usd";

export type ResolvedFinanceFx = {
  afnPerOneUsd: number;
  snapshot: string;
};

export async function resolveFinanceFx(): Promise<
  ResolvedFinanceFx | { error: string }
> {
  const row = await getAppFxUsdAfnRow();
  const afnPerOneUsd = parseAfnPerOneUsdFromDb(row?.afnPerOneUsd);
  if (!Number.isFinite(afnPerOneUsd) || afnPerOneUsd <= 0) {
    return {
      error:
        "Set the USD→AFN rate on the order form or run the app_fx_usd_afn migration before recording amounts.",
    };
  }
  const snapshot =
    typeof row?.afnPerOneUsd === "string"
      ? row.afnPerOneUsd.trim()
      : String(afnPerOneUsd);
  return { afnPerOneUsd, snapshot };
}

export function afnInputToStoredUsd(
  amountAfn: number,
  afnPerOneUsd: number,
): { amountAfnWhole: number; amountUsd: string } | { error: string } {
  const amountAfnWhole = roundAfnWhole(amountAfn);
  if (amountAfnWhole <= 0) {
    return { error: "Enter a positive amount in AFN." };
  }
  const usd = afnAmountToUsd2(amountAfnWhole, afnPerOneUsd);
  if (!Number.isFinite(usd) || usd <= 0) {
    return { error: "Invalid AFN amount or FX rate." };
  }
  return { amountAfnWhole, amountUsd: formatUsd2(usd) };
}
