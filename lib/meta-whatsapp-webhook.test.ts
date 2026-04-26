import { describe, expect, it } from "vitest";

import { extractMetaInboundMessageJobs } from "./meta-whatsapp-webhook";

const textWithCtwa = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "1949044442407684",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "93789979662",
              phone_number_id: "1026307527239343",
            },
            contacts: [
              {
                profile: { name: "Alireza" },
                wa_id: "93776328290",
              },
            ],
            messages: [
              {
                referral: {
                  source_url: "https://fb.me/ghyFBhiXr",
                  source_id: "120238216680880395",
                  source_type: "ad",
                  ctwa_clid:
                    "Afj2uD89154t_lEFcgVt_4fmURMlNQ3wwebsIvyiAUfz3jhhjc2-vsna78_KDaUWJ_eB0ZE8eQywRIMOE3HSnviXwaW_Cobqr8nNyloGFI9vUNY7xJkqggaFBSpuQhwRe086O9w1Lw",
                },
                from: "93776328290",
                timestamp: "1777147434",
                type: "text",
                text: { body: "Hello!" },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

const stickerNoCtwa = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "1949044442407684",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "1026307527239343" },
            contacts: [{ profile: { name: "X" }, wa_id: "93702738270" }],
            messages: [
              {
                referral: { welcome_message: { text: "Hi" } },
                from: "93702738270",
                timestamp: "1777143542",
                type: "sticker",
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

describe("extractMetaInboundMessageJobs", () => {
  it("extracts CTWA job with WABA, phone_number_id, name, clid", () => {
    const jobs = extractMetaInboundMessageJobs(textWithCtwa);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      wabaId: "1949044442407684",
      phoneNumberId: "1026307527239343",
      phoneDigits: "93776328290",
      name: "Alireza",
      sourceType: "ad",
      sourceId: "120238216680880395",
    });
    expect(jobs[0].ctwaClid).toContain("Afj2uD89154");
  });

  it("returns no jobs when referral has no ctwa_clid", () => {
    expect(extractMetaInboundMessageJobs(stickerNoCtwa)).toEqual([]);
  });

  it("returns empty for unknown object", () => {
    expect(extractMetaInboundMessageJobs({ object: "page" })).toEqual([]);
  });
});
