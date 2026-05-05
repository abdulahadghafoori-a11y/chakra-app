import { composeDmBridgeReply } from "@/lib/dm-bridge-ai";
import {
  claimDmBridgeSend,
  insertDmBridgeLog,
  patchEngagementCommentStatus,
  rollbackDmBridgeClaim,
  upsertEngagementComment,
} from "@/lib/meta-engagement-store";
import { sendInstagramDmText, sendMessengerText } from "@/lib/meta-messenger-send";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function dmBridgeEnabled(): boolean {
  const explicit = process.env.DM_BRIDGE_ENABLED?.trim().toLowerCase();
  if (explicit === "false" || explicit === "0" || explicit === "no") {
    return false;
  }
  if (explicit === "true" || explicit === "1" || explicit === "yes") {
    return true;
  }
  return Boolean(process.env.WHATSAPP_REDIRECT_URL?.trim());
}

function dmBridgeDebug(): boolean {
  const v = process.env.META_WEBHOOK_DEBUG?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Flatten `messages` webhook `change.value` (Graph shape varies by product).
 */
export function extractMessagingEnvelopesFromMessagesChangeValue(
  raw: unknown,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const push = (v: unknown) => {
    const r = asRecord(v);
    if (r) out.push(r);
  };

  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
    return out;
  }

  const value = asRecord(raw);
  if (!value) return out;

  for (const x of Array.isArray(value.messaging) ? value.messaging : []) push(x);

  if (asRecord(value.sender) && asRecord(value.message)) {
    push({
      sender: value.sender,
      recipient: value.recipient,
      timestamp: value.timestamp,
      message: value.message,
    });
  }

  for (const ent of Array.isArray(value.entry) ? value.entry : []) {
    const e = asRecord(ent);
    if (!e) continue;
    for (const x of Array.isArray(e.messaging) ? e.messaging : []) push(x);
  }

  for (const x of Array.isArray(value.data) ? value.data : []) push(x);
  for (const x of Array.isArray(value.events) ? value.events : []) push(x);
  for (const x of Array.isArray(value.items) ? value.items : []) push(x);

  return out;
}

/**
 * Instagram Direct (`object: "instagram"`): combine envelopes from `entry.messaging`,
 * `entry.standby`, and `entry.changes` where `field === "messages"` (Meta uses multiple shapes).
 * IG comments use `changes` with `field === "comments"` only — not handled here.
 */
export function collectInstagramDmEnvelopesFromEntry(
  entry: Record<string, unknown>,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const push = (v: unknown) => {
    const r = asRecord(v);
    if (r) out.push(r);
  };

  for (const x of Array.isArray(entry.messaging) ? entry.messaging : []) push(x);
  for (const x of Array.isArray(entry.standby) ? entry.standby : []) push(x);

  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  for (const ch of changes) {
    const c = asRecord(ch);
    if (!c || str(c.field) !== "messages") continue;
    out.push(...extractMessagingEnvelopesFromMessagesChangeValue(c.value));
  }

  return out;
}

/** Facebook Page `feed` subscription — comment lifecycle. */
export async function handleFacebookFeedChange(
  pageId: string,
  change: Record<string, unknown>,
): Promise<void> {
  const field = str(change.field);
  if (field !== "feed") return;

  const value = asRecord(change.value);
  if (!value) return;

  const commentId = str(value.comment_id);
  if (!commentId) return;

  const verb = str(value.verb) ?? "add";

  const postObj = asRecord(value.post);
  const postId =
    str(value.post_id) ?? (postObj ? str(postObj.id) : null) ?? "";

  if (!postId) return;

  const from = asRecord(value.from);
  const authorId = from ? str(from.id) : null;
  const authorName = from ? str(from.name) : null;
  const message = str(value.message);
  const parentCommentId = str(value.parent_id);

  if (verb === "remove") {
    await patchEngagementCommentStatus("facebook", commentId, "deleted");
    return;
  }

  let status: "active" | "hidden" = "active";
  if (verb === "hide") status = "hidden";
  if (verb === "unhide") status = "active";

  await upsertEngagementComment({
    platform: "facebook",
    externalCommentId: commentId,
    parentExternalCommentId: parentCommentId,
    parentPostId: postId,
    containerId: pageId,
    authorExternalId: authorId,
    authorName,
    messageText: message,
    permalinkUrl: str(value.comment_url) ?? str(value.permalink_url),
    status,
    rawPayload: change,
  });
}

/** Instagram `comments` subscription. */
export async function handleInstagramCommentChange(
  igAccountId: string,
  change: Record<string, unknown>,
): Promise<void> {
  const field = str(change.field);
  if (field !== "comments") return;

  const value = asRecord(change.value);
  if (!value) return;

  const commentId = str(value.id);
  if (!commentId) return;

  const media = asRecord(value.media);
  const mediaId = media ? str(media.id) : str(value.media_id);
  const parentId = str(value.parent_id);

  const text = str(value.text);
  const from = asRecord(value.from);

  await upsertEngagementComment({
    platform: "instagram",
    externalCommentId: commentId,
    parentExternalCommentId: parentId,
    parentPostId: mediaId ?? commentId,
    containerId: igAccountId,
    authorExternalId: from ? str(from.id) : null,
    authorName: from ? str(from.username) ?? str(from.name) : null,
    messageText: text,
    permalinkUrl: null,
    status: "active",
    rawPayload: change,
  });
}

async function runDmBridge(params: {
  channel: "messenger" | "instagram_dm";
  scopeId: string;
  participantId: string;
  text: string | null;
  rawInbound: unknown;
}): Promise<void> {
  await insertDmBridgeLog({
    channel: params.channel,
    scopeId: params.scopeId,
    participantId: params.participantId,
    direction: "inbound",
    body: params.text,
    model: null,
    raw: params.rawInbound,
  });

  if (!dmBridgeEnabled()) return;

  const claimed = await claimDmBridgeSend({
    channel: params.channel,
    scopeId: params.scopeId,
    participantId: params.participantId,
  });
  if (!claimed) return;

  let outbound: string;
  let model: string | null = null;
  try {
    const brand = process.env.DM_BRIDGE_BRAND_NAME?.trim();
    const composed = await composeDmBridgeReply({
      channel: params.channel,
      userMessage: params.text ?? "",
      brandName: brand,
    });
    outbound = composed.text;
    model = composed.model;
  } catch (e) {
    console.error("[dm-bridge] compose failed", e);
    const url = process.env.WHATSAPP_REDIRECT_URL?.trim() ?? "";
    outbound = url
      ? `Thanks—please message us on WhatsApp for help:\n${url}`
      : "Thanks—please contact us on WhatsApp.";
  }

  try {
    if (params.channel === "messenger") {
      await sendMessengerText(params.participantId, outbound);
    } else {
      await sendInstagramDmText(params.participantId, outbound);
    }
    await insertDmBridgeLog({
      channel: params.channel,
      scopeId: params.scopeId,
      participantId: params.participantId,
      direction: "outbound",
      body: outbound,
      model,
      raw: null,
    });
  } catch (e) {
    console.error("[dm-bridge] send failed", e);
    await rollbackDmBridgeClaim({
      channel: params.channel,
      scopeId: params.scopeId,
      participantId: params.participantId,
    });
  }
}

export async function handleMessengerEvent(
  pageId: string,
  messaging: Record<string, unknown>,
): Promise<void> {
  if (
    dmBridgeDebug() &&
    str(messaging.messaging_product)?.toLowerCase() === "instagram"
  ) {
    console.warn(
      '[messenger] Page webhook had messaging_product=instagram — IG Direct belongs on object "instagram"; still treating envelope as Messenger.',
    );
  }

  const message = asRecord(messaging.message);
  if (!message) {
    if (dmBridgeDebug()) {
      console.log(
        "[messenger] skipped envelope — no `message` object (dashboard tests often send template/other shapes):",
        Object.keys(messaging),
      );
    }
    return;
  }

  if (message.is_echo === true) return;

  const sender = asRecord(messaging.sender);
  const senderId = sender ? str(sender.id) : null;
  if (!senderId) {
    if (dmBridgeDebug()) {
      console.log("[messenger] skipped — missing sender.id");
    }
    return;
  }

  const text =
    str(message.text) ??
    (typeof message.quick_reply === "object"
      ? str(asRecord(message.quick_reply)?.payload)
      : null);

  await runDmBridge({
    channel: "messenger",
    scopeId: pageId,
    participantId: senderId,
    text,
    rawInbound: messaging,
  });
}

export async function handleInstagramMessagingEvent(
  igAccountId: string,
  messaging: Record<string, unknown>,
): Promise<void> {
  const message = asRecord(messaging.message);
  if (!message) {
    if (dmBridgeDebug()) {
      console.log(
        "[instagram dm] skipped envelope — no `message` (reactions/read/postback only?):",
        Object.keys(messaging),
      );
    }
    return;
  }
  if (message.is_echo === true) return;

  const sender = asRecord(messaging.sender);
  const senderId = sender ? str(sender.id) : null;
  if (!senderId) {
    if (dmBridgeDebug()) {
      console.log("[instagram dm] skipped — missing sender.id");
    }
    return;
  }

  const text =
    str(message.text) ??
    (typeof message.quick_reply === "object"
      ? str(asRecord(message.quick_reply)?.payload)
      : null);

  await runDmBridge({
    channel: "instagram_dm",
    scopeId: igAccountId,
    participantId: senderId,
    text,
    rawInbound: messaging,
  });
}
