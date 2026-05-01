import { asc, eq } from "drizzle-orm";

import {
  contacts,
  ctwaSessions,
  orderItems,
  orders,
  products,
} from "@/drizzle/schema";
import { db } from "@/lib/db";

export type OrderDetailLine = {
  lineIndex: number;
  productName: string | null;
  quantity: number;
  unitSalePrice: string;
  lineValue: string;
};

export type OrderDetail = {
  id: string;
  contactId: string;
  phone: string;
  ctwaClid: string | null;
  value: string;
  currency: string;
  status: string;
  deliveryCost: string;
  capiSent: boolean;
  createdAt: Date;
  lines: OrderDetailLine[];
};

export async function loadOrderDetail(orderId: string) {
  const [orderRow] = await db
    .select({
      id: orders.id,
      contactId: orders.contactId,
      phone: contacts.phoneNumber,
      ctwaClid: ctwaSessions.ctwaClid,
      value: orders.value,
      currency: orders.currency,
      status: orders.status,
      deliveryCost: orders.deliveryCost,
      capiSent: orders.capiSent,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(contacts, eq(orders.contactId, contacts.id))
    .leftJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) return null;

  const lines = await db
    .select({
      lineIndex: orderItems.lineIndex,
      productName: products.name,
      quantity: orderItems.quantity,
      unitSalePrice: orderItems.unitSalePrice,
      lineValue: orderItems.lineValue,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.lineIndex));

  const detail: OrderDetail = {
    id: orderRow.id,
    contactId: orderRow.contactId,
    phone: orderRow.phone,
    ctwaClid: orderRow.ctwaClid,
    value: String(orderRow.value),
    currency: orderRow.currency,
    status: orderRow.status,
    deliveryCost: String(orderRow.deliveryCost),
    capiSent: orderRow.capiSent,
    createdAt: orderRow.createdAt,
    lines: lines.map((l) => ({
      lineIndex: l.lineIndex,
      productName: l.productName,
      quantity: l.quantity,
      unitSalePrice: String(l.unitSalePrice),
      lineValue: String(l.lineValue),
    })),
  };

  return detail;
}
