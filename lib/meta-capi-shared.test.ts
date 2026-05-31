import { afterEach, describe, expect, it } from "vitest";

import {
  buildBusinessMessagingUserData,
  normalizeMetaEnvId,
  requireMetaFacebookPageIdForBusinessMessaging,
  resolveMetaFacebookPageId,
} from "./meta-capi-shared";

describe("meta-capi-shared", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it("normalizeMetaEnvId strips leading equals from dotenv typos", () => {
    expect(normalizeMetaEnvId("=12345")).toBe("12345");
  });

  it("resolveMetaFacebookPageId prefers META_FACEBOOK_PAGE_ID", () => {
    process.env.META_FACEBOOK_PAGE_ID = "111";
    process.env.META_PAGE_ID = "222";
    expect(resolveMetaFacebookPageId()).toBe("111");
  });

  it("buildBusinessMessagingUserData includes page_id and ctwa_clid", () => {
    process.env.META_FACEBOOK_PAGE_ID = "987654321";
    const userData = buildBusinessMessagingUserData({
      phHash: "ph",
      externalIdHash: "ext",
      ctwaClid: "click-id",
      wabaId: "waba",
    });
    expect(userData.page_id).toBe("987654321");
    expect(userData.ctwa_clid).toBe("click-id");
    expect(userData.whatsapp_business_account_id).toBe("waba");
  });

  it("throws when page id env is missing", () => {
    delete process.env.META_FACEBOOK_PAGE_ID;
    delete process.env.META_PAGE_ID;
    expect(() => requireMetaFacebookPageIdForBusinessMessaging()).toThrow(
      /META_FACEBOOK_PAGE_ID/,
    );
  });
});
