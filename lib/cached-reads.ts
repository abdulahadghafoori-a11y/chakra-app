import { unstable_cache } from "next/cache";

import { listProducts, type ProductRow } from "@/actions/products";
import {
  getPublicFxStateForOrderForm,
  type PublicFxState,
} from "@/lib/app-fx-usd-afn";

const PRODUCTS_TAG = "products-catalog";
const FX_TAG = "app-fx-usd-afn";

export async function getCachedProductsForOrderForm(): Promise<ProductRow[]> {
  return unstable_cache(
    async () => listProducts(),
    ["products-for-order-form"],
    { revalidate: 60, tags: [PRODUCTS_TAG] },
  )();
}

export async function getCachedPublicFxForOrderForm(): Promise<PublicFxState | null> {
  return unstable_cache(
    async () => getPublicFxStateForOrderForm(),
    ["public-fx-for-order-form"],
    { revalidate: 30, tags: [FX_TAG] },
  )();
}
