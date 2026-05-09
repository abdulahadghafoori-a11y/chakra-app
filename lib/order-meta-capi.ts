import { asc, desc, eq } from "drizzle-orm";

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

  let session: {
    ctwaClid: string | null;
    wabaId: string | null;
  } | null = null;

  if (orderRow.ctwaSessionId) {
    const [linked] = await db
      .select({
        ctwaClid: ctwaSessions.ctwaClid,
        wabaId: ctwaSessions.wabaId,
      })
      .from(ctwaSessions)
      .where(eq(ctwaSessions.id, orderRow.ctwaSessionId))
      .limit(1);
    session = linked ?? null;
  }

  if (!session?.ctwaClid?.trim()) {
    const [latest] = await db
      .select({
        ctwaClid: ctwaSessions.ctwaClid,
        wabaId: ctwaSessions.wabaId,
      })
      .from(ctwaSessions)
      .where(eq(ctwaSessions.contactId, orderRow.contactId))
      .orderBy(desc(ctwaSessions.sendTime))
      .limit(1);
    if (latest?.ctwaClid?.trim()) {
      session = latest;
    }
  }

  const ctwaClid = session?.ctwaClid?.trim() || null;
  const wabaId = session?.wabaId ?? null;

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
): MetaPurchaseParams | null {
  const clid = ctx.ctwaClid?.trim();
  if (!clid) return null;

  return {
    orderId: ctx.orderId,
    orderCreatedAt: orderEventAt,
    contactId: ctx.contactId,
    countryCode: ctx.countryCode,
    value: ctx.orderTotal,
    currency: APP_CURRENCY,
    totalQuantity: ctx.totalQuantity,
    lines: ctx.lines,
    ctwaClid: clid,
    whatsappBusinessAccountId: ctx.wabaId,
    phoneDigits: ctx.phoneDigits,
  };
}
