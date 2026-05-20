import { describe, expect, it, afterEach } from "vitest";

import { verifyWhatsAppWebhookPost } from "./webhook-signature";

describe("verifyWhatsAppWebhookPost", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.META_APP_SECRET;
    delete process.env.CHAKRA_WEBHOOK_SECRET;
  });

  it("allows unsigned POST in development when no secrets configured", () => {
    process.env.NODE_ENV = "development";
    const result = verifyWhatsAppWebhookPost("{}", new Headers());
    expect(result).toEqual({ ok: true });
  });

  it("rejects unsigned POST in production when no secrets configured", () => {
    process.env.NODE_ENV = "production";
    const result = verifyWhatsAppWebhookPost("{}", new Headers());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("Webhook secrets not configured");
    }
  });
});
