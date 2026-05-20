import { describe, expect, it } from "vitest";

import { checkRateLimit } from "@/lib/rate-limit";
import { parseCampaignVerdictFilter } from "@/lib/campaigns-list-page";
import { verifyWhatsAppWebhookPost } from "@/lib/webhook-signature";

describe("public flow smoke", () => {
  it("parses campaign verdict filters for URL state", () => {
    expect(parseCampaignVerdictFilter("kill")).toBe("KILL");
    expect(parseCampaignVerdictFilter("")).toBe("ALL");
  });

  it("rate limits anonymous actions per IP key", () => {
    const key = "create_order:203.0.113.1";
    for (let i = 0; i < 15; i++) {
      checkRateLimit({ key, limit: 15, windowMs: 60_000 });
    }
    const blocked = checkRateLimit({ key, limit: 15, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
  });

  it("rejects unsigned production webhooks without secrets", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.META_APP_SECRET;
    delete process.env.CHAKRA_WEBHOOK_SECRET;
    const result = verifyWhatsAppWebhookPost("{}", new Headers());
    process.env.NODE_ENV = prev;
    expect(result.ok).toBe(false);
  });
});
