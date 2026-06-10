import { describe, expect, it } from "vitest";

import { orderFormNeedsWabaPicker } from "@/lib/order-capi-waba";

describe("orderFormNeedsWabaPicker", () => {
  it("requires picker when no sessions", () => {
    expect(
      orderFormNeedsWabaPicker({
        isInStore: false,
        sessions: [],
        selectedSessionId: "",
      }),
    ).toBe(true);
  });

  it("requires picker when session lacks ctwa_clid", () => {
    expect(
      orderFormNeedsWabaPicker({
        isInStore: false,
        sessions: [{ id: "s1", ctwaClid: "" }],
        selectedSessionId: "s1",
      }),
    ).toBe(true);
  });

  it("skips picker when session has ctwa_clid and waba_id", () => {
    expect(
      orderFormNeedsWabaPicker({
        isInStore: false,
        sessions: [{ id: "s1", ctwaClid: "clid-abc", wabaId: "111" }],
        selectedSessionId: "s1",
      }),
    ).toBe(false);
  });

  it("requires picker when session has clid but no waba_id", () => {
    expect(
      orderFormNeedsWabaPicker({
        isInStore: false,
        sessions: [{ id: "s1", ctwaClid: "clid-abc", wabaId: null }],
        selectedSessionId: "s1",
      }),
    ).toBe(true);
  });

  it("skips for in-store", () => {
    expect(
      orderFormNeedsWabaPicker({
        isInStore: true,
        sessions: [],
        selectedSessionId: "",
      }),
    ).toBe(false);
  });
});
