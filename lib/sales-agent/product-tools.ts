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

function hasExtendedKnowledge(row: {
  knowledgeNotes: string | null;
  faqJson: unknown;
  specsJson: Record<string, unknown>;
}): boolean {
  if (row.knowledgeNotes?.trim()) return true;
  if (Array.isArray(row.faqJson) && row.faqJson.length > 0) return true;
  return Object.keys(row.specsJson ?? {}).length > 0;
}

export type ProductSearchHit = {
  id: string;
  name: string;
  sku: string;
  priceUsd: string;
  description: string | null;
  has_extended_knowledge: boolean;
  knowledge_excerpt: string | null;
};

export type ProductDetailHit = ProductSearchHit & {
  specs_json: Record<string, unknown>;
  faq_json: unknown[];
  knowledge_notes: string | null;
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
      knowledgeNotes: products.knowledgeNotes,
      faqJson: products.faqJson,
      specsJson: products.specsJson,
    })
    .from(products)
    .where(
      or(
        ilike(products.name, pattern),
        ilike(products.sku, pattern),
        ilike(products.description, pattern),
        ilike(products.knowledgeNotes, pattern),
      ),
    )
    .orderBy(asc(products.name))
    .limit(Math.min(Math.max(limit, 1), 25));

  return rows.map((r) => {
    const ext = hasExtendedKnowledge({
      knowledgeNotes: r.knowledgeNotes,
      faqJson: r.faqJson,
      specsJson: r.specsJson as Record<string, unknown>,
    });
    const kn = r.knowledgeNotes?.trim() ?? "";
    const excerpt =
      kn.length > 220 ? `${kn.slice(0, 220)}…` : kn.length ? kn : null;
    return {
      id: r.id,
      name: r.name,
      sku: r.sku,
      priceUsd: formatUsd(r.defaultSalePrice),
      description: r.description ?? null,
      has_extended_knowledge: ext,
      knowledge_excerpt: excerpt,
    };
  });
}

export async function executeGetProduct(
  productId: string,
): Promise<ProductDetailHit | null> {
  const id = productId?.trim() ?? "";
  if (!id) return null;

  const [row] = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      defaultSalePrice: products.defaultSalePrice,
      description: products.description,
      specsJson: products.specsJson,
      faqJson: products.faqJson,
      knowledgeNotes: products.knowledgeNotes,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!row) return null;

  const specs = (row.specsJson ?? {}) as Record<string, unknown>;
  const faq = Array.isArray(row.faqJson) ? row.faqJson : [];

  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    priceUsd: formatUsd(row.defaultSalePrice),
    description: row.description ?? null,
    has_extended_knowledge: hasExtendedKnowledge({
      knowledgeNotes: row.knowledgeNotes,
      faqJson: faq,
      specsJson: specs,
    }),
    knowledge_excerpt: row.knowledgeNotes?.trim()
      ? row.knowledgeNotes.length > 220
        ? `${row.knowledgeNotes.slice(0, 220)}…`
        : row.knowledgeNotes
      : null,
    specs_json: specs,
    faq_json: faq,
    knowledge_notes: row.knowledgeNotes?.trim() ? row.knowledgeNotes : null,
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
