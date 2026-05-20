import { asc, count, eq, ilike, or } from "drizzle-orm";

import { businessKnowledge } from "@/drizzle/schema";
import { db } from "@/lib/db";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  resolveTablePage,
} from "@/lib/table-pagination";

/** Map tool topic aliases to `business_knowledge.slug`; unknown ASCII slugs pass through sanitized. */
export function normalizeKnowledgeSlug(raw: string): string {
  const t = raw?.trim().toLowerCase() ?? "";
  if (t === "payment" || t === "cod" || t === "پرداخت") return "payment";
  if (t === "shipping" || t === "delivery" || t === "ارسال") return "shipping";
  if (t === "warranty" || t === "ضمانت") return "warranty";
  if (t === "returns" || t === "refund" || t === "مرجوعی") return "returns";
  if (t === "" || t === "general") return "general";

  const ascii = t
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return ascii || "general";
}

export async function getBusinessArticleBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(businessKnowledge)
    .where(eq(businessKnowledge.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function listBusinessKnowledgeSummaries() {
  return db
    .select({
      slug: businessKnowledge.slug,
      title: businessKnowledge.title,
      sortOrder: businessKnowledge.sortOrder,
    })
    .from(businessKnowledge)
    .orderBy(asc(businessKnowledge.sortOrder), asc(businessKnowledge.slug));
}

export async function listBusinessKnowledgeSummariesPage(input: {
  page: number;
  pageSize?: number;
}) {
  const pageSize = Math.min(
    Math.max(1, input.pageSize ?? DEFAULT_TABLE_PAGE_SIZE),
    100,
  );
  const [countRow] = await db
    .select({ n: count() })
    .from(businessKnowledge);
  const total = Number(countRow?.n ?? 0);
  const { page, offset } = resolveTablePage({
    requestedPage: input.page,
    total,
    pageSize,
  });
  const rows = await db
    .select({
      slug: businessKnowledge.slug,
      title: businessKnowledge.title,
      sortOrder: businessKnowledge.sortOrder,
    })
    .from(businessKnowledge)
    .orderBy(asc(businessKnowledge.sortOrder), asc(businessKnowledge.slug))
    .limit(pageSize)
    .offset(offset);
  return { rows, total, page };
}

function sanitizeIlike(s: string): string {
  return s.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchBusinessKnowledge(query: string, limit = 6) {
  const q = sanitizeIlike(query ?? "");
  if (!q) return [];
  const pattern = `%${q}%`;
  return db
    .select({
      slug: businessKnowledge.slug,
      title: businessKnowledge.title,
      body: businessKnowledge.body,
    })
    .from(businessKnowledge)
    .where(
      or(
        ilike(businessKnowledge.slug, pattern),
        ilike(businessKnowledge.title, pattern),
        ilike(businessKnowledge.body, pattern),
      ),
    )
    .orderBy(asc(businessKnowledge.sortOrder))
    .limit(Math.min(Math.max(limit, 1), 15));
}
