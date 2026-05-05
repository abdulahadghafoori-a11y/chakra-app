"use server";

import { revalidatePath } from "next/cache";

import {
  deleteFacebookComment,
  deleteInstagramComment,
  hideInstagramComment,
  replyToFacebookComment,
  replyToInstagramComment,
  setFacebookCommentHidden,
} from "@/lib/meta-graph-engagement";
import { suggestPublicCommentReply } from "@/lib/meta-comment-suggest-ai";
import {
  getEngagementCommentById,
  insertCommentAction,
  patchEngagementCommentStatusById,
  type EngagementPlatform,
} from "@/lib/meta-engagement-store";
import { requireStaffSession } from "@/lib/staff-auth/guard";

export type MetaEngagementActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function isPlatform(p: string): p is EngagementPlatform {
  return p === "facebook" || p === "instagram";
}

async function audit(
  commentId: string,
  action: string,
  detail: Record<string, unknown>,
  staffEmail: string,
) {
  await insertCommentAction({
    commentId,
    action,
    detail: { ...detail, staffEmail },
  });
}

export async function replyMetaCommentAction(
  commentId: string,
  message: string,
): Promise<MetaEngagementActionResult> {
  let staffEmail: string;
  try {
    ({ email: staffEmail } = await requireStaffSession());
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, error: "Reply text is required." };
  }

  const row = await getEngagementCommentById(commentId);
  if (!row) return { ok: false, error: "Comment not found." };
  if (row.status === "deleted") {
    return { ok: false, error: "Comment was deleted." };
  }
  if (!isPlatform(row.platform)) {
    return { ok: false, error: "Invalid platform." };
  }

  try {
    if (row.platform === "facebook") {
      await replyToFacebookComment(row.externalCommentId, trimmed);
    } else {
      await replyToInstagramComment(row.externalCommentId, trimmed);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Graph API error";
    return { ok: false, error: msg };
  }

  await audit(commentId, "reply", { messagePreview: trimmed.slice(0, 500) }, staffEmail);
  revalidatePath("/meta-engagement");
  return { ok: true };
}

export async function hideMetaCommentAction(
  commentId: string,
): Promise<MetaEngagementActionResult> {
  let staffEmail: string;
  try {
    ({ email: staffEmail } = await requireStaffSession());
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const row = await getEngagementCommentById(commentId);
  if (!row) return { ok: false, error: "Comment not found." };
  if (row.status === "deleted") {
    return { ok: false, error: "Comment was deleted." };
  }
  if (!isPlatform(row.platform)) {
    return { ok: false, error: "Invalid platform." };
  }

  try {
    if (row.platform === "facebook") {
      await setFacebookCommentHidden(row.externalCommentId, true);
    } else {
      await hideInstagramComment(row.externalCommentId);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Graph API error";
    return { ok: false, error: msg };
  }

  await patchEngagementCommentStatusById(commentId, "hidden");
  await audit(commentId, "hide", {}, staffEmail);
  revalidatePath("/meta-engagement");
  return { ok: true };
}

export async function unhideMetaCommentAction(
  commentId: string,
): Promise<MetaEngagementActionResult> {
  let staffEmail: string;
  try {
    ({ email: staffEmail } = await requireStaffSession());
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const row = await getEngagementCommentById(commentId);
  if (!row) return { ok: false, error: "Comment not found." };
  if (row.status === "deleted") {
    return { ok: false, error: "Comment was deleted." };
  }
  if (row.platform !== "facebook") {
    return {
      ok: false,
      error: "Unhide is only supported for Facebook Page comments in this app.",
    };
  }

  try {
    await setFacebookCommentHidden(row.externalCommentId, false);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Graph API error";
    return { ok: false, error: msg };
  }

  await patchEngagementCommentStatusById(commentId, "active");
  await audit(commentId, "unhide", {}, staffEmail);
  revalidatePath("/meta-engagement");
  return { ok: true };
}

export async function deleteMetaCommentAction(
  commentId: string,
): Promise<MetaEngagementActionResult> {
  let staffEmail: string;
  try {
    ({ email: staffEmail } = await requireStaffSession());
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const row = await getEngagementCommentById(commentId);
  if (!row) return { ok: false, error: "Comment not found." };
  if (!isPlatform(row.platform)) {
    return { ok: false, error: "Invalid platform." };
  }

  try {
    if (row.platform === "facebook") {
      await deleteFacebookComment(row.externalCommentId);
    } else {
      await deleteInstagramComment(row.externalCommentId);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Graph API error";
    return { ok: false, error: msg };
  }

  await patchEngagementCommentStatusById(commentId, "deleted");
  await audit(commentId, "delete", {}, staffEmail);
  revalidatePath("/meta-engagement");
  return { ok: true };
}

export async function suggestMetaCommentReplyAction(
  commentId: string,
): Promise<MetaEngagementActionResult<{ draft: string; model: string }>> {
  try {
    await requireStaffSession();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const row = await getEngagementCommentById(commentId);
  if (!row) return { ok: false, error: "Comment not found." };
  if (row.status === "deleted") {
    return { ok: false, error: "Comment was deleted." };
  }
  if (!isPlatform(row.platform)) {
    return { ok: false, error: "Invalid platform." };
  }

  const commentText = row.messageText?.trim() ?? "";
  if (!commentText) {
    return { ok: false, error: "No comment text to respond to." };
  }

  try {
    const brand =
      process.env.META_COMMENT_SUGGEST_BRAND?.trim() ||
      process.env.SALES_AGENT_BRAND_NAME?.trim();
    const { text, model } = await suggestPublicCommentReply({
      platform: row.platform,
      commentText,
      authorName: row.authorName,
      brandName: brand,
    });
    return { ok: true, data: { draft: text, model } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Suggestion failed";
    return { ok: false, error: msg };
  }
}
