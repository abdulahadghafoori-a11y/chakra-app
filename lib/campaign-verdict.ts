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
  | "meta_messaging_without_ctwa"
  | "meta_vs_app_messaging_mismatch"
  | "meta_vs_app_purchase_mismatch";

export type VerdictReason = {
  code: VerdictReasonCode;
  message: string;
};

export type CampaignVerdictInput = {
  spend: number;
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
  /** Delivery + RTO + COD fees on paid + confirmed orders (attributed window). */
  paidOperationalCosts: number;
  capiSentCount: number;
  /** Meta Ads Insights — messaging conversations started (bidding/delivery context). */
  metaMessagingConversationsStarted: number;
  /** Meta Ads Insights — purchase actions (not app cash truth). */
  metaPurchases: number;
};

export type EvaluateCampaignOptions = {
  unattributedOrdersInWindow?: number;
};

export type CampaignVerdictResult = {
  verdict: CampaignVerdict;
  reasons: VerdictReason[];
  confidence: "high" | "medium" | "low";
  grossProfitPaid: number;
  contributionProfit: number;
  profitRoas: number | null;
  contributionRoas: number | null;
  cpaPaid: number | null;
  orderConvFromCtwa: number | null;
  paidConvFromCtwa: number | null;
  pendingRevenueShare: number | null;
  capiRate: number | null;
  /** orders / Meta messaging starts — Meta-side funnel (app CTWA remains primary truth). */
  orderConvFromMetaMessaging: number | null;
  /** Meta purchase count / app converted orders (paid + confirmed) when converted > 0. */
  metaPurchasesPerPaidOrder: number | null;
};

function metaCrossChannelNotes(
  m: CampaignVerdictInput,
  t: CampaignThresholds,
): VerdictReason[] {
  const notes: VerdictReason[] = [];
  const metaMsg = m.metaMessagingConversationsStarted;
  const ctwa = m.ctwaSessions;

  const skipMessagingCompare =
    m.spend >= t.optimizeSpendFloor &&
    ctwa === 0 &&
    m.convertedOrdersCount === 0 &&
    metaMsg >= 5;

  if (!skipMessagingCompare && metaMsg >= 3 && ctwa >= 3) {
    if (metaMsg > ctwa * 2) {
      notes.push({
        code: "meta_vs_app_messaging_mismatch",
        message: `Meta reports ${metaMsg} messaging conversations started vs ${ctwa} app CTWA sessions—use both for optimization; app CTWA is the attributed funnel truth.`,
      });
    } else if (ctwa > metaMsg * 2) {
      notes.push({
        code: "meta_vs_app_messaging_mismatch",
        message: `App CTWA (${ctwa}) is above Meta messaging starts (${metaMsg})—attribution windows differ; trust the app for operations.`,
      });
    }
  }

  const mp = m.metaPurchases;
  const converted = m.convertedOrdersCount;
  if (
    mp >= 1 &&
    converted === 0 &&
    m.ordersCount === 0 &&
    m.spend >= t.minSpendToJudge
  ) {
    notes.push({
      code: "meta_vs_app_purchase_mismatch",
      message:
        "Meta insights show purchase actions but the app has no attributed orders in this window—reconcile events; P&L and scale/kill stay on app orders.",
    });
  } else if (mp >= 2 && converted >= 2) {
    if (mp > converted * 2) {
      notes.push({
        code: "meta_vs_app_purchase_mismatch",
        message: `Meta attributes ${mp} purchases vs ${converted} app converted orders (paid + confirmed)—optimize with both; truth is app orders.`,
      });
    } else if (converted > mp * 2) {
      notes.push({
        code: "meta_vs_app_purchase_mismatch",
        message: `App converted (${converted}) is well above Meta purchase count (${mp})—check CAPI / dedup; decisions remain on app orders.`,
      });
    }
  }

  return notes;
}

function finalizeReasons(
  reasons: VerdictReason[],
  m: CampaignVerdictInput,
  t: CampaignThresholds,
  opts?: EvaluateCampaignOptions,
): VerdictReason[] {
  return withGlobalReasons(
    [...reasons, ...metaCrossChannelNotes(m, t)],
    opts,
  );
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
      message: `${n} order(s) in this window have no CTWA session—campaign rows only cover attributed revenue.`,
    },
    ...reasons,
  ];
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
      message: `Only ${m.convertedOrdersCount} converted order(s) (paid + confirmed)—need at least ${t.minPaidOrdersToScale} for scale confidence.`,
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

export function evaluateCampaign(
  m: CampaignVerdictInput,
  t: CampaignThresholds,
  opts?: EvaluateCampaignOptions,
): CampaignVerdictResult {
  const reasons: VerdictReason[] = [];

  const grossProfitPaid =
    m.convertedRevenue - m.convertedLineCogs - m.paidOperationalCosts;
  const contributionProfit = grossProfitPaid - m.spend;
  const contributionRoas = m.spend > 0 ? contributionProfit / m.spend : null;
  const profitRoas =
    m.spend > 0 && grossProfitPaid > 0 ? grossProfitPaid / m.spend : null;
  const cpaPaid =
    m.convertedOrdersCount > 0 ? m.spend / m.convertedOrdersCount : null;
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
  };

  if (
    m.spend >= t.optimizeSpendFloor &&
    m.ctwaSessions === 0 &&
    m.convertedOrdersCount === 0
  ) {
    if (m.metaMessagingConversationsStarted >= 5) {
      reasons.push({
        code: "meta_messaging_without_ctwa",
        message: `Meta reports ${m.metaMessagingConversationsStarted} messaging conversations started but zero app CTWA sessions—Meta shows delivery; fix CTWA capture. Profit and funnel truth stay on the app.`,
      });
      return {
        verdict: "OPTIMIZE",
        reasons: finalizeReasons(reasons, m, t, opts),
        confidence: "medium",
        ...baseMetrics,
      };
    }
    reasons.push({
      code: "no_ctwa_sessions_with_spend",
      message:
        "There is ad spend in this window but zero CTWA sessions attributed to this campaign—verify CTWA links, sync, or date range.",
    });
    return {
      verdict: "ATTRIBUTION_ISSUE",
      reasons: finalizeReasons(reasons, m, t, opts),
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
      message: `Spend ${m.spend.toFixed(2)}+ with no paid or confirmed orders in this window.`,
    });
    return {
      verdict: "KILL",
      reasons: finalizeReasons(reasons, m, t, opts),
      confidence: m.ordersCount >= 2 ? "high" : "medium",
      ...baseMetrics,
    };
  }

  if (lowDataGate(m, t)) {
    reasons.push({
      code: "insufficient_data",
      message:
        "Not enough spend, app CTWA sessions, Meta messaging starts, or converted orders yet to recommend scale or kill.",
    });
    return {
      verdict: "LEARNING",
      reasons: finalizeReasons(reasons, m, t, opts),
      confidence: "low",
      ...baseMetrics,
    };
  }

  if (
    m.convertedOrdersCount >= t.minPaidOrdersToScale &&
    contributionProfit < 0 &&
    m.spend >= t.minSpendToJudge
  ) {
    reasons.push({
      code: "negative_contribution_with_data",
      message:
        "Converted gross profit (paid + confirmed) minus ad spend is negative with enough orders to judge.",
    });
    return {
      verdict: "KILL",
      reasons: finalizeReasons(reasons, m, t, opts),
      confidence: "high",
      ...baseMetrics,
    };
  }

  if (
    cpaPaid != null &&
    m.convertedOrdersCount >= t.minPaidOrdersToScale &&
    cpaPaid > t.maxCpaPaidOrder &&
    t.maxCpaPaidOrder < 900_000
  ) {
    reasons.push({
      code: "cpa_above_max",
      message: `CPA per converted order (${cpaPaid.toFixed(2)}) exceeds CAMPAIGN_MAX_CPA_PAID_ORDER.`,
    });
    return {
      verdict: "KILL",
      reasons: finalizeReasons(reasons, m, t, opts),
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
        "Most attributed revenue is outside paid + confirmed—do not scale until more orders convert.",
    });
    return {
      verdict: "KEEP",
      reasons: finalizeReasons(reasons, m, t, opts),
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
    return {
      verdict: "OPTIMIZE",
      reasons: finalizeReasons(reasons, m, t, opts),
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
        "Orders exist but paid + confirmed rate from CTWA is weak—COD confirmation or fulfillment may be the bottleneck.",
    });
    return {
      verdict: "OPTIMIZE",
      reasons: finalizeReasons(reasons, m, t, opts),
      confidence: "medium",
      ...baseMetrics,
    };
  }

  if (
    m.convertedOrdersCount >= t.minPaidOrdersToScale &&
    profitRoas != null &&
    profitRoas >= t.targetProfitRoas &&
    contributionProfit > 0 &&
    (pendingRevenueShare == null ||
      pendingRevenueShare <= t.maxPendingRevenueShare)
  ) {
    reasons.push({
      code: "scale_candidate",
      message:
        "Profit ROAS on converted revenue (paid + confirmed) meets target and contribution after spend is positive.",
    });
    reasons.push({
      code: "profit_roas_above_target",
      message: `Profit ROAS ${profitRoas.toFixed(2)} vs target ${t.targetProfitRoas.toFixed(2)}.`,
    });
    return {
      verdict: "SCALE",
      reasons: finalizeReasons(reasons, m, t, opts),
      confidence: "high",
      ...baseMetrics,
    };
  }

  if (m.convertedOrdersCount > 0 && contributionProfit >= 0) {
    reasons.push({
      code: "neutral_hold",
      message:
        "Profitable or break-even on contribution, but not enough signal to scale aggressively.",
    });
    maybeScaleConfidenceNotes(m, t, reasons);
    return {
      verdict: "KEEP",
      reasons: finalizeReasons(reasons, m, t, opts),
      confidence: "medium",
      ...baseMetrics,
    };
  }

  reasons.push({
    code: "neutral_hold",
    message: "Mixed signals—extend the window or gather more converted orders.",
  });
  maybeScaleConfidenceNotes(m, t, reasons);
  return {
    verdict: "KEEP",
    reasons: finalizeReasons(reasons, m, t, opts),
    confidence: "low",
    ...baseMetrics,
  };
}

function lowDataGate(m: CampaignVerdictInput, t: CampaignThresholds): boolean {
  if (m.convertedOrdersCount >= t.minPaidOrdersToScale) return false;
  if (m.spend >= t.killSpendWithZeroPaidOrders) return false;
  const lowSpend = m.spend < t.minSpendToJudge;
  const lowCtwa = m.ctwaSessions < t.minCtwaSessionsToJudge;
  const lowMetaMsg =
    m.metaMessagingConversationsStarted < t.minCtwaSessionsToJudge;
  return lowSpend && lowCtwa && lowMetaMsg && m.convertedOrdersCount === 0;
}
