import { and, desc, eq, sql } from "drizzle-orm";

import {
  metaDmBridgeLogs,
  metaDmBridgeThreads,
  metaEngagementCommentActions,
  metaEngagementComments,
} from "@/drizzle/schema";
import { db } from "@/lib/db";

export type EngagementPlatform = "facebook" | "instagram";

export async function upsertEngagementComment(row: {
  platform: EngagementPlatform;
  externalCommentId: string;
  parentExternalCommentId: string | null;
  parentPostId: string;
  containerId: string;
  authorExternalId: string | null;
  authorName: string | null;
  messageText: string | null;
  permalinkUrl: string | null;
  status: "active" | "hidden" | "deleted";
  rawPayload: unknown;
}): Promise<void> {
  await db
    .insert(metaEngagementComments)
    .values({
      platform: row.platform,
      externalCommentId: row.externalCommentId,
      parentExternalCommentId: row.parentExternalCommentId,
      parentPostId: row.parentPostId,
      containerId: row.containerId,
      authorExternalId: row.authorExternalId,
      authorName: row.authorName,
      messageText: row.messageText,
      permalinkUrl: row.permalinkUrl,
      status: row.status,
      rawPayload: row.rawPayload as object | null,
    })
    .onConflictDoUpdate({
      target: [
        metaEngagementComments.platform,
        metaEngagementComments.externalCommentId,
      ],
      set: {
        parentExternalCommentId: row.parentExternalCommentId,
        parentPostId: row.parentPostId,
        containerId: row.containerId,
        authorExternalId: row.authorExternalId,
        authorName: row.authorName,
        messageText: row.messageText,
        permalinkUrl: row.permalinkUrl,
        status: row.status,
        rawPayload: row.rawPayload as object | null,
        updatedAt: new Date(),
      },
    });
}

export async function patchEngagementCommentStatus(
  platform: EngagementPlatform,
  externalCommentId: string,
  status: "active" | "hidden" | "deleted",
): Promise<void> {
  await db
    .update(metaEngagementComments)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(metaEngagementComments.platform, platform),
        eq(metaEngagementComments.externalCommentId, externalCommentId),
      ),
    );
}

export async function patchEngagementCommentStatusById(
  commentId: string,
  status: "active" | "hidden" | "deleted",
): Promise<void> {
  await db
    .update(metaEngagementComments)
    .set({ status, updatedAt: new Date() })
    .where(eq(metaEngagementComments.id, commentId));
}

export async function getEngagementCommentById(
  commentId: string,
): Promise<typeof metaEngagementComments.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(metaEngagementComments)
    .where(eq(metaEngagementComments.id, commentId))
    .limit(1);
  return row ?? null;
}

export async function listEngagementComments(opts: {
  limit?: number;
  platform?: EngagementPlatform | "all";
  status?: "active" | "hidden" | "deleted" | "all";
}): Promise<(typeof metaEngagementComments.$inferSelect)[]> {
  const limit = Math.min(Math.max(opts.limit ?? 150, 1), 400);
  const conditions = [];
  if (opts.platform && opts.platform !== "all") {
    conditions.push(eq(metaEngagementComments.platform, opts.platform));
  }
  if (opts.status && opts.status !== "all") {
    conditions.push(eq(metaEngagementComments.status, opts.status));
  }
  const whereClause =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const base = db.select().from(metaEngagementComments);
  return whereClause
    ? base
        .where(whereClause)
        .orderBy(desc(metaEngagementComments.createdAt))
        .limit(limit)
    : base.orderBy(desc(metaEngagementComments.createdAt)).limit(limit);
}

export async function insertCommentAction(row: {
  commentId: string;
  action: string;
  detail?: unknown;
}): Promise<void> {
  await db.insert(metaEngagementCommentActions).values({
    commentId: row.commentId,
    action: row.action,
    detail: row.detail as object | null,
  });
}

export async function listDmBridgeLogs(opts?: {
  limit?: number;
}): Promise<(typeof metaDmBridgeLogs.$inferSelect)[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 400);
  return db
    .select()
    .from(metaDmBridgeLogs)
    .orderBy(desc(metaDmBridgeLogs.createdAt))
    .limit(limit);
}

export async function insertDmBridgeLog(row: {
  channel: "messenger" | "instagram_dm";
  scopeId: string;
  participantId: string;
  direction: "inbound" | "outbound";
  body: string | null;
  model: string | null;
  raw: unknown;
}): Promise<void> {
  await db.insert(metaDmBridgeLogs).values({
    channel: row.channel,
    scopeId: row.scopeId,
    participantId: row.participantId,
    direction: row.direction,
    body: row.body,
    model: row.model,
    raw: row.raw as object | null,
  });
}

/**
 * Claim sending exactly one AI reply per thread: row must exist (insert no-op first),
 * then first updater wins when reply_sent_at IS NULL.
 */
export async function claimDmBridgeSend(params: {
  channel: "messenger" | "instagram_dm";
  scopeId: string;
  participantId: string;
}): Promise<boolean> {
  await db
    .insert(metaDmBridgeThreads)
    .values({
      channel: params.channel,
      scopeId: params.scopeId,
      participantId: params.participantId,
      replySentAt: null,
    })
    .onConflictDoNothing({
      target: [
        metaDmBridgeThreads.channel,
        metaDmBridgeThreads.scopeId,
        metaDmBridgeThreads.participantId,
      ],
    });

  const out = await db
    .update(metaDmBridgeThreads)
    .set({ replySentAt: new Date() })
    .where(
      and(
        eq(metaDmBridgeThreads.channel, params.channel),
        eq(metaDmBridgeThreads.scopeId, params.scopeId),
        eq(metaDmBridgeThreads.participantId, params.participantId),
        sql`${metaDmBridgeThreads.replySentAt} IS NULL`,
      ),
    )
    .returning({ participantId: metaDmBridgeThreads.participantId });

  return out.length > 0;
}

export async function rollbackDmBridgeClaim(params: {
  channel: "messenger" | "instagram_dm";
  scopeId: string;
  participantId: string;
}): Promise<void> {
  await db
    .update(metaDmBridgeThreads)
    .set({ replySentAt: null })
    .where(
      and(
        eq(metaDmBridgeThreads.channel, params.channel),
        eq(metaDmBridgeThreads.scopeId, params.scopeId),
        eq(metaDmBridgeThreads.participantId, params.participantId),
      ),
    );
}
