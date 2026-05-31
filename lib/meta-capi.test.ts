import { describe, expect, it } from "vitest";

import { buildMetaPurchasePayload } from "./meta-capi";

const baseParams = {
  orderId: "ORD-TEST",
  orderCreatedAt: new Date("2026-01-15T12:00:00Z"),
  contactId: "contact-uuid",
  countryCode: "AF" as const,
  value: 42,
  currency: "USD",
  totalQuantity: 1,
  lines: [
    {
      sku: "SKU1",
      productName: "Widget",
      quantity: 1,
      lineValue: 42,
    },
  ],
  phoneDigits: "93782045600",
  whatsappBusinessAccountId: "waba123",
};

describe("buildMetaPurchasePayload", () => {
  it("uses business_messaging when ctwa_clid is set", () => {
    process.env.META_FACEBOOK_PAGE_ID = "111";
    process.env.META_TEST_EVENT_CODE = "TEST12345";

    const { payload, capiPath } = buildMetaPurchasePayload({
      ...baseParams,
      ctwaClid: "clid-abc",
    });

    expect(capiPath).toBe("ctwa_whatsapp");
    const event = (payload.data as Record<string, unknown>[])[0];
    expect(event.action_source).toBe("business_messaging");
    expect(event.messaging_channel).toBe("whatsapp");
    const userData = event.user_data as Record<string, unknown>;
    expect(userData.ctwa_clid).toBe("clid-abc");
    expect(userData.page_id).toBe("111");
  });

  it("uses action_source other when ctwa_clid is missing", () => {
    process.env.META_TEST_EVENT_CODE = "TEST12345";

    const { payload, capiPath } = buildMetaPurchasePayload({
      ...baseParams,
      ctwaClid: null,
    });

    expect(capiPath).toBe("other");
    const event = (payload.data as Record<string, unknown>[])[0];
    expect(event.action_source).toBe("other");
    expect(event.messaging_channel).toBeUndefined();
    const userData = event.user_data as Record<string, unknown>;
    expect(userData.ctwa_clid).toBeUndefined();
    expect(userData.page_id).toBeUndefined();
    expect(userData.ph).toBeDefined();
  });
});
