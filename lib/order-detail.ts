import { asc, eq } from "drizzle-orm";

import {
  contacts,
  ctwaSessions,
  metaCampaigns,
  orderItems,
  orders,
  products,
} from "@/drizzle/schema";
import { estimateAfnWholeFromStoredUsd } from "@/lib/fx-afn-usd";
import { db } from "@/lib/db";

export type OrderDetailLine = {
  lineIndex: number;
  productName: string | null;
  quantity: number;
  unitSalePrice: string;
  lineValue: string;
  /** Derived from USD + `afn_per_usd_snapshot`; null if snapshot missing. */
  unitSalePriceAfn: string | null;
  lineValueAfn: string | null;
};

export type OrderDetail = {
  id: string;
  contactId: string;
  phone: string;
  ctwaSessionId: string | null;
  ctwaClid: string | null;
  manualMetaCampaignId: string | null;
  manualCampaignName: string | null;
  deliveryProvinceAfghanistan: string | null;
  deliveryTrackingNumber: string | null;
  value: string;
  currency: string;
  status: string;
  /** Last successful primary or resend Purchase `event_id` sent to Meta. */
  capiEventId: string | null;
  /** FX snapshot used when converting AFN courier inputs on edit (same as create-time rate when present). */
  afnPerUsdSnapshot: string | null;
  deliveryCost: string;
  /** Derived from `delivery_cost` USD + snapshot */
  deliveryCostAfn: string | null;
  /** Derived from merchandise `value` USD + snapshot */
  valueAfn: string | null;
  capiSent: boolean;
  /** Checkout / Meta wall clock from form (Asia/Kabul). */
  orderEventAt: Date;
  /** Database row insert time. */
  createdAt: Date;
  lines: OrderDetailLine[];
};

function fmtEst(n: number | null): string | null {
  return n == null ? null : String(n);
}

export async function loadOrderDetail(orderId: string) {
  const [orderRow] = await db
    .select({
      id: orders.id,
      contactId: orders.contactId,
      phone: contacts.phoneNumber,
      ctwaSessionId: orders.ctwaSessionId,
      ctwaClid: ctwaSessions.ctwaClid,
      manualMetaCampaignId: orders.manualMetaCampaignId,
      manualCampaignName: metaCampaigns.name,
      deliveryProvinceAfghanistan: orders.deliveryProvinceAfghanistan,
      deliveryTrackingNumber: orders.deliveryTrackingNumber,
      value: orders.value,
      currency: orders.currency,
      status: orders.status,
      deliveryCost: orders.deliveryCost,
      afnPerUsdSnapshot: orders.afnPerUsdSnapshot,
      capiSent: orders.capiSent,
      capiEventId: orders.capiEventId,
      orderEventAt: orders.orderEventAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(contacts, eq(orders.contactId, contacts.id))
    .leftJoin(ctwaSessions, eq(orders.ctwaSessionId, ctwaSessions.id))
    .leftJoin(metaCampaigns, eq(orders.manualMetaCampaignId, metaCampaigns.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) return null;

  const snap = orderRow.afnPerUsdSnapshot;

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
    ctwaSessionId: orderRow.ctwaSessionId,
    ctwaClid: orderRow.ctwaClid,
    manualMetaCampaignId: orderRow.manualMetaCampaignId,
    manualCampaignName: orderRow.manualCampaignName,
    deliveryProvinceAfghanistan: orderRow.deliveryProvinceAfghanistan,
    deliveryTrackingNumber: orderRow.deliveryTrackingNumber,
    value: String(orderRow.value),
    currency: orderRow.currency,
    status: orderRow.status,
    capiEventId: orderRow.capiEventId ?? null,
    afnPerUsdSnapshot:
      typeof orderRow.afnPerUsdSnapshot === "string"
        ? orderRow.afnPerUsdSnapshot.trim()
        : orderRow.afnPerUsdSnapshot != null
          ? String(orderRow.afnPerUsdSnapshot).trim()
          : null,
    deliveryCost: String(orderRow.deliveryCost),
    deliveryCostAfn: fmtEst(
      estimateAfnWholeFromStoredUsd(Number(orderRow.deliveryCost), snap),
    ),
    valueAfn: fmtEst(
      estimateAfnWholeFromStoredUsd(Number(orderRow.value), snap),
    ),
    capiSent: orderRow.capiSent,
    orderEventAt: orderRow.orderEventAt,
    createdAt: orderRow.createdAt,
    lines: lines.map((l) => {
      const unitUsd = Number(l.unitSalePrice);
      const lineUsd = Number(l.lineValue);
      return {
        lineIndex: l.lineIndex,
        productName: l.productName,
        quantity: l.quantity,
        unitSalePrice: String(l.unitSalePrice),
        lineValue: String(l.lineValue),
        unitSalePriceAfn: fmtEst(
          estimateAfnWholeFromStoredUsd(unitUsd, snap),
        ),
        lineValueAfn: fmtEst(estimateAfnWholeFromStoredUsd(lineUsd, snap)),
      };
    }),
  };

  return detail;
}
