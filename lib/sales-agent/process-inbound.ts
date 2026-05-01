import { eq } from "drizzle-orm";

import {
  contacts,
  conversationMessages,
  conversations,
  salesAgentInboundComplete,
} from "@/drizzle/schema";
import {
  contactPhoneKeyFromRaw,
  countryFromPhoneDigits,
} from "@/lib/contact-phone";
import { upsertContactByPhone } from "@/lib/contacts";
import { db } from "@/lib/db";
import type { InboundTextMessage } from "@/lib/inbound-text-messages";
import { sendWhatsAppText } from "@/lib/whatsapp-send";

import { HANDOFF_REPLY_DARI, shouldHandOffToHuman } from "./handoff";
import { ensureConversationProfile } from "./profile";
import { runSalesAgentReply } from "./run";

export function isSalesAgentEnabled(): boolean {
  const v = process.env.SALES_AGENT_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When false, the agent still runs and persists replies; Graph send API is not called. */
export function shouldSendWhatsAppReplies(): boolean {
  const v = process.env.SALES_AGENT_SEND_WHATSAPP?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function shouldUpsertContactFromInbound(): boolean {
  const v = process.env.SALES_AGENT_UPSERT_CONTACT?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function markInboundComplete(wamid: string) {
  await db
    .insert(salesAgentInboundComplete)
    .values({ wamid })
    .onConflictDoNothing();
}

async function loadConversationByWaId(waIdDigits: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.waId, waIdDigits))
    .limit(1);
  return row ?? null;
}

async function getOrCreateConversationForInbound(msg: InboundTextMessage) {
  const waIdDigits = msg.waIdDigits;
  let row = await loadConversationByWaId(waIdDigits);

  if (row) {
    if (msg.phoneNumberId && !row.phoneNumberId) {
      await db
        .update(conversations)
        .set({ phoneNumberId: msg.phoneNumberId })
        .where(eq(conversations.id, row.id));
    }
    if (!row.contactId) {
      const [contact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.phoneNumber, waIdDigits))
        .limit(1);
      if (contact) {
        await db
          .update(conversations)
          .set({ contactId: contact.id })
          .where(eq(conversations.id, row.id));
      }
    }
    row = await loadConversationByWaId(waIdDigits);
    if (!row) throw new Error("conversation disappeared after update");
    await ensureConversationProfile(row.id);
    return row;
  }

  let contactId: string | null = null;
  const [linked] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.phoneNumber, waIdDigits))
    .limit(1);
  if (linked) contactId = linked.id;

  if (!contactId && shouldUpsertContactFromInbound() && msg.profileName) {
    const phoneKey = contactPhoneKeyFromRaw(
      waIdDigits.startsWith("+") ? waIdDigits : `+${waIdDigits}`,
    );
    if (phoneKey) {
      const { countryCode, countryName } = countryFromPhoneDigits(phoneKey);
      const c = await upsertContactByPhone({
        phoneNumber: phoneKey,
        name: msg.profileName,
        countryCode,
        countryName,
        createTime: msg.sendTime,
      });
      contactId = c.id;
    }
  }

  const [created] = await db
    .insert(conversations)
    .values({
      waId: waIdDigits,
      phoneNumberId: msg.phoneNumberId,
      contactId,
      status: "bot",
    })
    .returning();

  if (!created) throw new Error("conversation insert failed");
  await ensureConversationProfile(created.id);
  return created;
}

export type ProcessInboundResult =
  | { outcome: "skipped"; detail: string }
  | { outcome: "ok"; detail?: string }
  | { outcome: "error"; detail: string };

export async function processInboundTextForSalesAgent(
  msg: InboundTextMessage,
): Promise<ProcessInboundResult> {
  if (!isSalesAgentEnabled()) {
    return { outcome: "skipped", detail: "disabled" };
  }

  const wamid = msg.wamid;

  const [done] = await db
    .select()
    .from(salesAgentInboundComplete)
    .where(eq(salesAgentInboundComplete.wamid, wamid))
    .limit(1);
  if (done) {
    return { outcome: "skipped", detail: "already_complete" };
  }

  const conv = await getOrCreateConversationForInbound(msg);
  const phoneNumberId = msg.phoneNumberId ?? conv.phoneNumberId ?? null;
  const sendOutbound = shouldSendWhatsAppReplies();

  await db
    .insert(conversationMessages)
    .values({
      conversationId: conv.id,
      role: "user",
      content: msg.textBody,
      providerMessageId: wamid,
    })
    .onConflictDoNothing({
      target: conversationMessages.providerMessageId,
    });

  if (conv.status === "handoff" || conv.stage === "handoff") {
    await markInboundComplete(wamid);
    return { outcome: "skipped", detail: "conversation_handoff" };
  }

  if (conv.stage === "closed") {
    await markInboundComplete(wamid);
    return { outcome: "skipped", detail: "conversation_closed" };
  }

  if (shouldHandOffToHuman(msg.textBody)) {
    await db
      .update(conversations)
      .set({
        status: "handoff",
        stage: "handoff",
        handoffReason: "keyword_operator_request",
        handoffAt: new Date(),
      })
      .where(eq(conversations.id, conv.id));

    if (sendOutbound) {
      const send = await sendWhatsAppText({
        toWaIdDigits: msg.waIdDigits,
        body: HANDOFF_REPLY_DARI,
        phoneNumberId,
      });
      if (!send.ok) {
        return { outcome: "error", detail: send.error };
      }
    } else {
      console.info(
        `[sales-agent] skip WhatsApp send (handoff) wamid=${wamid} chars=${HANDOFF_REPLY_DARI.length}`,
      );
    }

    await db.insert(conversationMessages).values({
      conversationId: conv.id,
      role: "assistant",
      content: HANDOFF_REPLY_DARI,
    });
    await markInboundComplete(wamid);
    return { outcome: "ok", detail: "handoff" };
  }

  let replyText = await runSalesAgentReply(conv.id);
  if (!replyText.trim()) {
    const [after] = await db
      .select({ status: conversations.status })
      .from(conversations)
      .where(eq(conversations.id, conv.id))
      .limit(1);
    if (after?.status === "handoff") {
      replyText = HANDOFF_REPLY_DARI;
    } else {
      replyText =
        "متأسفانه الان پاسخی ندارم. دوباره بنویسید یا «اپراتور» بفرستید.";
    }
  }

  if (sendOutbound) {
    const send = await sendWhatsAppText({
      toWaIdDigits: msg.waIdDigits,
      body: replyText,
      phoneNumberId,
    });
    if (!send.ok) {
      return { outcome: "error", detail: send.error };
    }
  } else {
    console.info(
      `[sales-agent] skip WhatsApp send wamid=${wamid} replyChars=${replyText.length}`,
    );
  }

  await db.insert(conversationMessages).values({
    conversationId: conv.id,
    role: "assistant",
    content: replyText,
  });

  await markInboundComplete(wamid);
  return { outcome: "ok" };
}
