import type { CampaignThresholds } from "./campaign-thresholds";

export type CampaignVerdict =
  | "SCALE"
  | "KEEP"
  | "OPTIMIZE"
  | "KILL"
  | "LEARNING"
  | "ATTRIBUTION_ISSUE";

export type VerdictReasonCode =
  | "insufficient_data"
  | "bleed_no_paid_orders"
  | "negative_contribution_with_data"
  | "profit_roas_above_target"
  | "cpa_above_max"
  | "pending_revenue_too_high"
  | "pending_orders_high"
  | "low_ctwa_conversion"
  | "low_paid_conversion"
  | "scale_candidate"
  | "neutral_hold"
  | "no_ctwa_sessions_with_spend"
  | "capi_coverage_low"
  | "paid_orders_below_min"
  | "unattributed_orders_exist"
  | "weak_creative_ctr"
  | "low_outbound_engagement"
  | "quality_ranking_low_streak"
  | "frequency_cap_breach"
  | "retargeting_over_reliance"
  | "profit_too_volatile_to_scale"
  | "insufficient_confidence_paid_orders"
  | "roas_lower_bound_below_min"
  | "high_return_rate"
  | "pending_delay_spike"
  | "scale_blocked_guards";

export type VerdictReason = {
  code: VerdictReasonCode;
  message: string;
};

export type CampaignVerdictInput = {
  /** Meta Insights spend (same as `spend`; decision thresholds that compare to Insights use this where noted). */
  spend: number;
  /** Percent surcharge on Insights spend toward cash payable (card fee); 3 means ×1.03. */
  paymentCardFeePercent: number;
  /** Percent of converted revenue deducted as salesperson commission before net profit. */
  salesCommissionPercentOfConvertedRevenue: number;
  ctwaSessions: number;
  ordersCount: number;
  paidOrdersCount: number;
  pendingOrdersCount: number;
  totalRevenue: number;
  paidRevenue: number;
  /** Paid + confirmed orders — COD funnel decisions treat confirmed like converted revenue. */
  convertedOrdersCount: number;
  convertedRevenue: number;
  totalLineCogs: number;
  paidLineCogs: number;
  convertedLineCogs: number;
  /** Sum of `orders.delivery_cost` on paid + confirmed orders in the window (deducted from net). */
  paidOperationalCosts: number;
  capiSentCount: number;
  /** Meta Ads Insights — messaging conversations started (bidding/delivery context). */
  metaMessagingConversationsStarted: number;
  /** Meta Ads Insights — purchase actions; never drives verdict (orders can skip CTWA / CAPI). */
  metaPurchases: number;
  /** Shipped orders in window — used for return rate denominator when available. */
  shippedOrdersCount: number;
  /** Returned orders in window. */
  returnedOrdersCount: number;
};

/** Optional delivery / creative signals — omit or leave null to skip conditional checks. */
export type CampaignExtendedSignals = {
  linkCtr?: number | null;
  /** Typically messaging_conversations_started ÷ link clicks. */
  outboundCtr?: number | null;
  qualityRankingScore0to1?: number | null;
  /** Consecutive days quality score stayed below threshold (caller-computed). */
  qualityRankingLowStreakDays?: number | null;
  weeklyAvgFrequency?: number | null;
  /** Share of impressions that are first-time (0–1). */
  firstImpressionShare?: number | null;
  /** CV of daily net profit, last 7 UTC days ending on report `until` day. */
  dailyNetProfitCv7d?: number | null;
  /** returned ÷ shipped when shipped > 0. */
  returnRate?: number | null;
  avgDaysOrderToConfirmRecent?: number | null;
  avgDaysOrderToConfirmBaseline?: number | null;
};

export type EvaluateCampaignOptions = {
  unattributedOrdersInWindow?: number;
  signals?: CampaignExtendedSignals;
  logContext?: string;
  /** When true, skip return-rate flags (scale path handles return as a hard gate). */
  omitReturnRateNotes?: boolean;
};

export type CampaignVerdictResult = {
  verdict: CampaignVerdict;
  reasons: VerdictReason[];
  confidence: "high" | "medium" | "low";
  grossProfitPaid: number;
  /** Spend from Insights (payment processor surcharge applied separately → paidAdSpend). */
  metaReportedSpend: number;
  paidAdSpend: number;
  cardSurchargeAmount: number;
  salesCommissionPaid: number;
  /** Sum of `orders.delivery_cost` on paid + confirmed orders in the window (deducted from net). */
  convertedDeliveryCost: number;
  netProfitPaid: number;
  /** Gross minus Meta-reported spend only (before card surcharge & commission); diagnostic. */
  preFeeContribution: number;
  /**
   * Net profit after payable ads, sales commission, and delivery costs (= netProfitPaid).
   * Name kept for callers that historically meant “after ad spend”; now reflects full deductions.
   */
  contributionProfit: number;
  profitRoas: number | null;
  /** Net profit ÷ payable ad spend. */
  contributionRoas: number | null;
  cpaPaid: number | null;
  orderConvFromCtwa: number | null;
  paidConvFromCtwa: number | null;
  pendingRevenueShare: number | null;
  capiRate: number | null;
  /** orders ÷ Meta messaging starts — numerator/denominator use different attribution; informational only (not funnel truth). */
  orderConvFromMetaMessaging: number | null;
  /** Meta Insights purchases ÷ app converted orders—diagnostic only; verdict ignores Meta purchases. */
  metaPurchasesPerPaidOrder: number | null;
  /** Effective CPA ceiling used for kill rule (dynamic from net/order or absolute fallback). */
  effectiveMaxCpaPaidOrder: number;
};

function finalizeReasons(
  reasons: VerdictReason[],
  opts?: EvaluateCampaignOptions,
): VerdictReason[] {
  return withGlobalReasons(reasons, opts);
}

function withGlobalReasons(
  reasons: VerdictReason[],
  opts?: EvaluateCampaignOptions,
): VerdictReason[] {
  const n = opts?.unattributedOrdersInWindow ?? 0;
  if (n <= 0) return reasons;
  return [
    {
      code: "unattributed_orders_exist",
      message: `${n} order(s) in this window have no CTWA session and no manual campaign link—campaign rows only cover attributed revenue.`,
    },
    ...reasons,
  ];
}

function logMissingMetric(ctx: string | undefined, label: string): void {
  if (ctx) {
    console.warn(
      `[campaign-verdict] ${ctx}: ${label} — rule skipped (data not in pipeline).`,
    );
  }
}

/**
 * Heuristic one-sided ~75% lower bound on gross-profit ROAS using order count as fidelity proxy.
 * When data for a proper interval estimate is unavailable, this blocks unreasonable scaling on thin samples.
 */
function profitRoasLowerBoundHeuristic(
  profitRoas: number,
  paidOrders: number,
): number | null {
  if (paidOrders < 3 || !Number.isFinite(profitRoas)) return null;
  const se = profitRoas / Math.sqrt(paidOrders);
  return profitRoas - 0.674 * se;
}

function effectiveMaxCpaPaidOrder(
  m: CampaignVerdictInput,
  netProfitPaid: number,
  t: CampaignThresholds,
): number {
  if (m.convertedOrdersCount <= 0) return t.absoluteMaxCpaPaidOrder;
  const ppo = netProfitPaid / m.convertedOrdersCount;
  if (ppo > 0 && Number.isFinite(ppo)) {
    return ppo / Math.max(1e-6, t.cpaCapProfitDivisor);
  }
  return t.absoluteMaxCpaPaidOrder;
}

function maybeScaleConfidenceNotes(
  m: CampaignVerdictInput,
  t: CampaignThresholds,
  reasons: VerdictReason[],
): void {
  if (
    m.convertedOrdersCount > 0 &&
    m.convertedOrdersCount < t.minPaidOrdersToScale
  ) {
    reasons.push({
      code: "paid_orders_below_min",
      message: `Only ${m.convertedOrdersCount} converted order(s) (paid, confirmed, shipped)—need at least ${t.minPaidOrdersToScale} for scale confidence.`,
    });
  }
  if (
    m.pendingOrdersCount >= 4 &&
    m.convertedOrdersCount > 0 &&
    m.pendingOrdersCount >= m.convertedOrdersCount * 2 &&
    m.convertedOrdersCount < t.minPaidOrdersToScale
  ) {
    reasons.push({
      code: "pending_orders_high",
      message:
        "Pending pipeline is large vs converted orders—confirm fulfillment and collection before scaling.",
    });
  }
}

function appendEngagementAndQualityNotes(
  m: CampaignVerdictInput,
  t: CampaignThresholds,
  signals: CampaignExtendedSignals | undefined,
  reasons: VerdictReason[],
  opts?: EvaluateCampaignOptions,
): void {
  if (m.spend < t.minSpendToJudge) return;

  const minEngSpend = t.minSpendEngagementQuality;
  const s = signals;
  const omitReturn = opts?.omitReturnRateNotes === true;

  if (m.spend > minEngSpend) {
    if (s?.linkCtr != null && s.linkCtr < t.minCtr) {
      reasons.push({
        code: "weak_creative_ctr",
        message: `Weak Creative: link CTR ${(s.linkCtr * 100).toFixed(2)}% is below ${(t.minCtr * 100).toFixed(2)}% (spend > ${minEngSpend}).`,
      });
    }
    if (s?.outboundCtr != null && s.outboundCtr < t.minOutboundCtr) {
      reasons.push({
        code: "low_outbound_engagement",
        message: `Low Outbound Engagement: CTWA/outbound CTR ${(s.outboundCtr * 100).toFixed(2)}% is below ${(t.minOutboundCtr * 100).toFixed(2)}% (spend > ${minEngSpend}).`,
      });
    }
  }

  const qs = s?.qualityRankingScore0to1;
  const streak = s?.qualityRankingLowStreakDays;
  if (streak != null && streak > 1) {
    reasons.push({
      code: "quality_ranking_low_streak",
      message: `Meta quality ranking (mapped score) stayed below target for ${streak} consecutive UTC day(s); trailing 7d weighted score ${qs != null ? qs.toFixed(2) : "n/a"}.`,
    });
  }

  if (
    !omitReturn &&
    m.spend >= t.minSpendToJudge &&
    m.ctwaSessions >= t.minCtwaSessionsToJudge &&
    m.paidOrdersCount > 10
  ) {
    if (s?.returnRate == null) {
      logMissingMetric(
        opts?.logContext,
        "Return rate (returned ÷ shipped)",
      );
    } else if (s.returnRate > t.maxReturnRate) {
      reasons.push({
        code: "high_return_rate",
        message: `High Returns: return rate ${(s.returnRate * 100).toFixed(1)}% exceeds ${(t.maxReturnRate * 100).toFixed(0)}% with sufficient paid orders.`,
      });
    }
  }
}

/** Scale blockers when a campaign is otherwise a SCALE candidate. */
function collectScaleBlockers(
  m: CampaignVerdictInput,
  t: CampaignThresholds,
  signals: CampaignExtendedSignals | undefined,
  profitRoas: number | null,
  netProfitPaid: number,
  opts?: EvaluateCampaignOptions,
): { hard: VerdictReason[]; soft: VerdictReason[] } {
  const hard: VerdictReason[] = [];
  const soft: VerdictReason[] = [];
  const s = signals;
  const ctx = opts?.logContext;

  if (m.paidOrdersCount < t.minPaidOrdersForConfidence) {
    hard.push({
      code: "insufficient_confidence_paid_orders",
      message: `Insufficient Confidence: ${m.paidOrdersCount} paid order(s); need ≥ ${t.minPaidOrdersForConfidence} to scale regardless of ROAS.`,
    });
  }

  if (s?.dailyNetProfitCv7d != null) {
    if (s.dailyNetProfitCv7d > t.maxDailyProfitCv) {
      hard.push({
        code: "profit_too_volatile_to_scale",
        message: `Too Volatile to Scale: daily net profit CV ${s.dailyNetProfitCv7d.toFixed(2)} exceeds ${t.maxDailyProfitCv.toFixed(2)} (last 7 UTC days).`,
      });
    }
  }

  const roasLb = profitRoasLowerBoundHeuristic(
    profitRoas ?? 0,
    m.paidOrdersCount,
  );
  if (profitRoas != null && m.paidOrdersCount >= 3) {
    if (roasLb != null && roasLb < t.minRoasLowerBoundForScale) {
      hard.push({
        code: "roas_lower_bound_below_min",
        message: `Gross-profit ROAS lower bound (~75% heuristic) ${roasLb.toFixed(2)}× is below ${t.minRoasLowerBoundForScale.toFixed(2)}×.`,
      });
    }
  }

  if (s?.weeklyAvgFrequency != null) {
    if (s.weeklyAvgFrequency > t.maxAvgFrequency) {
      hard.push({
        code: "frequency_cap_breach",
        message: `Frequency Cap: weekly avg frequency ${s.weeklyAvgFrequency.toFixed(2)} exceeds ${t.maxAvgFrequency.toFixed(2)} — refresh creative before scaling.`,
      });
    }
  } else {
    if (m.spend >= t.minSpendToJudge) {
      logMissingMetric(
        ctx,
        "Weekly average frequency (Meta) — add to insights sync to enforce frequency cap",
      );
    }
  }

  if (s?.firstImpressionShare != null) {
    if (s.firstImpressionShare < t.minFirstImpressionRatio) {
      hard.push({
        code: "retargeting_over_reliance",
        message: `Retargeting Over-reliance: first-impression share ${(s.firstImpressionShare * 100).toFixed(1)}% is below ${(t.minFirstImpressionRatio * 100).toFixed(0)}%.`,
      });
    }
  } else {
    if (m.spend >= t.minSpendToJudge) {
      logMissingMetric(
        ctx,
        "First-impression share (Meta) — add to insights sync for audience saturation guard",
      );
    }
  }

  const recent = s?.avgDaysOrderToConfirmRecent;
  const baseline = s?.avgDaysOrderToConfirmBaseline;
  if (recent != null && baseline != null) {
    const delaySpike = recent - baseline > t.maxDaysPendingIncrease;
    if (delaySpike) {
      soft.push({
        code: "pending_delay_spike",
        message: `Pending Delay Spike: avg order→confirmation lag ${recent.toFixed(1)}d vs baseline ${baseline.toFixed(1)}d (>${t.maxDaysPendingIncrease}d increase).`,
      });
      const badCombo =
        (profitRoas != null && profitRoas < t.targetProfitRoas) ||
        netProfitPaid < 0;
      if (badCombo) {
        hard.push({
          code: "scale_blocked_guards",
          message:
            "Pending delay spike combined with weak profitability — do not scale until lag and efficiency recover.",
        });
      }
    }
  } else {
    if (
      m.convertedOrdersCount >= t.minPaidOrdersToScale &&
      m.spend >= t.minSpendToJudge
    ) {
      logMissingMetric(
        ctx,
        "Order-to-confirmation lag (recent vs baseline from order timestamps)",
      );
    }
  }

  if (
    m.paidOrdersCount > 10 &&
    s?.returnRate != null &&
    s.returnRate > t.maxReturnRate
  ) {
    hard.push({
      code: "high_return_rate",
      message: `Scaling blocked: return rate ${(s.returnRate * 100).toFixed(1)}% exceeds cap.`,
    });
  }

  return { hard, soft };
}

export function evaluateCampaign(
  m: CampaignVerdictInput,
  t: CampaignThresholds,
  opts?: EvaluateCampaignOptions,
): CampaignVerdictResult {
  const reasons: VerdictReason[] = [];
  const signals = opts?.signals;

  const grossProfitPaid = m.convertedRevenue - m.convertedLineCogs;

  const metaReportedSpend = m.spend;
  const paidAdSpend =
    metaReportedSpend *
    (1 + Math.max(0, m.paymentCardFeePercent ?? 0) / 100);
  const cardSurchargeAmount = paidAdSpend - metaReportedSpend;
  const salesCommissionPaid =
    m.convertedRevenue *
    (Math.max(0, m.salesCommissionPercentOfConvertedRevenue ?? 0) / 100);

  const convertedDeliveryCost = Math.max(0, m.paidOperationalCosts ?? 0);

  const preFeeContribution = grossProfitPaid - metaReportedSpend;
  const netProfitPaid =
    grossProfitPaid -
    paidAdSpend -
    salesCommissionPaid -
    convertedDeliveryCost;
  const contributionProfit = netProfitPaid;

  const maxCpaEffective = effectiveMaxCpaPaidOrder(m, netProfitPaid, t);

  const contributionRoas =
    paidAdSpend > 0 ? netProfitPaid / paidAdSpend : null;
  const profitRoas =
    paidAdSpend > 0 && grossProfitPaid > 0 ? grossProfitPaid / paidAdSpend : null;
  const cpaPaid =
    m.convertedOrdersCount > 0 ? paidAdSpend / m.convertedOrdersCount : null;
  const orderConvFromCtwa =
    m.ctwaSessions > 0 ? m.ordersCount / m.ctwaSessions : null;
  const paidConvFromCtwa =
    m.ctwaSessions > 0 ? m.convertedOrdersCount / m.ctwaSessions : null;

  const pendingRevenueShare =
    m.totalRevenue > 0
      ? (m.totalRevenue - m.convertedRevenue) / m.totalRevenue
      : null;

  const capiRate =
    m.ordersCount > 0 ? m.capiSentCount / m.ordersCount : null;

  const orderConvFromMetaMessaging =
    m.metaMessagingConversationsStarted > 0
      ? m.ordersCount / m.metaMessagingConversationsStarted
      : null;
  const metaPurchasesPerPaidOrder =
    m.convertedOrdersCount > 0
      ? m.metaPurchases / m.convertedOrdersCount
      : null;

  const baseMetrics: Omit<
    CampaignVerdictResult,
    "verdict" | "reasons" | "confidence"
  > = {
    grossProfitPaid,
    metaReportedSpend,
    paidAdSpend,
    cardSurchargeAmount,
    salesCommissionPaid,
    convertedDeliveryCost,
    netProfitPaid,
    preFeeContribution,
    contributionProfit,
    profitRoas,
    contributionRoas,
    cpaPaid,
    orderConvFromCtwa,
    paidConvFromCtwa,
    pendingRevenueShare,
    capiRate,
    orderConvFromMetaMessaging,
    metaPurchasesPerPaidOrder,
    effectiveMaxCpaPaidOrder: maxCpaEffective,
  };

  if (
    m.spend >= t.optimizeSpendFloor &&
    m.ctwaSessions === 0 &&
    m.convertedOrdersCount === 0
  ) {
    const metaMsg = m.metaMessagingConversationsStarted;
    const metaHint =
      metaMsg >= 5
        ? ` (Meta Insights also reports ${metaMsg} messaging conversations started—possible delivery without app CTWA capture; verdict stays on attributed app orders.)`
        : "";
    reasons.push({
      code: "no_ctwa_sessions_with_spend",
      message:
        "There is ad spend in this window but zero CTWA sessions attributed to this campaign—verify CTWA links, sync, or date range." +
        metaHint,
    });
    return {
      verdict: "ATTRIBUTION_ISSUE",
      reasons: finalizeReasons(reasons, opts),
      confidence: "medium",
      ...baseMetrics,
    };
  }

  if (
    capiRate != null &&
    m.ordersCount >= 3 &&
    capiRate < 0.34 &&
    m.spend >= t.minSpendToJudge
  ) {
    reasons.push({
      code: "capi_coverage_low",
      message: `Only ${Math.round(capiRate * 100)}% of attributed orders have CAPI sent—Meta optimization may be under-informed.`,
    });
  }

  if (
    m.spend >= t.killSpendWithZeroPaidOrders &&
    m.convertedOrdersCount === 0
  ) {
    reasons.push({
      code: "bleed_no_paid_orders",
      message: `Meta Insights spend ${m.spend.toFixed(2)}+ with no paid or confirmed orders in this window.`,
    });
    return {
      verdict: "KILL",
      reasons: finalizeReasons(reasons, opts),
      confidence: m.ordersCount >= 2 ? "high" : "medium",
      ...baseMetrics,
    };
  }

  if (lowDataGate(m, t)) {
    reasons.push({
      code: "insufficient_data",
      message:
        "Not enough app-attributed signal (spend, CTWA sessions, or converted orders) yet to recommend scale or kill.",
    });
    return {
      verdict: "LEARNING",
      reasons: finalizeReasons(reasons, opts),
      confidence: "low",
      ...baseMetrics,
    };
  }

  if (
    m.convertedOrdersCount >= t.minPaidOrdersToScale &&
    netProfitPaid < 0 &&
    m.spend >= t.minSpendToJudge
  ) {
    reasons.push({
      code: "negative_contribution_with_data",
      message:
        "Converted gross profit (paid, confirmed, shipped) minus payable ad spend (card surcharge applied), sales commission, and delivery cost is negative with enough orders to judge.",
    });
    return {
      verdict: "KILL",
      reasons: finalizeReasons(reasons, opts),
      confidence: "high",
      ...baseMetrics,
    };
  }

  if (
    cpaPaid != null &&
    m.convertedOrdersCount >= t.minPaidOrdersToScale &&
    cpaPaid > maxCpaEffective
  ) {
    reasons.push({
      code: "cpa_above_max",
      message: `CPA per converted order (${cpaPaid.toFixed(2)}) exceeds effective cap ${maxCpaEffective.toFixed(2)} (positive net÷converted ÷ ${t.cpaCapProfitDivisor.toFixed(2)}, else absolute ${t.absoluteMaxCpaPaidOrder}).`,
    });
    return {
      verdict: "KILL",
      reasons: finalizeReasons(reasons, opts),
      confidence: "medium",
      ...baseMetrics,
    };
  }

  if (
    pendingRevenueShare != null &&
    pendingRevenueShare > t.maxPendingRevenueShare &&
    m.convertedOrdersCount < t.minPaidOrdersToScale
  ) {
    reasons.push({
      code: "pending_revenue_too_high",
      message:
        "Most attributed revenue is outside converted statuses—do not scale until more orders convert.",
    });
    return {
      verdict: "KEEP",
      reasons: finalizeReasons(reasons, opts),
      confidence: "medium",
      ...baseMetrics,
    };
  }

  if (
    m.spend >= t.optimizeSpendFloor &&
    m.ctwaSessions >= t.minCtwaSessionsToJudge &&
    orderConvFromCtwa != null &&
    orderConvFromCtwa < t.minOrderConvFromCtwa &&
    m.convertedOrdersCount < t.minPaidOrdersToScale
  ) {
    reasons.push({
      code: "low_ctwa_conversion",
      message:
        "Plenty of CTWA sessions but few orders—optimize creative, offer, or WhatsApp handling.",
    });
    appendEngagementAndQualityNotes(m, t, signals, reasons, opts);
    return {
      verdict: "OPTIMIZE",
      reasons: finalizeReasons(reasons, opts),
      confidence: "medium",
      ...baseMetrics,
    };
  }

  if (
    m.ordersCount >= 3 &&
    paidConvFromCtwa != null &&
    paidConvFromCtwa < t.minPaidConvFromCtwa &&
    m.convertedOrdersCount < t.minPaidOrdersToScale
  ) {
    reasons.push({
      code: "low_paid_conversion",
      message:
        "Orders exist but converted rate from CTWA is weak—COD confirmation or fulfillment may be the bottleneck.",
    });
    appendEngagementAndQualityNotes(m, t, signals, reasons, opts);
    return {
      verdict: "OPTIMIZE",
      reasons: finalizeReasons(reasons, opts),
      confidence: "medium",
      ...baseMetrics,
    };
  }

  if (
    m.convertedOrdersCount >= t.minPaidOrdersToScale &&
    profitRoas != null &&
    profitRoas >= t.targetProfitRoas &&
    netProfitPaid > 0 &&
    (pendingRevenueShare == null ||
      pendingRevenueShare <= t.maxPendingRevenueShare)
  ) {
    reasons.push({
      code: "scale_candidate",
      message:
        "Gross-profit ROAS on payable ad spend (after card surcharge) meets target and net profit (after commission and delivery cost) is positive.",
    });
    reasons.push({
      code: "profit_roas_above_target",
      message: `Gross-profit ROAS on payable spend ${profitRoas.toFixed(2)}× vs target ${t.targetProfitRoas.toFixed(2)}.`,
    });
    appendEngagementAndQualityNotes(m, t, signals, reasons, {
      ...opts,
      omitReturnRateNotes: true,
    });

    const { hard, soft } = collectScaleBlockers(
      m,
      t,
      signals,
      profitRoas,
      netProfitPaid,
      opts,
    );
    reasons.push(...soft);
    if (hard.length > 0) {
      reasons.push(...hard);
      maybeScaleConfidenceNotes(m, t, reasons);
      return {
        verdict: "KEEP",
        reasons: finalizeReasons(reasons, opts),
        confidence: "medium",
        ...baseMetrics,
      };
    }

    return {
      verdict: "SCALE",
      reasons: finalizeReasons(reasons, opts),
      confidence: "high",
      ...baseMetrics,
    };
  }

  if (m.convertedOrdersCount > 0 && netProfitPaid >= 0) {
    reasons.push({
      code: "neutral_hold",
      message:
        "Profitable or break-even on net profit (after payable ads, commission, and delivery), but not enough signal to scale aggressively.",
    });
    appendEngagementAndQualityNotes(m, t, signals, reasons, opts);
    maybeScaleConfidenceNotes(m, t, reasons);
    return {
      verdict: "KEEP",
      reasons: finalizeReasons(reasons, opts),
      confidence: "medium",
      ...baseMetrics,
    };
  }

  reasons.push({
    code: "neutral_hold",
    message: "Mixed signals—extend the window or gather more converted orders.",
  });
  appendEngagementAndQualityNotes(m, t, signals, reasons, opts);
  maybeScaleConfidenceNotes(m, t, reasons);
  return {
    verdict: "KEEP",
    reasons: finalizeReasons(reasons, opts),
    confidence: "low",
    ...baseMetrics,
  };
}

function lowDataGate(m: CampaignVerdictInput, t: CampaignThresholds): boolean {
  if (m.convertedOrdersCount >= t.minPaidOrdersToScale) return false;
  if (m.spend >= t.killSpendWithZeroPaidOrders) return false;
  const lowSpend = m.spend < t.minSpendToJudge;
  const lowCtwa = m.ctwaSessions < t.minCtwaSessionsToJudge;
  return lowSpend && lowCtwa && m.convertedOrdersCount === 0;
}
