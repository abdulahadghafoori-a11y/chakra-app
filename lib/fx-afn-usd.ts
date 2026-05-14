/**
 * Order form uses whole Afghanis; DB + Meta CAPI keep USD with 2 decimal places.
 * `afnPerOneUsd` = how many AFN equal exactly 1.00 USD (may be fractional for accurate conversion).
 */

export const STORED_USD_DECIMALS = 2;

export function roundUsd2(usdRaw: number): number {
  if (!Number.isFinite(usdRaw)) return Number.NaN;
  return Math.round((usdRaw + Number.EPSILON) * 100) / 100;
}

/** Whole Afghanis — prices and stored AFN totals have no fractional part. */
export function roundAfnWhole(afnRaw: number): number {
  if (!Number.isFinite(afnRaw)) return Number.NaN;
  return Math.round(afnRaw + Number.EPSILON);
}

export function afnToUsd(afn: number, afnPerOneUsd: number): number {
  if (!(afnPerOneUsd > 0) || !Number.isFinite(afn)) return Number.NaN;
  return afn / afnPerOneUsd;
}

/** Unit / line / order amounts stored as USD with two fraction digits. */
export function afnAmountToUsd2(afn: number, afnPerOneUsd: number): number {
  return roundUsd2(afnToUsd(afn, afnPerOneUsd));
}

export function catalogUsdToDefaultAfn(
  usdCatalogUnit: number,
  afnPerOneUsd: number,
): number {
  if (!(afnPerOneUsd > 0) || !Number.isFinite(usdCatalogUnit)) return Number.NaN;
  return roundAfnWhole(usdCatalogUnit * afnPerOneUsd);
}

export function formatUsd2(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(STORED_USD_DECIMALS);
}

export function parseAfnPerOneUsdFromDb(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : Number.NaN;
}

/**
 * Whole AFN consistent with stored USD and the order-time rate (USD is canonical).
 * Null when `afn_per_usd_snapshot` is missing or invalid.
 */
export function estimateAfnWholeFromStoredUsd(
  usdAmount: number,
  afnPerUsdSnapshot: string | null | undefined,
): number | null {
  const rate = parseAfnPerOneUsdFromDb(afnPerUsdSnapshot);
  if (!(rate > 0) || !Number.isFinite(usdAmount)) return null;
  return roundAfnWhole(usdAmount * rate);
}
