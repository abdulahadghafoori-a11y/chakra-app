function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  const n = raw != null ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = raw != null ? Number.parseInt(raw, 10) : NaN;
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
  /**
   * Fallback CPA cap (payable spend ÷ converted orders) when net profit per order
   * is unavailable or non-positive — replaces legacy fixed 999999.
   */
  absoluteMaxCpaPaidOrder: number;
  /** Positive net profit per converted order ÷ this divisor → dynamic CPA ceiling. */
  cpaCapProfitDivisor: number;
  targetProfitRoas: number;
  killSpendWithZeroPaidOrders: number;
  maxPendingRevenueShare: number;
  minOrderConvFromCtwa: number;
  minPaidConvFromCtwa: number;
  optimizeSpendFloor: number;
  /** Minimum Insights spend before CTR / outbound engagement rules run. */
  minSpendEngagementQuality: number;
  minCtr: number;
  minOutboundCtr: number;
  minQualityRankScore: number;
  maxAvgFrequency: number;
  minFirstImpressionRatio: number;
  maxDailyProfitCv: number;
  minPaidOrdersForConfidence: number;
  minRoasLowerBoundForScale: number;
  maxReturnRate: number;
  maxDaysPendingIncrease: number;
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
    absoluteMaxCpaPaidOrder: parsePositiveNumber(
      process.env.CAMPAIGN_ABSOLUTE_MAX_CPA_PAID_ORDER,
      35,
    ),
    cpaCapProfitDivisor: parsePositiveNumber(
      process.env.CAMPAIGN_CPA_CAP_PROFIT_DIVISOR,
      1.1,
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
    minSpendEngagementQuality: parsePositiveNumber(
      process.env.CAMPAIGN_MIN_SPEND_ENGAGEMENT_QUALITY,
      30,
    ),
    minCtr: parseRatio(process.env.CAMPAIGN_MIN_CTR, 0.005),
    minOutboundCtr: parseRatio(process.env.CAMPAIGN_MIN_OUTBOUND_CTR, 0.003),
    minQualityRankScore: parseRatio(
      process.env.CAMPAIGN_MIN_QUALITY_RANK_SCORE,
      0.3,
    ),
    maxAvgFrequency: parsePositiveNumber(
      process.env.CAMPAIGN_MAX_AVG_FREQUENCY,
      2.5,
    ),
    minFirstImpressionRatio: parseRatio(
      process.env.CAMPAIGN_MIN_FIRST_IMPRESSION_RATIO,
      0.7,
    ),
    maxDailyProfitCv: parsePositiveNumber(
      process.env.CAMPAIGN_MAX_DAILY_PROFIT_CV,
      0.7,
    ),
    minPaidOrdersForConfidence: Math.max(
      1,
      parsePositiveInt(
        process.env.CAMPAIGN_MIN_PAID_ORDERS_FOR_CONFIDENCE,
        12,
      ),
    ),
    minRoasLowerBoundForScale: parsePositiveNumber(
      process.env.CAMPAIGN_MIN_ROAS_LOWER_BOUND,
      1.1,
    ),
    maxReturnRate: parseRatio(process.env.CAMPAIGN_MAX_RETURN_RATE, 0.15),
    maxDaysPendingIncrease: parsePositiveNumber(
      process.env.CAMPAIGN_MAX_DAYS_PENDING_INCREASE,
      2,
    ),
  };
}
