"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { conversations } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { FULL_FEATURE_UNAVAILABLE, isCoreFeatureSet } from "@/lib/feature-set";
import { assertStaffSession } from "@/lib/staff-auth/guard";

function revalidateSales(conversationId: string) {
  revalidatePath("/sales");
  revalidatePath(`/sales/${conversationId}`);
}

export async function salesMarkHandoff(formData: FormData) {
  await assertStaffSession();
  if (isCoreFeatureSet()) throw new Error(FULL_FEATURE_UNAVAILABLE);
  const conversationId = String(formData.get("conversationId") ?? "");
  const reason = String(formData.get("reason") ?? "manual_handoff");
  if (!conversationId) throw new Error("Missing conversation id");

  await db
    .update(conversations)
    .set({
      status: "handoff",
      stage: "handoff",
      handoffReason: reason.slice(0, 500),
      handoffAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  revalidateSales(conversationId);
}

export async function salesMarkClosed(formData: FormData) {
  await assertStaffSession();
  if (isCoreFeatureSet()) throw new Error(FULL_FEATURE_UNAVAILABLE);
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) throw new Error("Missing conversation id");

  await db
    .update(conversations)
    .set({ stage: "closed" })
    .where(eq(conversations.id, conversationId));

  revalidateSales(conversationId);
}

export async function salesResumeBot(formData: FormData) {
  await assertStaffSession();
  if (isCoreFeatureSet()) throw new Error(FULL_FEATURE_UNAVAILABLE);
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) throw new Error("Missing conversation id");

  await db
    .update(conversations)
    .set({
      status: "bot",
      stage: "discovering",
      handoffReason: null,
      handoffAt: null,
    })
    .where(eq(conversations.id, conversationId));

  revalidateSales(conversationId);
}
