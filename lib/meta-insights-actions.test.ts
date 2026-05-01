import { describe, expect, it } from "vitest";

import {
  metaPurchasesFromActions,
  messagingConversationsStartedFromActions,
  parseActionsFromInsight,
} from "@/lib/meta-insights-actions";

describe("parseActionsFromInsight", () => {
  it("sums duplicate action_type rows for purchases", () => {
    const raw = [
      {
        action_type: "offsite_conversion.fb_pixel_purchase",
        value: 2,
      },
      {
        action_type: "offsite_conversion.fb_pixel_purchase",
        value: "3",
      },
    ];
    const actions = parseActionsFromInsight(raw);
    expect(metaPurchasesFromActions(actions)).toBe(5);
  });

  it("reads 7d_click when value is missing", () => {
    const raw = [
      {
        action_type: "purchase",
        "7d_click": 4,
      },
    ];
    const actions = parseActionsFromInsight(raw);
    expect(metaPurchasesFromActions(actions)).toBe(4);
  });

  it("prefers messaging_conversation_started_7d summed rows", () => {
    const raw = [
      {
        action_type: "onsite_conversion.messaging_conversation_started_7d",
        value: 10,
      },
      {
        action_type: "onsite_conversion.messaging_conversation_started_7d",
        value: 5,
      },
    ];
    const actions = parseActionsFromInsight(raw);
    expect(messagingConversationsStartedFromActions(actions)).toBe(15);
  });
});
