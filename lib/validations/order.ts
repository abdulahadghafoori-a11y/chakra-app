import { z } from "zod";

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

const ctwaSessionIdField = z.union([
  z.string().uuid(),
  z.literal(""),
]);

const orderLineSchema = z.object({
  productId: z.string().uuid(),
  unitSalePrice: z.number().positive(),
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

/** Non-negative delivery cost; stored on `orders.delivery_cost`, not in CAPI payload. */
const orderDeliveryCostField = z.number().min(0, "Cannot be negative");

export const createOrderSchema = z.object({
  phone: z.string().min(6),
  ctwaSessionId: ctwaSessionIdField,
  lines: z.array(orderLineSchema).min(1).max(50),
  orderId: z.string().optional(),
  status: z.enum(orderStatuses),
  capiEventTimeKabul: capiEventTimeKabulField,
  deliveryCost: orderDeliveryCostField,
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** Client form: internal order id is always generated server-side. */
export const newOrderFormSchema = createOrderSchema.omit({ orderId: true });
export type NewOrderFormInput = z.infer<typeof newOrderFormSchema>;

export const updateOrderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(orderStatuses),
  /** Used as Meta event_time when sending deferred Purchase CAPI on Confirm/Paid. */
  capiEventTimeKabul: capiEventTimeKabulField.optional(),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
