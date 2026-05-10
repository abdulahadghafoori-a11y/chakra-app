import { describe, expect, it } from "vitest";

import { contactPhoneKeyFromRaw } from "@/lib/contact-phone";
import {
  coerceToMetaWhatsAppWebhookBody,
  extractMetaInboundContactJobs,
  extractMetaInboundMessageJobs,
} from "./meta-whatsapp-webhook";

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

const textWithCtwaCamelCase = {
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
                profile: { name: "Camel" },
                wa_id: "93776328290",
              },
            ],
            messages: [
              {
                referral: {
                  sourceUrl: "https://fb.me/ghyFBhiXr",
                  sourceId: "120238216680880395",
                  sourceType: "ad",
                  ctwaClid:
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

describe("extractMetaInboundMessageJobs", () => {
  it("extracts CTWA when relay uses camelCase ctwaClid + referral fields", () => {
    const jobs = extractMetaInboundMessageJobs(textWithCtwaCamelCase);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.ctwaClid).toContain("Afj2uD89154");
    expect(jobs[0]).toMatchObject({
      sourceType: "ad",
      sourceId: "120238216680880395",
      name: "Camel",
    });
  });

  it("coerce unwraps one-level payload / stringified Meta body", () => {
    const wrappedObj = { relay: false, payload: textWithCtwa };
    const coerced = coerceToMetaWhatsAppWebhookBody(wrappedObj);
    expect(extractMetaInboundMessageJobs(coerced)).toHaveLength(1);

    const stringWrapped = {
      payload: JSON.stringify(textWithCtwa),
    };
    expect(
      extractMetaInboundMessageJobs(
        coerceToMetaWhatsAppWebhookBody(stringWrapped),
      ),
    ).toHaveLength(1);
  });

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

  it("extractMetaInboundContactJobs includes inbound without ctwa_clid", () => {
    const cj = extractMetaInboundContactJobs(stickerNoCtwa);
    expect(cj).toHaveLength(1);
    expect(cj[0]).toMatchObject({
      wabaId: "1949044442407684",
      phoneDigits: "93702738270",
      name: "X",
      phoneNumberId: "1026307527239343",
    });
  });

  it("extractMetaInboundContactJobs matches CTWA message contact fields", () => {
    const cj = extractMetaInboundContactJobs(textWithCtwa);
    expect(cj).toHaveLength(1);
    expect(cj[0]?.phoneDigits).toBe("93776328290");
    expect(cj[0]?.name).toBe("Alireza");
  });

  it("returns empty for unknown object", () => {
    expect(extractMetaInboundContactJobs({ object: "page" })).toEqual([]);
    expect(extractMetaInboundMessageJobs({ object: "page" })).toEqual([]);
  });
});

/** User-reported sample: top-level `referral` + nested `text.referral`, `user_id` on contact. */
const userReportedWaPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "1699456911242528",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "93789979662",
              phone_number_id: "1057963360741789",
            },
            contacts: [
              {
                profile: { name: "juma sharifi" },
                wa_id: "93795456603",
                user_id: "AF.1086108617924188",
              },
            ],
            messages: [
              {
                referral: {
                  source_url: "https://fb.me/4nzLBoN1t",
                  source_id: "120239550751710395",
                  source_type: "ad",
                  body: "...",
                  headline: "...",
                  media_type: "image",
                  image_url: "https://example.com/i.png",
                  ctwa_clid:
                    "AfiljOT2XZYCqvgwx3dk5kQ72PMIM6zwD3Ua6m4QDKaLXOeEIE8Ogi0ziHt2SFhxKD4mrzlh261oe7S_sdutRpINyRi502PgTK-CVU5q5yLEyjLOMpUxYNY2aH3KSgmwD0wOrlnTrQ",
                  welcome_message: { text: "hi" },
                },
                from: "93795456603",
                from_user_id: "AF.1086108617924188",
                id: "wamid.x",
                timestamp: "1778418712",
                text: {
                  body: "السلام",
                  referral: {
                    source_url: "https://fb.me/4nzLBoN1t",
                    source_id: "120239550751710395",
                    source_type: "ad",
                    body: "...",
                    headline: "...",
                    media_type: "image",
                    image_url: "https://example.com/i.png",
                    ctwa_clid:
                      "AfiljOT2XZYCqvgwx3dk5kQ72PMIM6zwD3Ua6m4QDKaLXOeEIE8Ogi0ziHt2SFhxKD4mrzlh261oe7S_sdutRpINyRi502PgTK-CVU5q5yLEyjLOMpUxYNY2aH3KSgmwD0wOrlnTrQ",
                    welcome_message: { text: "hi" },
                  },
                },
                type: "text",
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

describe("user-reported CTWA payload (Jan 2026)", () => {
  it("extracts job + contact phone key for DB path", () => {
    const jobs = extractMetaInboundMessageJobs(userReportedWaPayload);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      wabaId: "1699456911242528",
      phoneNumberId: "1057963360741789",
      phoneDigits: "93795456603",
      name: "juma sharifi",
      sourceId: "120239550751710395",
      sourceType: "ad",
    });
    expect(jobs[0]?.ctwaClid).toContain("AfiljOT2XZY");
    expect(contactPhoneKeyFromRaw(jobs[0]!.phoneDigits)).toBe("93795456603");
  });
});
