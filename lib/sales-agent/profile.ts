import { conversationProfiles } from "@/drizzle/schema";
import { db } from "@/lib/db";

/** Ensure one profile row per conversation (idempotent). */
export async function ensureConversationProfile(
  conversationId: string,
): Promise<void> {
  await db
    .insert(conversationProfiles)
    .values({ conversationId })
    .onConflictDoNothing({
      target: conversationProfiles.conversationId,
    });
}
