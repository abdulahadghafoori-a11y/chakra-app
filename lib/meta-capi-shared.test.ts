import { describe, expect, it } from "vitest";

import {
  buildBusinessMessagingUserData,
  normalizeMetaEnvId,
} from "./meta-capi-shared";

describe("meta-capi-shared", () => {
  it("normalizeMetaEnvId strips leading equals from dotenv typos", () => {
    expect(normalizeMetaEnvId("=12345")).toBe("12345");
  });

  it("buildBusinessMessagingUserData includes ctwa_clid and optional WABA", () => {
    const userData = buildBusinessMessagingUserData({
      phHash: "ph",
      externalIdHash: "ext",
      ctwaClid: "click-id",
      wabaId: "waba",
    });
    expect(userData.page_id).toBeUndefined();
    expect(userData.ctwa_clid).toBe("click-id");
    expect(userData.whatsapp_business_account_id).toBe("waba");
    expect(userData.ph).toEqual(["ph"]);
    expect(userData.external_id).toEqual(["ext"]);
  });
});
