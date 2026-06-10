import { afterEach, describe, expect, it } from "vitest";

import {
  getWhatsAppWabaAccount,
  listWhatsAppWabaAccounts,
  resetWhatsAppWabaRegistryCache,
  resolveMetaDatasetIdForWaba,
} from "@/lib/whatsapp-waba-registry";

const SAMPLE = JSON.stringify([
  {
    id: "1111111111111111",
    label: "Line A",
    datasetId: "9001",
    phoneNumberId: "8001",
  },
  {
    id: "2222222222222222",
    label: "Line B",
    datasetId: "9002",
    phoneNumberId: "8002",
  },
]);

describe("whatsapp-waba-registry", () => {
  afterEach(() => {
    delete process.env.META_WABA_ACCOUNTS;
    resetWhatsAppWabaRegistryCache();
  });

  it("parses META_WABA_ACCOUNTS", () => {
    process.env.META_WABA_ACCOUNTS = SAMPLE;
    const rows = listWhatsAppWabaAccounts();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.label).toBe("Line A");
  });

  it("resolves dataset by waba id", () => {
    process.env.META_WABA_ACCOUNTS = SAMPLE;
    expect(resolveMetaDatasetIdForWaba("2222222222222222")).toBe("9002");
  });

  it("throws for unknown waba", () => {
    process.env.META_WABA_ACCOUNTS = SAMPLE;
    expect(() => getWhatsAppWabaAccount("999")).toThrow(/Unknown WhatsApp business account/);
  });
});
