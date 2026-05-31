import { z } from "zod";

import { AFGHANISTAN_OUTSIDE_KABUL_PROVINCE_SET } from "@/lib/afghanistan-provinces";
import { kabulDateTimeLocalToDate } from "@/lib/kabul-time";

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

const createOrderObjectSchema = z.object({
  phone: z.string().min(6),
  ctwaSessionId: ctwaSessionIdField,
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

export const createOrderSchema = createOrderObjectSchema.superRefine(
  refineInterProvinceAfghanistanDelivery,
);

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const newOrderFormSchema = createOrderObjectSchema
  .omit({ orderId: true })
  .superRefine(refineInterProvinceAfghanistanDelivery);

export type NewOrderFormInput = z.infer<typeof newOrderFormSchema>;

export const linkOrderManualCampaignSchema = z.object({
  orderId: z.string().min(1),
  /** Empty string clears manual attribution. */
  metaCampaignId: z.union([z.string().min(1), z.literal("")]),
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
