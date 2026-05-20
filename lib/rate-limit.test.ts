import { describe, expect, it } from "vitest";

import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const key = `test-${Date.now()}`;
    expect(checkRateLimit({ key, limit: 3, windowMs: 60_000 }).ok).toBe(true);
    expect(checkRateLimit({ key, limit: 3, windowMs: 60_000 }).ok).toBe(true);
    expect(checkRateLimit({ key, limit: 3, windowMs: 60_000 }).ok).toBe(true);
  });

  it("blocks when limit exceeded", () => {
    const key = `block-${Date.now()}`;
    for (let i = 0; i < 2; i++) {
      checkRateLimit({ key, limit: 2, windowMs: 60_000 });
    }
    const blocked = checkRateLimit({ key, limit: 2, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });
});
