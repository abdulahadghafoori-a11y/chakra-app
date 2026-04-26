import { asc, eq, ilike, or } from "drizzle-orm";

import { products } from "@/drizzle/schema";
import { db } from "@/lib/db";

/** Strip ILIKE wildcards from user text so the pattern stays bounded. */
function sanitizeSearchToken(s: string): string {
  return s.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
}

function formatUsd(amount: string | null | undefined): string {
  if (amount == null || amount === "") return "";
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

export type ProductSearchHit = {
  id: string;
  name: string;
  sku: string;
  priceUsd: string;
  description: string | null;
};

export async function executeSearchProducts(
  query: string,
  limit = 10,
): Promise<ProductSearchHit[]> {
  const q = sanitizeSearchToken(query?.trim() ?? "");
  if (!q) return [];

  const pattern = `%${q}%`;

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      defaultSalePrice: products.defaultSalePrice,
      description: products.description,
    })
    .from(products)
    .where(
      or(
        ilike(products.name, pattern),
        ilike(products.sku, pattern),
        ilike(products.description, pattern),
      ),
    )
    .orderBy(asc(products.name))
    .limit(Math.min(Math.max(limit, 1), 25));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    priceUsd: formatUsd(r.defaultSalePrice),
    description: r.description ?? null,
  }));
}

export async function executeGetProduct(
  productId: string,
): Promise<ProductSearchHit | null> {
  const id = productId?.trim() ?? "";
  if (!id) return null;

  const [row] = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      defaultSalePrice: products.defaultSalePrice,
      description: products.description,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    priceUsd: formatUsd(row.defaultSalePrice),
    description: row.description ?? null,
  };
}

/** Run SQL tool from OpenAI function name + parsed args. */
export async function runProductToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (name === "search_products") {
    const query = typeof args.query === "string" ? args.query : "";
    const hits = await executeSearchProducts(query);
    return JSON.stringify({ products: hits });
  }
  if (name === "get_product") {
    const productId = typeof args.product_id === "string" ? args.product_id : "";
    const p = await executeGetProduct(productId);
    return JSON.stringify(p ? { product: p } : { error: "not_found" });
  }
  return JSON.stringify({ error: "unknown_tool", name });
}
