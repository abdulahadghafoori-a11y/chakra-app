import {
  afnAmountToUsd2,
  roundAfnWhole,
  roundUsd2,
} from "@/lib/fx-afn-usd";

export type ProductRowForPricing = {
  id: string;
  sku: string;
  name: string;
  /** USD COGS in catalog */
  cogs: unknown;
};

export type ResolvedUsdOrderLine<P extends ProductRowForPricing> = {
  product: P;
  quantity: number;
  /** Stored on order_items.unit_sale_price (USD, 2dp) */
  unitUsd: number;
  /** Stored on order_items.line_value (USD, 2dp) */
  lineUsd: number;
};

/**
 * Converts /orders/new form lines — whole AFN unit prices —
 * into USD totals used for Postgres + Meta CAPI. AFN is not persisted on line rows;
 * `orders.afn_per_usd_snapshot` + USD allows reconstructing approximate AFN for display.
 */
export function convertOrderFormLinesFromAfn<P extends ProductRowForPricing>(
  lines: Array<{
    productId: string;
    unitSalePrice: number;
    quantity: number;
  }>,
  productById: Map<string, P>,
  afnPerOneUsd: number,
):
  | { ok: false; error: string }
  | {
      ok: true;
      resolved: ResolvedUsdOrderLine<P>[];
      orderTotalUsd: number;
    } {
  const resolved: ResolvedUsdOrderLine<P>[] = [];
  for (const line of lines) {
    const product = productById.get(line.productId);
    if (!product) {
      return { ok: false, error: "One or more products were not found." };
    }

    const unitAfn = roundAfnWhole(line.unitSalePrice);

    const unitUsd = afnAmountToUsd2(unitAfn, afnPerOneUsd);
    if (!(unitUsd > 0)) {
      return {
        ok: false,
        error:
          "Each line needs a valid unit sale price in AFN (converted to a positive USD amount). Check the FX rate.",
      };
    }

    const lineUsd = roundUsd2(unitUsd * line.quantity);
    if (!(lineUsd > 0)) {
      return {
        ok: false,
        error: "Line total in USD rounded to zero. Increase AFN amounts.",
      };
    }

    resolved.push({
      product,
      quantity: line.quantity,
      unitUsd,
      lineUsd,
    });
  }

  const orderTotalUsd = roundUsd2(
    resolved.reduce((s, r) => s + r.lineUsd, 0),
  );

  return { ok: true, resolved, orderTotalUsd };
}
