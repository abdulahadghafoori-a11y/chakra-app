import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_COUNTABLE_ORDER_STATUSES,
  CAMPAIGN_EXCLUDED_ORDER_STATUSES,
  isCampaignCountableOrderStatus,
} from "./campaign-order-counts";

describe("campaign order counts", () => {
  it("excludes cancelled and returned from countable statuses", () => {
    expect(CAMPAIGN_EXCLUDED_ORDER_STATUSES).toEqual(["cancelled", "returned"]);
    expect(CAMPAIGN_COUNTABLE_ORDER_STATUSES).not.toContain("cancelled");
    expect(CAMPAIGN_COUNTABLE_ORDER_STATUSES).not.toContain("returned");
    expect(CAMPAIGN_COUNTABLE_ORDER_STATUSES).toContain("pending");
    expect(CAMPAIGN_COUNTABLE_ORDER_STATUSES).toContain("confirmed");
  });

  it("isCampaignCountableOrderStatus", () => {
    expect(isCampaignCountableOrderStatus("paid")).toBe(true);
    expect(isCampaignCountableOrderStatus("cancelled")).toBe(false);
    expect(isCampaignCountableOrderStatus("returned")).toBe(false);
  });
});
