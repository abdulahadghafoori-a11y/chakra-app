import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyChakraWebhookSignature } from "@/lib/chakra-webhook-signature";

describe("verifyChakraWebhookSignature", () => {
  it("accepts matching hex digest", () => {
    const body = '{"hello":"world"}';
    const secret = "test-secret";
    const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyChakraWebhookSignature(body, hex, secret)).toBe(true);
  });

  it("rejects wrong secret", () => {
    const body = "{}";
    const hex = createHmac("sha256", "a").update(body, "utf8").digest("hex");
    expect(verifyChakraWebhookSignature(body, hex, "b")).toBe(false);
  });
});
