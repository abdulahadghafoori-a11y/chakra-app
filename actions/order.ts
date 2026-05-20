"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

import {
  contacts,
  ctwaSessions,
  metaCampaigns,
  orderItems,
  orders,
  products,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import { getAppFxUsdAfnRow } from "@/lib/app-fx-usd-afn";
import {
  afnAmountToUsd2,
  estimateAfnWholeFromStoredUsd,
  formatUsd2,
  parseAfnPerOneUsdFromDb,
  roundAfnWhole,
} from "@/lib/fx-afn-usd";
import {
  buildMetaPurchasePayload,
  metaPurchaseResendEventId,
  sendMetaPurchaseEvent,
  serializeMetaPayload,
  type MetaPurchaseParams,
} from "@/lib/meta-capi";
import {
  isWithinMetaEventTimeWindow,
  kabulDateTimeLocalToDate,
} from "@/lib/kabul-time";
import { contactPhoneKeyFromRaw } from "@/lib/contact-phone";
import { e164ToDigits } from "@/lib/phone";
import {
  buildMetaPurchaseParamsFromContext,
  loadOrderPurchaseCapiContext,
} from "@/lib/order-meta-capi";
import { convertOrderFormLinesFromAfn } from "@/lib/order-afn-input-to-usd";
import { recordManualCampaignAttributionChange } from "@/lib/campaign-activity";
import { enforcePublicActionRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/structured-log";
import { assertStaffSession, requireStaffSession } from "@/lib/staff-auth/guard";
import {
  APP_CURRENCY,
  createOrderSchema,
  type CreateOrderInput,
  deleteOrderSchema,
  linkOrderManualCampaignSchema,
  orderStatusEligibleForPurchaseCapi,
  resendOrderPurchaseCapiBaseSchema,
  resendOrderPurchaseCapiSchema,
  updateOrderMetadataSchema,
  updateOrderStatusSchema,
  type UpdateOrderStatusInput,
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

const CAPI_DEFERRED_PAYLOAD_JSON = JSON.stringify(
  {
    note: "Meta Purchase is sent only when status is Confirmed or Paid. Create this order as Pending (or change status on the order page); then set Confirmed or Paid to fire CAPI.",
    capiDeferred: true,
  },
  null,
  2,
);

async function resolveOrderUsdAfnRate(): Promise<
  { afnPerOneUsd: number; snapshot: string } | { error: string }
> {
  const row = await getAppFxUsdAfnRow();
  if (!row) {
    return {
      error:
        "USD→AFN rate is missing. Staff must set how many AFN equal exactly 1.00 USD (Create order page or database) before converting line items.",
    };
  }
  const snapshotRaw =
    typeof row.afnPerOneUsd === "string"
      ? row.afnPerOneUsd.trim()
      : String(row.afnPerOneUsd);
  const afnPerOneUsd = Number(snapshotRaw);
  if (!Number.isFinite(afnPerOneUsd) || afnPerOneUsd <= 0) {
    return {
      error: "Invalid FX rate in the database. Ask staff to fix AFN per 1 USD.",
    };
  }
  return { afnPerOneUsd, snapshot: snapshotRaw };
}

export async function previewOrderCapiPayload(
  input: CreateOrderInput,
): Promise<{ ok: true; payloadJson: string } | { ok: false; error: string }> {
  const limited = await enforcePublicActionRateLimit("preview_order_capi", {
    limit: 20,
    windowMs: 60_000,
  });
  if (!limited.ok) return { ok: false, error: limited.error };

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

  const fx = await resolveOrderUsdAfnRate();
  if ("error" in fx) {
    return { ok: false, error: fx.error };
  }

  const conv = convertOrderFormLinesFromAfn(
    data.lines.map((l) => ({
      productId: l.productId,
      unitSalePrice: l.unitSalePrice,
      quantity: l.quantity,
    })),
    productById,
    fx.afnPerOneUsd,
  );
  if (!conv.ok) {
    return { ok: false, error: conv.error };
  }

  const resolved = conv.resolved;
  const orderTotal = conv.orderTotalUsd;
  const totalQuantity = resolved.reduce((s, r) => s + r.quantity, 0);

  if (!orderStatusEligibleForPurchaseCapi(data.status)) {
    return { ok: true, payloadJson: CAPI_DEFERRED_PAYLOAD_JSON };
  }

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

  if (!latestSession?.id) {
    const [anyCampaign] = await db
      .select({ id: metaCampaigns.id })
      .from(metaCampaigns)
      .limit(1);
    const mc = data.manualMetaCampaignId?.trim() ?? "";

    if (!mc) {
      if (!anyCampaign) {
        return {
          ok: false,
          error:
            "This contact has no WhatsApp CTWA session. Open Campaigns and run Sync from Meta, then choose a Meta campaign before previewing.",
        };
      }
      return {
        ok: false,
        error:
          "Select a Meta campaign. Orders without a WhatsApp CTWA session must be attributed manually.",
      };
    }

    const [campRow] = await db
      .select({ id: metaCampaigns.id })
      .from(metaCampaigns)
      .where(eq(metaCampaigns.id, mc))
      .limit(1);
    if (!campRow) {
      return {
        ok: false,
        error:
          "Selected Meta campaign was not found. Sync from Meta on Campaigns, then retry.",
      };
    }
  }

  const ctwaClid = latestSession?.ctwaClid?.trim() || null;
  const wabaId = latestSession?.wabaId ?? null;

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
      lineValue: r.lineUsd,
    })),
    ctwaClid,
    whatsappBusinessAccountId: wabaId,
    phoneDigits: e164ToDigits(contact.phoneNumber),
  });

  return { ok: true, payloadJson: serializeMetaPayload(payload) };
}

export type OrderConfirmationRow = {
  order: typeof orders.$inferSelect & {
    /** Whole AFN from `value` USD × `afnPerUsdSnapshot`; null if no snapshot */
    valueAfn: string | null;
  };
  contact: typeof contacts.$inferSelect;
  lines: Array<{
    lineIndex: number;
    quantity: number;
    unitSalePrice: string;
    unitSalePriceAfn: string | null;
    lineValue: string;
    lineValueAfn: string | null;
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

  const snapshot = order.afnPerUsdSnapshot;

  const merchandiseAfn = estimateAfnWholeFromStoredUsd(
    Number(order.value),
    snapshot,
  );

  return {
    order: {
      ...order,
      valueAfn: merchandiseAfn == null ? null : String(merchandiseAfn),
    },
    contact,
    lines: rows.map((r) => {
      const unitUsd = Number(r.unitSalePrice);
      const lineUsd = Number(r.lineValue);
      const unitAfn = estimateAfnWholeFromStoredUsd(unitUsd, snapshot);
      const lineAfn = estimateAfnWholeFromStoredUsd(lineUsd, snapshot);
      return {
        lineIndex: r.lineIndex,
        quantity: r.quantity,
        unitSalePrice: String(r.unitSalePrice),
        unitSalePriceAfn: unitAfn == null ? null : String(unitAfn),
        lineValue: String(r.lineValue),
        lineValueAfn: lineAfn == null ? null : String(lineAfn),
        productName: r.productName,
        sku: r.sku,
      };
    }),
  };
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const limited = await enforcePublicActionRateLimit("create_order", {
    limit: 15,
    windowMs: 60_000,
  });
  if (!limited.ok) return { ok: false, error: limited.error };

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

  const fx = await resolveOrderUsdAfnRate();
  if ("error" in fx) {
    return { ok: false, error: fx.error };
  }

  const conv = convertOrderFormLinesFromAfn(
    data.lines.map((l) => ({
      productId: l.productId,
      unitSalePrice: l.unitSalePrice,
      quantity: l.quantity,
    })),
    productById,
    fx.afnPerOneUsd,
  );
  if (!conv.ok) {
    return { ok: false, error: conv.error };
  }

  const resolved = conv.resolved;
  const orderTotal = conv.orderTotalUsd;
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

  let manualCampaignIdToSave: string | null = null;
  if (!latestSession?.id) {
    const [anyCampaign] = await db
      .select({ id: metaCampaigns.id })
      .from(metaCampaigns)
      .limit(1);

    const mc = data.manualMetaCampaignId?.trim() ?? "";

    if (!mc) {
      if (!anyCampaign) {
        return {
          ok: false,
          error:
            "This contact has no WhatsApp CTWA session. Open Campaigns and run Sync from Meta, then select a Meta campaign for this order.",
        };
      }
      return {
        ok: false,
        error:
          "Select a Meta campaign. Orders without a WhatsApp CTWA session must be attributed manually.",
      };
    }

    const [campRow] = await db
      .select({ id: metaCampaigns.id })
      .from(metaCampaigns)
      .where(eq(metaCampaigns.id, mc))
      .limit(1);
    if (!campRow) {
      return {
        ok: false,
        error:
          "Selected Meta campaign was not found. Sync from Meta on Campaigns, then retry.",
      };
    }
    manualCampaignIdToSave = mc;
  }

  const provinceToSave =
    data.interProvinceAfghanistanDelivery &&
    data.deliveryProvinceAfghanistan.trim()
      ? data.deliveryProvinceAfghanistan.trim()
      : null;
  const trackingToSave =
    data.interProvinceAfghanistanDelivery &&
    data.deliveryTrackingNumber.trim()
      ? data.deliveryTrackingNumber.trim()
      : null;

  const ctwaClid = latestSession?.ctwaClid?.trim() || null;
  const wabaId = latestSession?.wabaId ?? null;
  const capiEligible = orderStatusEligibleForPurchaseCapi(data.status);

  let eventId = "";
  let capiPayloadJson = CAPI_DEFERRED_PAYLOAD_JSON;
  let capiSent = false;

  if (capiEligible) {
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
        lineValue: r.lineUsd,
      })),
      ctwaClid,
      whatsappBusinessAccountId: wabaId,
      phoneDigits: e164ToDigits(contact.phoneNumber),
    };

    try {
      const capiResult = await sendMetaPurchaseEvent(metaParams);
      eventId = capiResult.eventId;
      capiPayloadJson = capiResult.payloadJson;
      capiSent = true;
    } catch (e) {
      log.error("create_order.capi_failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      const message = e instanceof Error ? e.message : "Meta CAPI request failed";
      return { ok: false, error: message };
    }
  }
  const deliveryAfn = data.interProvinceAfghanistanDelivery
    ? roundAfnWhole(data.deliveryCost)
    : 0;
  const deliveryUsd = afnAmountToUsd2(deliveryAfn, fx.afnPerOneUsd);
  if (!Number.isFinite(deliveryUsd) || deliveryUsd < 0) {
    return { ok: false, error: "Invalid courier fee in AFN." };
  }

  const [inserted] = await db
    .insert(orders)
    .values({
      id: orderPk,
      contactId: contact.id,
      ctwaSessionId: latestSession?.id ?? null,
      manualMetaCampaignId: manualCampaignIdToSave,
      value: formatUsd2(orderTotal),
      currency: APP_CURRENCY,
      status: data.status,
      capiSent,
      capiEventId: capiSent ? eventId : null,
      deliveryCost: formatUsd2(deliveryUsd),
      deliveryProvinceAfghanistan: provinceToSave,
      deliveryTrackingNumber: trackingToSave,
      returnCost: "0",
      codFee: "0",
      afnPerUsdSnapshot: fx.snapshot,
      orderEventAt,
    })
    .returning();

  if (!inserted) {
    return {
      ok: false,
      error: capiSent
        ? "Meta event was sent but the order could not be saved. Check Meta Events Manager and try again or reconcile manually."
        : "Could not create order.",
    };
  }

  try {
    await db.insert(orderItems).values(
      resolved.map((r, lineIndex) => {
        const unitCogs = Number(r.product.cogs);
        const safeUnitCogs = Number.isFinite(unitCogs) ? unitCogs : 0;
        const lineCogs = safeUnitCogs * r.quantity;
        return {
          orderId: inserted.id,
          lineIndex,
          productId: r.product.id,
          quantity: r.quantity,
          unitSalePrice: formatUsd2(r.unitUsd),
          lineValue: formatUsd2(r.lineUsd),
          unitCogs: safeUnitCogs.toFixed(4),
          lineCogs: lineCogs.toFixed(4),
        };
      }),
    );
  } catch (e) {
    log.error("create_order.items_insert_failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    await db.delete(orders).where(eq(orders.id, inserted.id));
    return {
      ok: false,
      error: capiSent
        ? "Meta event was sent but line items failed to save. The order was removed; check Meta for a duplicate if you retry."
        : "Could not save order lines.",
    };
  }

  if (manualCampaignIdToSave && !latestSession?.id) {
    try {
      await recordManualCampaignAttributionChange({
        actorEmail: "public-order-create",
        orderId: inserted.id,
        fromCampaignId: null,
        toCampaignId: manualCampaignIdToSave,
      });
    } catch (e) {
      log.error("create_order.attribution_audit_failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  revalidatePath("/campaigns");
  revalidatePath("/orders");
  revalidatePath("/orders/new");
  revalidatePath(`/orders/${orderPk}`);
  revalidatePath(`/orders/${orderPk}/confirmation`);

  return {
    ok: true,
    orderId: orderPk,
    capiSent,
    capiEventId: capiSent ? eventId : "",
    capiPayloadJson,
    capiError: null,
  };
}

export type UpdateOrderStatusResult =
  | {
      ok: true;
      capiSent: boolean;
      capiEventId: string | null;
      capiPayloadJson: string | null;
    }
  | { ok: false; error: string };

export async function updateOrderStatus(
  input: UpdateOrderStatusInput,
): Promise<UpdateOrderStatusResult> {
  await assertStaffSession();

  const parsed = updateOrderStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { orderId, status: newStatus, capiEventTimeKabul } = parsed.data;

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) {
    return { ok: false, error: "Order not found." };
  }

  if (order.status === newStatus) {
    return {
      ok: true,
      capiSent: order.capiSent,
      capiEventId: order.capiEventId,
      capiPayloadJson: null,
    };
  }

  let orderEventAt: Date;
  try {
    orderEventAt = capiEventTimeKabul?.trim()
      ? kabulDateTimeLocalToDate(capiEventTimeKabul)
      : new Date();
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

  const wantPurchaseCapi =
    orderStatusEligibleForPurchaseCapi(newStatus) && !order.capiSent;

  let capiSent = order.capiSent;
  let capiEventId = order.capiEventId;
  let capiPayloadJson: string | null = null;

  if (wantPurchaseCapi) {
    const ctx = await loadOrderPurchaseCapiContext(orderId);
    if (!ctx) {
      return { ok: false, error: "Could not load order for Meta CAPI." };
    }

    const params = buildMetaPurchaseParamsFromContext(ctx, orderEventAt);
    try {
      const result = await sendMetaPurchaseEvent(params);
      capiSent = true;
      capiEventId = result.eventId;
      capiPayloadJson = result.payloadJson;
    } catch (e) {
      log.error("update_order_status.capi_failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      const message =
        e instanceof Error ? e.message : "Meta CAPI request failed";
      return { ok: false, error: message };
    }
  }

  await db
    .update(orders)
    .set({
      status: newStatus,
      capiSent,
      capiEventId,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  revalidatePath("/campaigns");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/confirmation`);

  return {
    ok: true,
    capiSent,
    capiEventId,
    capiPayloadJson,
  };
}

export type LinkOrderManualCampaignResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Staff-only: attribute an order with no WhatsApp CTWA session to a synced Meta campaign.
 * When `ctwa_session_id` is set, rollups prefer the Meta ad path instead.
 */
export async function linkOrderManualCampaign(
  raw: unknown,
): Promise<LinkOrderManualCampaignResult> {
  const staffSession = await requireStaffSession();
  const parsed = linkOrderManualCampaignSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { orderId, metaCampaignId } = parsed.data;

  const [order] = await db
    .select({
      id: orders.id,
      ctwaSessionId: orders.ctwaSessionId,
      manualMetaCampaignId: orders.manualMetaCampaignId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return { ok: false, error: "Order not found." };
  if (order.ctwaSessionId != null) {
    return {
      ok: false,
      error:
        "This order is linked to a WhatsApp CTWA session. Manual campaign attribution is not available.",
    };
  }

  const prevManual =
    typeof order.manualMetaCampaignId === "string"
      ? order.manualMetaCampaignId.trim() || null
      : null;

  if (metaCampaignId === "") {
    await db
      .update(orders)
      .set({
        manualMetaCampaignId: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    try {
      await recordManualCampaignAttributionChange({
        actorEmail: staffSession.email,
        orderId,
        fromCampaignId: prevManual,
        toCampaignId: null,
      });
    } catch (e) {
      log.error("link_order_campaign.attribution_audit_failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    revalidatePath("/campaigns");
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath(`/orders/${orderId}/confirmation`);

    return { ok: true };
  }

  const [campRow] = await db
    .select({ id: metaCampaigns.id })
    .from(metaCampaigns)
    .where(eq(metaCampaigns.id, metaCampaignId))
    .limit(1);

  if (!campRow) {
    return {
      ok: false,
      error:
        "That campaign is not in your database yet. Run “Sync from Meta” on Campaigns.",
    };
  }

  await db
    .update(orders)
    .set({
      manualMetaCampaignId: metaCampaignId,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  try {
    await recordManualCampaignAttributionChange({
      actorEmail: staffSession.email,
      orderId,
      fromCampaignId: prevManual,
      toCampaignId: metaCampaignId,
    });
  } catch (e) {
    log.error("link_order_campaign.attribution_audit_failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  revalidatePath("/campaigns");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/confirmation`);

  return { ok: true };
}

export type DeleteOrderResult = { ok: true } | { ok: false; error: string };

export async function deleteOrder(raw: unknown): Promise<DeleteOrderResult> {
  await assertStaffSession();

  const parsed = deleteOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { orderId } = parsed.data;

  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) {
    return { ok: false, error: "Order not found." };
  }

  await db.delete(orders).where(eq(orders.id, row.id));

  revalidatePath("/campaigns");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/confirmation`);

  return { ok: true };
}

export type UpdateOrderMetadataResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateOrderMetadata(
  raw: unknown,
): Promise<UpdateOrderMetadataResult> {
  await assertStaffSession();

  const parsed = updateOrderMetadataSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const data = parsed.data;

  const [orderRow] = await db
    .select({
      id: orders.id,
      afnPerUsdSnapshot: orders.afnPerUsdSnapshot,
    })
    .from(orders)
    .where(eq(orders.id, data.orderId))
    .limit(1);

  if (!orderRow) {
    return { ok: false, error: "Order not found." };
  }

  const snapshotStr =
    typeof orderRow.afnPerUsdSnapshot === "string"
      ? orderRow.afnPerUsdSnapshot.trim()
      : "";
  const afnPerOneUsd = parseAfnPerOneUsdFromDb(snapshotStr || undefined);

  let deliveryUsd = 0;
  let provinceToSave: string | null = null;
  let trackingToSave: string | null = null;

  if (data.interProvinceAfghanistanDelivery) {
    if (!(Number.isFinite(afnPerOneUsd) && afnPerOneUsd > 0)) {
      return {
        ok: false,
        error:
          "This order has no valid AFN→USD snapshot; fix data or recreate the order before editing provincial courier.",
      };
    }
    provinceToSave = data.deliveryProvinceAfghanistan.trim() || null;
    trackingToSave = data.deliveryTrackingNumber.trim() || null;
    const deliveryAfn = roundAfnWhole(data.deliveryCost);
    deliveryUsd = afnAmountToUsd2(deliveryAfn, afnPerOneUsd);
    if (!Number.isFinite(deliveryUsd) || deliveryUsd < 0) {
      return { ok: false, error: "Invalid courier fee in AFN." };
    }
  }

  await db
    .update(orders)
    .set({
      deliveryCost: formatUsd2(deliveryUsd),
      deliveryProvinceAfghanistan: provinceToSave,
      deliveryTrackingNumber: trackingToSave,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderRow.id));

  revalidatePath("/campaigns");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderRow.id}`);
  revalidatePath(`/orders/${orderRow.id}/confirmation`);

  return { ok: true };
}

async function resolveResendPurchaseMetaParams(
  orderId: string,
  capiEventTimeKabul: string,
): Promise<
  | { ok: false; error: string }
  | { ok: true; params: MetaPurchaseParams }
> {
  const [orderRow] = await db
    .select({
      id: orders.id,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) {
    return { ok: false, error: "Order not found." };
  }

  if (!orderStatusEligibleForPurchaseCapi(orderRow.status)) {
    return {
      ok: false,
      error:
        "Resend Purchase only when status is Confirmed or Paid.",
    };
  }

  let orderEventAt: Date;
  try {
    orderEventAt = kabulDateTimeLocalToDate(capiEventTimeKabul);
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

  const ctx = await loadOrderPurchaseCapiContext(orderId);
  if (!ctx) {
    return { ok: false, error: "Could not load order for Meta CAPI." };
  }

  const params = buildMetaPurchaseParamsFromContext(ctx, orderEventAt);
  return { ok: true, params };
}

export type PrepareResendOrderPurchaseCapiResult =
  | { ok: true; payloadJson: string; eventIdOverride: string }
  | { ok: false; error: string };

export async function prepareResendOrderPurchaseCapi(
  raw: unknown,
): Promise<PrepareResendOrderPurchaseCapiResult> {
  await assertStaffSession();

  const parsed = resendOrderPurchaseCapiBaseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { orderId, capiEventTimeKabul } = parsed.data;

  const resolved = await resolveResendPurchaseMetaParams(
    orderId,
    capiEventTimeKabul,
  );
  if (!resolved.ok) return resolved;

  const eventIdOverride = metaPurchaseResendEventId(orderId);
  const { payload, eventId } = buildMetaPurchasePayload(resolved.params, {
    eventIdOverride,
  });

  return {
    ok: true,
    payloadJson: serializeMetaPayload(payload),
    eventIdOverride: eventId,
  };
}

export type ResendOrderPurchaseCapiResult =
  | { ok: true; capiEventId: string; capiPayloadJson: string }
  | { ok: false; error: string };

export async function resendOrderPurchaseCapi(
  raw: unknown,
): Promise<ResendOrderPurchaseCapiResult> {
  await assertStaffSession();

  const parsed = resendOrderPurchaseCapiSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { orderId, capiEventTimeKabul, eventIdOverride: clientOverride } =
    parsed.data;

  const resolved = await resolveResendPurchaseMetaParams(
    orderId,
    capiEventTimeKabul,
  );
  if (!resolved.ok) return resolved;

  const eventIdOverride =
    clientOverride?.trim() || metaPurchaseResendEventId(orderId);

  try {
    const result = await sendMetaPurchaseEvent(resolved.params, {
      eventIdOverride,
    });
    await db
      .update(orders)
      .set({
        capiSent: true,
        capiEventId: result.eventId,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    revalidatePath("/campaigns");
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath(`/orders/${orderId}/confirmation`);

    return {
      ok: true,
      capiEventId: result.eventId,
      capiPayloadJson: result.payloadJson,
    };
  } catch (e) {
    log.error("resend_order_capi.failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    const message =
      e instanceof Error ? e.message : "Meta CAPI request failed";
    return { ok: false, error: message };
  }
}
