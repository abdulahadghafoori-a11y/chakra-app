import { z } from "zod";

import { AFGHANISTAN_OUTSIDE_KABUL_PROVINCE_SET } from "@/lib/afghanistan-provinces";
import { contactPhoneKeyFromRaw } from "@/lib/contact-phone";
import { kabulDateTimeLocalToDate } from "@/lib/kabul-time";
import { ORDER_SALES_CHANNELS } from "@/lib/sales-channel";

export const orderStatuses = [
  "pending",
  "confirmed",
  "shipped",
  "paid",
  "cancelled",
  "returned",
] as const;

export const APP_CURRENCY = "USD" as const;

/**
 * Purchase CAPI when order is far enough along for COD (confirmed, out for delivery, or paid).
 * Shipped is included because payment is on delivery — same practical step as confirmed.
 */
export function orderStatusEligibleForPurchaseCapi(status: string): boolean {
  return (
    status === "confirmed" || status === "paid" || status === "shipped"
  );
}

/** Line unit prices may be edited until the order is paid or closed out. */
export function orderAllowsLinePriceEdit(status: string): boolean {
  return (
    status !== "paid" && status !== "cancelled" && status !== "returned"
  );
}

const updateOrderLinePricesLineSchema = z.object({
  lineIndex: z.number().int().min(0),
  unitSalePrice: z
    .number()
    .positive()
    .refine(
      Number.isInteger,
      "Each unit price in AFN must be a whole number (no decimals).",
    ),
  quantity: z.number().int().min(1).max(99_999),
});

export const updateOrderLinePricesSchema = z.object({
  orderId: z.string().min(1),
  lines: z.array(updateOrderLinePricesLineSchema).min(1).max(50),
});

export type UpdateOrderLinePricesInput = z.infer<
  typeof updateOrderLinePricesSchema
>;

const ctwaSessionIdField = z.union([
  z.string().uuid(),
  z.literal(""),
]);

const orderLineSchema = z.object({
  productId: z.string().uuid(),
  /** Unit list price as whole Afghanis (no fractions). Stored and converted to USD on the server. */
  unitSalePrice: z
    .number()
    .positive()
    .refine(
      Number.isInteger,
      "Each unit price in AFN must be a whole number (no decimals).",
    ),
  quantity: z.number().int().min(1).max(99_999),
});

/**
 * CAPI `event_time` / order time: wall clock in Kabul (from `datetime-local`, interpreted as Asia/Kabul).
 */
export const capiEventTimeKabulField = z
  .string()
  .min(1, "Set the event time (Kabul)")
  .refine(
    (s) => {
      try {
        kabulDateTimeLocalToDate(s);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid date and time" },
  );

/** Non-negative courier fee as whole Afghanis (outside Kabul); stored as USD on `orders.delivery_cost`. Not in Meta CAPI payload. */
const orderDeliveryCostField = z
  .number()
  .min(0, "Cannot be negative")
  .refine(
    Number.isInteger,
    "Courier fee in AFN must be a whole number (no decimals).",
  );

const manualMetaCampaignIdField = z.union([z.string().min(1), z.literal("")]);

/** Meta WABA id from staff picker (`META_WABA_ACCOUNTS`) when CTWA cannot supply one. */
const capiWabaIdField = z.union([
  z
    .string()
    .trim()
    .regex(/^\d+$/, "Invalid WhatsApp business account id"),
  z.literal(""),
]);

/**
 * Campaign lead instant (Kabul wall clock) for manual attribution when there is no CTWA session.
 * Same format as {@link capiEventTimeKabulField} (`datetime-local`, Asia/Kabul).
 */
export const manualCampaignAttributedAtKabulField = z.union([
  z
    .string()
    .min(1, "Set the campaign attribution date and time (Kabul)")
    .refine(
      (s) => {
        try {
          kabulDateTimeLocalToDate(s);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid date and time" },
    ),
  z.literal(""),
]);

const createOrderObjectSchema = z.object({
  /** Required for online orders; optional for in-store. */
  phone: z.string(),
  /** `offline` = in-store; no Meta CAPI and excluded from campaign rollups. */
  salesChannel: z.enum(ORDER_SALES_CHANNELS),
  /** Optional display name when registering an in-store customer by phone. */
  offlineContactName: z.string().max(120).optional(),
  ctwaSessionId: ctwaSessionIdField,
  /** Required server-side when no CTWA click id; validated in createOrder. */
  capiWabaId: capiWabaIdField,
  lines: z.array(orderLineSchema).min(1).max(50),
  orderId: z.string().optional(),
  status: z.enum(orderStatuses),
  capiEventTimeKabul: capiEventTimeKabulField,
  deliveryCost: orderDeliveryCostField,
  /**
   * Optional: attribute to a synced Meta campaign for in-app P&amp;L when there is no CTWA session.
   * Does not gate Meta Purchase CAPI (sent with phone / WABA even without `ctwa_clid`).
   */
  manualMetaCampaignId: manualMetaCampaignIdField,
  /** Lead instant for campaign P&amp;L when attributing via manual campaign (no CTWA session). */
  manualCampaignAttributedAtKabul: manualCampaignAttributedAtKabulField,
  /** Inter-provincial shipment within Afghanistan — requires province. */
  interProvinceAfghanistanDelivery: z.boolean(),
  deliveryProvinceAfghanistan: z.string().max(80),
  deliveryTrackingNumber: z.string().max(160),
});

type InterProvinceAfghanistanDeliveryShape = Pick<
  z.infer<typeof createOrderObjectSchema>,
  | "interProvinceAfghanistanDelivery"
  | "deliveryCost"
  | "deliveryProvinceAfghanistan"
>;

function refineInterProvinceAfghanistanDelivery(
  data: InterProvinceAfghanistanDeliveryShape,
  ctx: z.RefinementCtx,
) {
  if (!data.interProvinceAfghanistanDelivery) {
    if (data.deliveryCost > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Courier fee applies only outside Kabul. Toggle “outside Kabul” or zero this amount.",
        path: ["deliveryCost"],
      });
    }
    return;
  }
  const p = data.deliveryProvinceAfghanistan.trim();
  if (!p || !AFGHANISTAN_OUTSIDE_KABUL_PROVINCE_SET.has(p)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choose a province (outside Kabul) for inter-provincial delivery.",
      path: ["deliveryProvinceAfghanistan"],
    });
  }
}

function refineManualCampaignAttributionDate(
  data: Pick<
    z.infer<typeof createOrderObjectSchema>,
    | "salesChannel"
    | "ctwaSessionId"
    | "manualMetaCampaignId"
    | "manualCampaignAttributedAtKabul"
  >,
  ctx: z.RefinementCtx,
) {
  if (data.salesChannel === "offline") return;

  const hasCtwa = (data.ctwaSessionId?.trim() ?? "").length > 0;
  const manualId = data.manualMetaCampaignId?.trim() ?? "";
  if (!hasCtwa && manualId && !data.manualCampaignAttributedAtKabul?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Set the campaign attribution date and time (Kabul) when attributing to a manual campaign.",
      path: ["manualCampaignAttributedAtKabul"],
    });
  }
}

function refineOnlinePhoneRequired(
  data: Pick<z.infer<typeof createOrderObjectSchema>, "salesChannel" | "phone">,
  ctx: z.RefinementCtx,
) {
  if (data.salesChannel === "offline") {
    const trimmed = data.phone.trim();
    if (trimmed && !contactPhoneKeyFromRaw(trimmed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid phone number (with country code), or leave blank.",
        path: ["phone"],
      });
    }
    return;
  }
  if (!contactPhoneKeyFromRaw(data.phone)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a valid phone number (with country code).",
      path: ["phone"],
    });
  }
}

function refineOfflineOrderChannel(
  data: Pick<
    z.infer<typeof createOrderObjectSchema>,
    | "salesChannel"
    | "ctwaSessionId"
    | "capiWabaId"
    | "manualMetaCampaignId"
    | "manualCampaignAttributedAtKabul"
  >,
  ctx: z.RefinementCtx,
) {
  if (data.salesChannel !== "offline") return;

  if ((data.capiWabaId?.trim() ?? "").length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "In-store orders do not use WhatsApp business line selection.",
      path: ["capiWabaId"],
    });
  }
  if ((data.ctwaSessionId?.trim() ?? "").length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "In-store orders cannot use a CTWA session.",
      path: ["ctwaSessionId"],
    });
  }
  if ((data.manualMetaCampaignId?.trim() ?? "").length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "In-store orders are not counted in Campaigns.",
      path: ["manualMetaCampaignId"],
    });
  }
  if ((data.manualCampaignAttributedAtKabul?.trim() ?? "").length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "In-store orders are not counted in Campaigns.",
      path: ["manualCampaignAttributedAtKabul"],
    });
  }
}

export const createOrderSchema = createOrderObjectSchema
  .superRefine(refineInterProvinceAfghanistanDelivery)
  .superRefine(refineOnlinePhoneRequired)
  .superRefine(refineOfflineOrderChannel)
  .superRefine(refineManualCampaignAttributionDate);

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const newOrderFormSchema = createOrderObjectSchema
  .omit({ orderId: true })
  .superRefine(refineInterProvinceAfghanistanDelivery)
  .superRefine(refineOnlinePhoneRequired)
  .superRefine(refineOfflineOrderChannel)
  .superRefine(refineManualCampaignAttributionDate);

export type NewOrderFormInput = z.infer<typeof newOrderFormSchema>;

export const linkOrderManualCampaignSchema = z.object({
  orderId: z.string().min(1),
  /** Empty string clears manual attribution. */
  metaCampaignId: z.union([z.string().min(1), z.literal("")]),
  /** Lead instant (Kabul) when setting manual campaign; ignored when clearing. */
  manualCampaignAttributedAtKabul: manualCampaignAttributedAtKabulField.optional(),
});

export type LinkOrderManualCampaignInput = z.infer<
  typeof linkOrderManualCampaignSchema
>;

export const updateOrderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(orderStatuses),
  /** Used as Meta event_time when sending deferred Purchase CAPI on Confirm/Paid. */
  capiEventTimeKabul: capiEventTimeKabulField.optional(),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const deleteOrderSchema = z.object({
  orderId: z.string().min(1),
});

export type DeleteOrderInput = z.infer<typeof deleteOrderSchema>;

const updateOrderMetadataObjectSchema = z.object({
  orderId: z.string().min(1),
  deliveryCost: orderDeliveryCostField,
  interProvinceAfghanistanDelivery: z.boolean(),
  deliveryProvinceAfghanistan: z.string().max(80),
  deliveryTrackingNumber: z.string().max(160),
});

export const updateOrderMetadataSchema = updateOrderMetadataObjectSchema.superRefine(
  refineInterProvinceAfghanistanDelivery,
);

export type UpdateOrderMetadataInput = z.infer<typeof updateOrderMetadataSchema>;

export const resendOrderPurchaseCapiBaseSchema = z.object({
  orderId: z.string().min(1),
  capiEventTimeKabul: capiEventTimeKabulField,
});

export const resendOrderPurchaseCapiSchema =
  resendOrderPurchaseCapiBaseSchema.extend({
    /** Returned by prepare step so preview matches Graph POST */
    eventIdOverride: z.string().min(1).max(128).optional(),
  });

export type ResendOrderPurchaseCapiInput = z.infer<
  typeof resendOrderPurchaseCapiSchema
>;
