"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { z } from "zod";

import { products } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { assertStaffSession } from "@/lib/staff-auth/guard";

export type ProductRow = {
  id: string;
  name: string;
  sku: string;
  defaultSalePrice: string;
  cogs: string;
  description: string | null;
  createdAt: string;
};

function parseJsonObject(raw: string | undefined): Record<string, unknown> {
  const s = raw?.trim() ?? "";
  if (!s) return {};
  const parsed = JSON.parse(s) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("specs_json must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function parseJsonArray(raw: string | undefined): unknown[] {
  const s = raw?.trim() ?? "";
  if (!s) return [];
  const parsed = JSON.parse(s) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("faq_json must be a JSON array");
  }
  return parsed;
}

const createProductSchema = z.object({
  name: z.string().min(1),
  defaultSalePrice: z.number().positive(),
  cogs: z.number().nonnegative(),
  description: z.string().optional(),
  knowledgeNotes: z.string().optional(),
  specsJsonText: z.string().optional(),
  faqJsonText: z.string().optional(),
});

const updateAgentSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  knowledgeNotes: z.string(),
  specsJsonText: z.string(),
  faqJsonText: z.string(),
});

function generateSku(): string {
  return `PRD-${nanoid(12)}`;
}

function isPostgresUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}

export async function listProducts(): Promise<ProductRow[]> {
  const rows = await db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt));

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    defaultSalePrice: String(p.defaultSalePrice),
    cogs: String(p.cogs),
    description: p.description,
    createdAt: p.createdAt.toISOString(),
  }));
}

export async function createProduct(
  input: z.infer<typeof createProductSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const {
    name,
    defaultSalePrice,
    cogs,
    description,
    knowledgeNotes,
    specsJsonText,
    faqJsonText,
  } = parsed.data;

  let specsJson: Record<string, unknown> = {};
  let faqJson: unknown[] = [];
  try {
    specsJson = parseJsonObject(specsJsonText);
    faqJson = parseJsonArray(faqJsonText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    return { ok: false, error: msg };
  }

  const values = {
    name,
    defaultSalePrice: String(defaultSalePrice),
    cogs: String(cogs),
    description: description?.trim() ? description : null,
    knowledgeNotes: knowledgeNotes?.trim() ? knowledgeNotes.trim() : null,
    specsJson,
    faqJson,
  };

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await db.insert(products).values({
        ...values,
        sku: generateSku(),
      });
      break;
    } catch (e) {
      if (isPostgresUniqueViolation(e) && attempt < 7) {
        continue;
      }
      console.error(e);
      return {
        ok: false,
        error: "Could not create product. Try again.",
      };
    }
  }

  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath("/products");
  revalidatePath("/orders/new");
  return { ok: true };
}

export async function getProductAgentFields(productId: string) {
  await assertStaffSession();
  const id = productId.trim();
  if (!z.string().uuid().safeParse(id).success) return null;
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    description: row.description,
    knowledgeNotes: row.knowledgeNotes,
    specsJson: row.specsJson as Record<string, unknown>,
    faqJson: row.faqJson as unknown[],
  };
}

export async function updateProductAgentFields(
  input: z.infer<typeof updateAgentSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertStaffSession();
  const parsed = updateAgentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let specsJson: Record<string, unknown>;
  let faqJson: unknown[];
  try {
    specsJson = parseJsonObject(parsed.data.specsJsonText);
    faqJson = parseJsonArray(parsed.data.faqJsonText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    return { ok: false, error: msg };
  }

  await db
    .update(products)
    .set({
      description: parsed.data.description.trim() || null,
      knowledgeNotes: parsed.data.knowledgeNotes.trim() || null,
      specsJson,
      faqJson,
    })
    .where(eq(products.id, parsed.data.id));

  revalidatePath("/products");
  revalidatePath(`/products/${parsed.data.id}/agent`);
  return { ok: true };
}

export async function saveProductAgentForm(formData: FormData): Promise<void> {
  const result = await updateProductAgentFields({
    id: String(formData.get("id") ?? ""),
    description: String(formData.get("description") ?? ""),
    knowledgeNotes: String(formData.get("knowledge_notes") ?? ""),
    specsJsonText: String(formData.get("specs_json") ?? ""),
    faqJsonText: String(formData.get("faq_json") ?? ""),
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
}
