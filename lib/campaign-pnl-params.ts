/** Default card surcharge Meta spend (e.g. 3 = payable ad cost is Insights spend × 1.03). */
export const DEFAULT_CAMPAIGN_CARD_FEE_PERCENT = 3;

/** Default sales commission taken from converted revenue (paid + confirmed) for net profit. */
export const DEFAULT_CAMPAIGN_SALES_COMMISSION_PERCENT = 2;

/** Max sensible card fee (prevent fat-finger totals). */
const MAX_META_CARD_SURCHARGE_PCT = 100;

const MAX_SALES_COMMISSION_PCT = 100;

export type CampaignPnLFractions = {
  /** Applied as: Insights spend × (1 + pct/100) → cash paid for ads. */
  cardFeePercent: number;
  /** Applied as: converted revenue × (pct/100) → salesperson commission deducted from gross. */
  salesCommissionPercentOfConvertedRevenue: number;
};

export function clampCampaignCardFeePercent(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_META_CARD_SURCHARGE_PCT, n);
}

export function clampCampaignSalesCommissionPercent(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_SALES_COMMISSION_PCT, n);
}

function parsePctRaw(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw == null || raw === "") return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

/** URL: `fee_pct`, `sales_pct` (decimals allowed, e.g. 3.5). */
export function parseCampaignPnLFractions(
  sp: { fee_pct?: string; sales_pct?: string },
  envFallBack?: Partial<CampaignPnLFractions>,
): CampaignPnLFractions {
  const cardDefault =
    envFallBack?.cardFeePercent ?? DEFAULT_CAMPAIGN_CARD_FEE_PERCENT;
  const salesDefault =
    envFallBack?.salesCommissionPercentOfConvertedRevenue ??
    DEFAULT_CAMPAIGN_SALES_COMMISSION_PERCENT;

  return {
    cardFeePercent: clampCampaignCardFeePercent(
      parsePctRaw(sp.fee_pct, cardDefault),
    ),
    salesCommissionPercentOfConvertedRevenue:
      clampCampaignSalesCommissionPercent(
        parsePctRaw(sp.sales_pct, salesDefault),
      ),
  };
}
