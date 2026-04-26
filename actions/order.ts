"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

import {
  contacts,
  ctwaSessions,
  orderItems,
  orders,
  products,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import {
  buildMetaPurchasePayload,
  sendMetaPurchaseEvent,
  serializeMetaPayload,
} from "@/lib/meta-capi";
import {
  isWithinMetaEventTimeWindow,
  kabulDateTimeLocalToDate,
} from "@/lib/kabul-time";
import { contactPhoneKeyFromRaw } from "@/lib/contact-phone";
import { e164ToDigits } from "@/lib/phone";
import {
  APP_CURRENCY,
  createOrderSchema,
  type CreateOrderInput,
} from "@/lib/validations/order";

export type CreateOrderSuccess = {
  ok: true;
  orderId: string;
  capiSent: boolean;
  capiEventId: string;
  capiPayloadJson: string;
  capiError: string | null;
};

export type CreateOrderResult = CreateOrderSuccess | { ok: false; error: string };

const PREVIEW_ORDER_ID = "PREVIEW";

/** Shown in review UI and returned on create when there is no CTWA session / ctwa_clid (CAPI not sent). */
const CAPI_SKIPPED_NO_CTWA_PAYLOAD_JSON = JSON.stringify(
  {
    note: "Meta CAPI will not be sent: this contact has no CTWA session (no ctwa_clid from a Click-to-WhatsApp referral). The order can still be created.",
    capiSkipped: true,
  },
  null,
  2,
);

export async function previewOrderCapiPayload(
  input: CreateOrderInput,
): Promise<{ ok: true; payloadJson: string } | { ok: false; error: string }> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const data = parsed.data;
  const phoneKey = contactPhoneKeyFromRaw(data.phone);
  if (!phoneKey) {
    return { ok: false, error: "Enter a valid phone number (with country code)." };
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phoneNumber, phoneKey))
    .limit(1);

  if (!contact) {
    return {
      ok: false,
      error:
        "No contact found for this number. The customer must reach you on WhatsApp first.",
    };
  }

  const productIds = [...new Set(data.lines.map((l) => l.productId))];
  const productRows = await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds));
  const productById = new Map(productRows.map((p) => [p.id, p]));

  type ResolvedLine = {
    product: (typeof productRows)[0];
    quantity: number;
    unit: number;
    lineValue: number;
  };

  const resolved: ResolvedLine[] = [];
  for (const line of data.lines) {
    const p = productById.get(line.productId);
    if (!p) {
      return { ok: false, error: "One or more products were not found." };
    }
    const unit = line.unitSalePrice;
    const qty = line.quantity;
    const lineValue = unit * qty;
    resolved.push({ product: p, quantity: qty, unit, lineValue });
  }

  const orderTotal = resolved.reduce((s, r) => s + r.lineValue, 0);
  const totalQuantity = resolved.reduce((s, r) => s + r.quantity, 0);

  let orderEventAt: Date;
  try {
    orderEventAt = kabulDateTimeLocalToDate(data.capiEventTimeKabul);
  } catch {
    return { ok: false, error: "Invalid event time (Kabul)." };
  }
  if (!isWithinMetaEventTimeWindow(orderEventAt)) {
    return {
      ok: false,
      error:
        "Event time cannot be more than 7 days in the past (Meta CAPI limit).",
    };
  }

  const [latestSession] = await db
    .select()
    .from(ctwaSessions)
    .where(eq(ctwaSessions.contactId, contact.id))
    .orderBy(desc(ctwaSessions.sendTime))
    .limit(1);

  const ctwaClid = latestSession?.ctwaClid?.trim() || null;
  const wabaId = latestSession?.wabaId ?? null;

  if (!ctwaClid) {
    return { ok: true, payloadJson: CAPI_SKIPPED_NO_CTWA_PAYLOAD_JSON };
  }

  if (process.env.NODE_ENV !== "production") {
    if (!process.env.META_TEST_EVENT_CODE?.trim()) {
      return {
        ok: false,
        error:
          "META_TEST_EVENT_CODE is required in development (Events Manager → Test events code).",
      };
    }
  }

  const { payload } = buildMetaPurchasePayload({
    orderId: PREVIEW_ORDER_ID,
    orderCreatedAt: orderEventAt,
    contactId: contact.id,
    countryCode: contact.countryCode,
    value: orderTotal,
    currency: APP_CURRENCY,
    totalQuantity,
    lines: resolved.map((r) => ({
      sku: r.product.sku,
      productName: r.product.name,
      quantity: r.quantity,
      lineValue: r.lineValue,
    })),
    ctwaClid: ctwaClid || null,
    whatsappBusinessAccountId: wabaId,
    phoneDigits: e164ToDigits(contact.phoneNumber),
  });

  return { ok: true, payloadJson: serializeMetaPayload(payload) };
}

export type OrderConfirmationRow = {
  order: typeof orders.$inferSelect;
  contact: typeof contacts.$inferSelect;
  lines: Array<{
    lineIndex: number;
    quantity: number;
    unitSalePrice: string;
    lineValue: string;
    productName: string;
    sku: string;
  }>;
};

export async function getOrderConfirmation(
  orderId: string,
): Promise<OrderConfirmationRow | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return null;

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, order.contactId))
    .limit(1);
  if (!contact) return null;

  const rows = await db
    .select({
      lineIndex: orderItems.lineIndex,
      quantity: orderItems.quantity,
      unitSalePrice: orderItems.unitSalePrice,
      lineValue: orderItems.lineValue,
      productName: products.name,
      sku: products.sku,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.lineIndex);

  return { order, contact, lines: rows };
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const data = parsed.data;
  const phoneKey = contactPhoneKeyFromRaw(data.phone);
  if (!phoneKey) {
    return { ok: false, error: "Enter a valid phone number (with country code)." };
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phoneNumber, phoneKey))
    .limit(1);

  if (!contact) {
    return {
      ok: false,
      error:
        "No contact found for this number. The customer must reach you on WhatsApp first.",
    };
  }

  const productIds = [...new Set(data.lines.map((l) => l.productId))];
  const productRows = await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds));
  const productById = new Map(productRows.map((p) => [p.id, p]));

  type ResolvedLine = {
    product: (typeof productRows)[0];
    quantity: number;
    unit: number;
    lineValue: number;
  };

  const resolved: ResolvedLine[] = [];
  for (const line of data.lines) {
    const p = productById.get(line.productId);
    if (!p) {
      return { ok: false, error: "One or more products were not found." };
    }
    const unit = line.unitSalePrice;
    const qty = line.quantity;
    const lineValue = unit * qty;
    resolved.push({ product: p, quantity: qty, unit, lineValue });
  }

  const orderTotal = resolved.reduce((s, r) => s + r.lineValue, 0);
  const totalQuantity = resolved.reduce((s, r) => s + r.quantity, 0);

  const orderPk = data.orderId?.trim() || `ORD-${nanoid(10).toUpperCase()}`;

  let orderEventAt: Date;
  try {
    orderEventAt = kabulDateTimeLocalToDate(data.capiEventTimeKabul);
  } catch {
    return { ok: false, error: "Invalid event time (Kabul)." };
  }
  if (!isWithinMetaEventTimeWindow(orderEventAt)) {
    return {
      ok: false,
      error:
        "Event time cannot be more than 7 days in the past (Meta CAPI limit).",
    };
  }

  const [latestSession] = await db
    .select()
    .from(ctwaSessions)
    .where(eq(ctwaSessions.contactId, contact.id))
    .orderBy(desc(ctwaSessions.sendTime))
    .limit(1);

  const ctwaClid = latestSession?.ctwaClid?.trim() || null;
  const wabaId = latestSession?.wabaId ?? null;
  const skipCapi = !ctwaClid;

  let eventId = "";
  let capiPayloadJson = CAPI_SKIPPED_NO_CTWA_PAYLOAD_JSON;

  if (!skipCapi) {
    const metaParams = {
      orderId: orderPk,
      orderCreatedAt: orderEventAt,
      contactId: contact.id,
      countryCode: contact.countryCode,
      value: orderTotal,
      currency: APP_CURRENCY,
      totalQuantity,
      lines: resolved.map((r) => ({
        sku: r.product.sku,
        productName: r.product.name,
        quantity: r.quantity,
        lineValue: r.lineValue,
      })),
      ctwaClid,
      whatsappBusinessAccountId: wabaId,
      phoneDigits: e164ToDigits(contact.phoneNumber),
    };

    try {
      const capiResult = await sendMetaPurchaseEvent(metaParams);
      eventId = capiResult.eventId;
      capiPayloadJson = capiResult.payloadJson;
    } catch (e) {
      console.error("[createOrder] Meta CAPI failed", e);
      const message = e instanceof Error ? e.message : "Meta CAPI request failed";
      return { ok: false, error: message };
    }
  }

  const [inserted] = await db
    .insert(orders)
    .values({
      id: orderPk,
      contactId: contact.id,
      ctwaSessionId: latestSession?.id ?? null,
      value: orderTotal.toFixed(4),
      currency: APP_CURRENCY,
      status: data.status,
      capiSent: !skipCapi,
      capiEventId: skipCapi ? null : eventId,
      createdAt: orderEventAt,
      updatedAt: orderEventAt,
    })
    .returning();

  if (!inserted) {
    return {
      ok: false,
      error: skipCapi
        ? "Could not create order."
        : "Meta event was sent but the order could not be saved. Check Meta Events Manager and try again or reconcile manually.",
    };
  }

  try {
    await db.insert(orderItems).values(
      resolved.map((r, lineIndex) => ({
        orderId: inserted.id,
        lineIndex,
        productId: r.product.id,
        quantity: r.quantity,
        unitSalePrice: r.unit.toFixed(4),
        lineValue: r.lineValue.toFixed(4),
      })),
    );
  } catch (e) {
    console.error("[createOrder] order_items insert failed", e);
    await db.delete(orders).where(eq(orders.id, inserted.id));
    return {
      ok: false,
      error: skipCapi
        ? "Could not save order lines."
        : "Meta event was sent but line items failed to save. The order was removed; check Meta for a duplicate if you retry.",
    };
  }

  revalidatePath("/");
  revalidatePath("/orders/new");
  revalidatePath(`/orders/${orderPk}/confirmation`);

  return {
    ok: true,
    orderId: orderPk,
    capiSent: !skipCapi,
    capiEventId: skipCapi ? "" : eventId,
    capiPayloadJson,
    capiError: null,
  };
}
