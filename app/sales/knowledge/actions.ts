"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { businessKnowledge } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { FULL_FEATURE_UNAVAILABLE, isCoreFeatureSet } from "@/lib/feature-set";
import { assertStaffSession } from "@/lib/staff-auth/guard";

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function upsertBusinessKnowledgeArticle(formData: FormData) {
  await assertStaffSession();
  if (isCoreFeatureSet()) throw new Error(FULL_FEATURE_UNAVAILABLE);

  const slugRaw = String(formData.get("slug") ?? "");
  const slug = slugify(slugRaw);
  if (!slug) throw new Error("Invalid slug");

  const title = String(formData.get("title") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Body is required");

  const sortOrder = Math.max(
    0,
    Number.parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0,
  );

  const existing = await db
    .select({ id: businessKnowledge.id })
    .from(businessKnowledge)
    .where(eq(businessKnowledge.slug, slug))
    .limit(1);

  if (existing.length) {
    await db
      .update(businessKnowledge)
      .set({ title, body, sortOrder })
      .where(eq(businessKnowledge.slug, slug));
  } else {
    await db.insert(businessKnowledge).values({
      slug,
      title,
      body,
      sortOrder,
    });
  }

  revalidatePath("/sales/knowledge");
  revalidatePath(`/sales/knowledge/${slug}`);
}

export async function deleteBusinessKnowledgeArticle(formData: FormData) {
  await assertStaffSession();
  if (isCoreFeatureSet()) throw new Error(FULL_FEATURE_UNAVAILABLE);
  const slug = slugify(String(formData.get("slug") ?? ""));
  if (!slug) throw new Error("Invalid slug");

  await db.delete(businessKnowledge).where(eq(businessKnowledge.slug, slug));
  revalidatePath("/sales/knowledge");
}
