import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyMetaWebhookSignature } from "./meta-whatsapp-signature";

describe("verifyMetaWebhookSignature", () => {
  const secret = "test_app_secret";
  const body = '{"object":"whatsapp_business_account"}';

  it("accepts valid sha256=", () => {
    const digest = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(
      verifyMetaWebhookSignature(body, `sha256=${digest}`, secret),
    ).toBe(true);
  });

  it("rejects wrong secret", () => {
    const digest = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(
      verifyMetaWebhookSignature(body, `sha256=${digest}`, "other"),
    ).toBe(false);
  });

  it("rejects missing header", () => {
    expect(verifyMetaWebhookSignature(body, null, secret)).toBe(false);
  });
});
