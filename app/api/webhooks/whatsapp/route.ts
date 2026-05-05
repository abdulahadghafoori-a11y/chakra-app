/**
 * Meta WhatsApp Cloud API webhooks (direct or via Chakra pass-through).
 * Configure in Meta for Developers → WhatsApp → Configuration: callback URL, **messages** field.
 *
 * GET: `hub.mode` / `hub.verify_token` / `hub.challenge` — same verify token as Page/IG webhooks
 * (`META_WEBHOOK_VERIFY_TOKEN` or `META_WHATSAPP_VERIFY_TOKEN`; see `getMetaWebhookVerifyToken`).
 * POST: verify `X-Hub-Signature-256` when `META_APP_SECRET` is set, and/or
 * `X-Chakra-Signature-256` when `CHAKRA_WEBHOOK_SECRET` is set (raw body HMAC, hex only).
 * CTWA: upserts `contacts` + `ctwa_sessions` when `ctwa_clid` is present.
 * Sales agent: when `SALES_AGENT_ENABLED=true`, runs OpenAI + DB; WhatsApp send only if
 * `SALES_AGENT_SEND_WHATSAPP=true` (see `lib/sales-agent/process-inbound.ts`).
 */

import { NextResponse } from "next/server";

import { and, eq } from "drizzle-orm";

import { ctwaSessions } from "@/drizzle/schema";
import {
  contactPhoneKeyFromRaw,
  countryFromPhoneDigits,
} from "@/lib/contact-phone";
import { upsertContactByPhone } from "@/lib/contacts";
import { db } from "@/lib/db";
import { extractInboundTextMessages } from "@/lib/inbound-text-messages";
import { extractMetaInboundMessageJobs } from "@/lib/meta-whatsapp-webhook";
import { processInboundTextForSalesAgent } from "@/lib/sales-agent/process-inbound";
import { linkCtwaSessionToMetaAd } from "@/lib/ctwa-meta-link";
import { getMetaWebhookVerifyToken } from "@/lib/meta-page-token";
import { verifyWhatsAppWebhookPost } from "@/lib/webhook-signature";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  let verifyToken: string;
  try {
    verifyToken = getMetaWebhookVerifyToken();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  if (
    mode === "subscribe" &&
    token &&
    token === verifyToken &&
    challenge
  ) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifyWhatsAppWebhookPost(rawBody, request.headers);
  if (!verified.ok) {
    return NextResponse.json(
      { ok: false, error: verified.reason, detail: verified.detail },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const root =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;

  if (root?.object !== "whatsapp_business_account") {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "not_whatsapp_business_account",
    });
  }

  const jobs = extractMetaInboundMessageJobs(body);
  let ctwaProcessed = 0;
  let ctwaErrors = 0;

  for (const job of jobs) {
    const phoneKey = contactPhoneKeyFromRaw(job.phoneDigits);
    if (!phoneKey) {
      ctwaErrors++;
      continue;
    }

    const { countryCode, countryName } = countryFromPhoneDigits(phoneKey);

    try {
      const contact = await upsertContactByPhone({
        phoneNumber: phoneKey,
        name: job.name,
        countryCode,
        countryName,
        createTime: job.sendTime,
      });

      await db
        .insert(ctwaSessions)
        .values({
          contactId: contact.id,
          ctwaClid: job.ctwaClid,
          wabaId: job.wabaId,
          phoneNumberId: job.phoneNumberId,
          sourceId: job.sourceId,
          sourceUrl: job.sourceUrl,
          sourceType: job.sourceType,
          sendTime: job.sendTime,
        })
        .onConflictDoNothing({
          target: [
            ctwaSessions.contactId,
            ctwaSessions.ctwaClid,
            ctwaSessions.sendTime,
          ],
        });

      if (job.sourceId) {
        const [sessionRow] = await db
          .select({ id: ctwaSessions.id })
          .from(ctwaSessions)
          .where(
            and(
              eq(ctwaSessions.contactId, contact.id),
              eq(ctwaSessions.ctwaClid, job.ctwaClid),
              eq(ctwaSessions.sendTime, job.sendTime),
            ),
          )
          .limit(1);
        if (sessionRow?.id) {
          try {
            await linkCtwaSessionToMetaAd(sessionRow.id, job.sourceId);
          } catch (e) {
            console.error("[whatsapp webhook] CTWA meta link failed", e);
          }
        }
      }
      ctwaProcessed++;
    } catch (e) {
      console.error("[whatsapp webhook] CTWA persist failed", e);
      ctwaErrors++;
    }
  }

  const textMsgs = extractInboundTextMessages(body);
  let agentOk = 0;
  let agentSkipped = 0;
  let agentErrors = 0;

  for (const msg of textMsgs) {
    try {
      const r = await processInboundTextForSalesAgent(msg);
      if (r.outcome === "ok") agentOk++;
      else if (r.outcome === "skipped") agentSkipped++;
      else agentErrors++;
    } catch (e) {
      console.error("[whatsapp webhook] sales agent failed", e);
      agentErrors++;
    }
  }

  if (jobs.length === 0 && textMsgs.length === 0) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "no_messages",
    });
  }

  return NextResponse.json({
    ok: true,
    ctwa: { processed: ctwaProcessed, errors: ctwaErrors },
    agent: { ok: agentOk, skipped: agentSkipped, errors: agentErrors },
  });
}
