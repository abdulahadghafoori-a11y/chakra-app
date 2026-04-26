import { describe, expect, it } from "vitest";

import { findCtwaClid, referralSourceFields } from "./ctwa-referral";

describe("findCtwaClid", () => {
  it("reads message.referral.ctwa_clid", () => {
    const clid = "Afj2uD89154t_lEFcgVt_4fmURMlNQ3wwebsIvyiAUfz3jhhjc2-vsna78_KDaUWJ_eB0ZE8eQywRIMOE3HSnviXwaW_Cobqr8nNyloGFI9vUNY7xJkqggaFBSpuQhwRe086O9w1Lw";
    expect(
      findCtwaClid({
        referral: { ctwa_clid: clid },
      }),
    ).toBe(clid);
  });

  it("finds nested text.referral.ctwa_clid", () => {
    const clid = "nested_click_id";
    expect(
      findCtwaClid({
        text: { body: "hi", referral: { ctwa_clid: clid } },
      }),
    ).toBe(clid);
  });
});

describe("referralSourceFields", () => {
  it("maps Meta snake_case referral", () => {
    expect(
      referralSourceFields({
        referral: {
          source_url: "https://fb.me/x",
          source_id: "120",
          source_type: "ad",
        },
      }),
    ).toEqual({
      sourceUrl: "https://fb.me/x",
      sourceId: "120",
      sourceType: "ad",
    });
  });
});
