import { describe, expect, it } from "vitest";

import {
  filterCampaignPerformance,
  paginateCampaignPerformance,
  parseCampaignVerdictFilter,
} from "./campaigns-list-page";
import type { CampaignPerformanceRow } from "./campaigns-rollups";

function row(verdict: CampaignPerformanceRow["verdict"]): CampaignPerformanceRow {
  return {
    metaCampaignId: `id-${verdict}`,
    campaignName: verdict,
    verdict,
    spend: 1,
    paidAdSpend: 1,
    cardSurchargeAmount: 0,
    salesCommissionPaid: 0,
    paidOperationalCosts: 0,
    ctwaSessions: 0,
    metaMessagingConversationsStarted: 0,
    ordersCount: 0,
    paidOrdersCount: 0,
    confirmedOrdersCount: 0,
    shippedOrdersCount: 0,
    convertedOrdersCount: 0,
    metaPurchases: 0,
    convertedRevenue: 0,
    grossProfitPaid: 0,
    netProfitPaid: 0,
    preFeeContribution: 0,
    campaignEffectiveStatus: "ACTIVE",
    roasPaid: null,
    cpaPaid: null,
    ctr: null,
    metaFreq: null,
    metaQuality: null,
    metaQualityStreakDays: null,
    metaFirstImpressionShare: null,
  } as CampaignPerformanceRow;
}

describe("campaigns-list-page", () => {
  it("parses verdict filter", () => {
    expect(parseCampaignVerdictFilter(undefined)).toBe("ALL");
    expect(parseCampaignVerdictFilter("scale")).toBe("SCALE");
    expect(parseCampaignVerdictFilter("nope")).toBe("ALL");
  });

  it("filters and paginates", () => {
    const all = [row("SCALE"), row("KILL"), row("SCALE")];
    const filtered = filterCampaignPerformance(all, "SCALE");
    expect(filtered).toHaveLength(2);
    const page = paginateCampaignPerformance(filtered, 1, 1);
    expect(page.pageRows).toHaveLength(1);
    expect(page.total).toBe(2);
    expect(page.pageCount).toBe(2);
  });
});
