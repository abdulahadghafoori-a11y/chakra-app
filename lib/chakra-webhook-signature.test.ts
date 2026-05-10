import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  computeExpectedChakraHmacHex,
  verifyChakraWebhookSignature,
} from "@/lib/chakra-webhook-signature";

describe("verifyChakraWebhookSignature", () => {
  it("accepts matching hex digest", () => {
    const body = '{"hello":"world"}';
    const secret = "test-secret";
    const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyChakraWebhookSignature(body, hex, secret)).toBe(true);
  });

  it("accepts sha256= prefixed hex", () => {
    const body = '{"a":1}';
    const secret = "k";
    const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyChakraWebhookSignature(body, `sha256=${hex}`, secret)).toBe(
      true,
    );
    expect(verifyChakraWebhookSignature(body, `SHA256=${hex}`, secret)).toBe(
      true,
    );
  });

  it("accepts base64-encoded 32-byte digest", () => {
    const body = "{}";
    const secret = "s";
    const digestBuf = createHmac("sha256", secret).update(body, "utf8").digest();
    const b64 = digestBuf.toString("base64");
    expect(verifyChakraWebhookSignature(body, b64, secret)).toBe(true);
  });

  it("uses first parseable comma-separated hex segment only when first parses", () => {
    const body = "x";
    const secret = "y";
    const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(
      verifyChakraWebhookSignature(body, `badprefix, ${hex}`, secret),
    ).toBe(true);
    expect(
      verifyChakraWebhookSignature(body, `zzzzzz, ${hex}`, secret),
    ).toBe(true);
  });

  it("rejects wrong secret", () => {
    const body = "{}";
    const hex = createHmac("sha256", "a").update(body, "utf8").digest("hex");
    expect(verifyChakraWebhookSignature(body, hex, "b")).toBe(false);
  });

  it("computes expected hex for debugging helpers", () => {
    expect(computeExpectedChakraHmacHex("{}", "secret")).toHaveLength(64);
  });
});
