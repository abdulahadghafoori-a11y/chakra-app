import { and, asc, desc, eq } from "drizzle-orm";

import {
  contacts,
  ctwaSessions,
  orderItems,
  orders,
  products,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import type { MetaPurchaseLineItem, MetaPurchaseParams } from "@/lib/meta-capi";
import { e164ToDigits } from "@/lib/phone";
import { APP_CURRENCY } from "@/lib/validations/order";

export type OrderPurchaseCapiContext = {
  orderId: string;
  capiSent: boolean;
  contactId: string;
  phoneDigits: string;
  countryCode: string | null;
  ctwaClid: string | null;
  wabaId: string | null;
  lines: MetaPurchaseLineItem[];
  orderTotal: number;
  totalQuantity: number;
};

export type ContactCtwaCapiFields = {
  /** Session row to store on `orders.ctwa_session_id` when creating an order. */
  ctwaSessionId: string | null;
  ctwaClid: string | null;
  wabaId: string | null;
};

/**
 * CTWA fields for Purchase CAPI and order storage.
 * Prefers `preferredSessionId` when it belongs to the contact; falls back to latest session
 * for click id / WABA when the chosen row has no `ctwa_clid`.
 */
export async function resolveContactCtwaForCapi(
  contactId: string,
  preferredSessionId?: string | null,
): Promise<ContactCtwaCapiFields> {
  const [latest] = await db
    .select({
      id: ctwaSessions.id,
      ctwaClid: ctwaSessions.ctwaClid,
      wabaId: ctwaSessions.wabaId,
    })
    .from(ctwaSessions)
    .where(eq(ctwaSessions.contactId, contactId))
    .orderBy(desc(ctwaSessions.sendTime))
    .limit(1);

  const preferred = preferredSessionId?.trim();
  if (!preferred) {
    return {
      ctwaSessionId: latest?.id ?? null,
      ctwaClid: latest?.ctwaClid?.trim() || null,
      wabaId: latest?.wabaId ?? null,
    };
  }

  const [chosen] = await db
    .select({
      id: ctwaSessions.id,
      ctwaClid: ctwaSessions.ctwaClid,
      wabaId: ctwaSessions.wabaId,
    })
    .from(ctwaSessions)
    .where(
      and(eq(ctwaSessions.id, preferred), eq(ctwaSessions.contactId, contactId)),
    )
    .limit(1);

  if (!chosen) {
    return {
      ctwaSessionId: latest?.id ?? null,
      ctwaClid: latest?.ctwaClid?.trim() || null,
      wabaId: latest?.wabaId ?? null,
    };
  }

  let ctwaClid = chosen.ctwaClid?.trim() || null;
  let wabaId = chosen.wabaId ?? null;
  if (!ctwaClid && latest?.ctwaClid?.trim()) {
    ctwaClid = latest.ctwaClid.trim();
  }
  if (!wabaId && latest?.wabaId) {
    wabaId = latest.wabaId;
  }

  return {
    ctwaSessionId: chosen.id,
    ctwaClid,
    wabaId,
  };
}

/**
 * Load contact, CTWA session (order-linked or latest for contact), and lines for Purchase CAPI.
 */
export async function loadOrderPurchaseCapiContext(
  orderId: string,
): Promise<OrderPurchaseCapiContext | null> {
  const [orderRow] = await db
    .select({
      id: orders.id,
      contactId: orders.contactId,
      ctwaSessionId: orders.ctwaSessionId,
      capiWabaId: orders.capiWabaId,
      capiSent: orders.capiSent,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) return null;

  const [contact] = await db
    .select({
      id: contacts.id,
      phoneNumber: contacts.phoneNumber,
      countryCode: contacts.countryCode,
    })
    .from(contacts)
    .where(eq(contacts.id, orderRow.contactId))
    .limit(1);

  if (!contact) return null;

  const { ctwaClid, wabaId: sessionWabaId } = await resolveContactCtwaForCapi(
    orderRow.contactId,
    orderRow.ctwaSessionId,
  );
  const wabaId = orderRow.capiWabaId?.trim() || sessionWabaId;

  const itemRows = await db
    .select({
      quantity: orderItems.quantity,
      lineValue: orderItems.lineValue,
      sku: products.sku,
      productName: products.name,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.lineIndex));

  const lines: MetaPurchaseLineItem[] = itemRows.map((r) => ({
    sku: r.sku,
    productName: r.productName,
    quantity: r.quantity,
    lineValue: Number.parseFloat(String(r.lineValue)),
  }));

  const orderTotal = lines.reduce((s, l) => s + l.lineValue, 0);
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);

  return {
    orderId: orderRow.id,
    capiSent: orderRow.capiSent,
    contactId: contact.id,
    phoneDigits: e164ToDigits(contact.phoneNumber),
    countryCode: contact.countryCode,
    ctwaClid,
    wabaId,
    lines,
    orderTotal,
    totalQuantity,
  };
}

export function buildMetaPurchaseParamsFromContext(
  ctx: OrderPurchaseCapiContext,
  orderEventAt: Date,
): MetaPurchaseParams {
  return {
    orderId: ctx.orderId,
    orderCreatedAt: orderEventAt,
    contactId: ctx.contactId,
    countryCode: ctx.countryCode,
    value: ctx.orderTotal,
    currency: APP_CURRENCY,
    totalQuantity: ctx.totalQuantity,
    lines: ctx.lines,
    ctwaClid: ctx.ctwaClid?.trim() || null,
    whatsappBusinessAccountId: ctx.wabaId,
    phoneDigits: ctx.phoneDigits,
  };
}
