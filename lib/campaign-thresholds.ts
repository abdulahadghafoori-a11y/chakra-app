function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  const n = raw != null ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function parseRatio(raw: string | undefined, fallback: number): number {
  const n = raw != null ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

export type CampaignThresholds = {
  minSpendToJudge: number;
  minCtwaSessionsToJudge: number;
  minPaidOrdersToScale: number;
  maxCpaPaidOrder: number;
  targetProfitRoas: number;
  killSpendWithZeroPaidOrders: number;
  maxPendingRevenueShare: number;
  minOrderConvFromCtwa: number;
  minPaidConvFromCtwa: number;
  optimizeSpendFloor: number;
};

/**
 * Tune via env (all optional). Defaults are conservative for small accounts.
 */
export function getCampaignThresholds(): CampaignThresholds {
  return {
    minSpendToJudge: parsePositiveNumber(
      process.env.CAMPAIGN_MIN_SPEND_TO_JUDGE,
      25,
    ),
    minCtwaSessionsToJudge: parsePositiveNumber(
      process.env.CAMPAIGN_MIN_CTWA_SESSIONS_TO_JUDGE,
      15,
    ),
    minPaidOrdersToScale: Math.max(
      1,
      Math.floor(
        parsePositiveNumber(
          process.env.CAMPAIGN_MIN_PAID_ORDERS_TO_SCALE,
          3,
        ),
      ),
    ),
    maxCpaPaidOrder: parsePositiveNumber(
      process.env.CAMPAIGN_MAX_CPA_PAID_ORDER,
      999_999,
    ),
    targetProfitRoas: parsePositiveNumber(
      process.env.CAMPAIGN_TARGET_PROFIT_ROAS,
      1.5,
    ),
    killSpendWithZeroPaidOrders: parsePositiveNumber(
      process.env.CAMPAIGN_KILL_SPEND_WITH_ZERO_PAID_ORDERS,
      50,
    ),
    maxPendingRevenueShare: parseRatio(
      process.env.CAMPAIGN_MAX_PENDING_REVENUE_SHARE,
      0.55,
    ),
    minOrderConvFromCtwa: parseRatio(
      process.env.CAMPAIGN_MIN_ORDER_CONV_FROM_CTWA,
      0.02,
    ),
    minPaidConvFromCtwa: parseRatio(
      process.env.CAMPAIGN_MIN_PAID_CONV_FROM_CTWA,
      0.01,
    ),
    optimizeSpendFloor: parsePositiveNumber(
      process.env.CAMPAIGN_OPTIMIZE_SPEND_FLOOR,
      20,
    ),
  };
}
