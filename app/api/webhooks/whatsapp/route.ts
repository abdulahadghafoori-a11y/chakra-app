/**
 * Meta WhatsApp Cloud API webhooks (direct or via Chakra pass-through).
 * Configure in Meta for Developers → WhatsApp → Configuration: callback URL, **messages** field.
 *
 * GET: `hub.mode` / `hub.verify_token` / `hub.challenge` — same verify token as Page/IG webhooks
 * (`META_WEBHOOK_VERIFY_TOKEN` or `META_WHATSAPP_VERIFY_TOKEN`; see `getMetaWebhookVerifyToken`).
 * POST: verify `X-Hub-Signature-256` when Meta app secrets are set, and/or
 * `X-Chakra-Signature-256` when `CHAKRA_WEBHOOK_SECRET` is set (raw body HMAC, hex only).
 * If **both** are set, **either** valid signature accepts the request (Chakra pass-through often omits Meta’s header).
 * Contacts: upsert from every inbound `messages[]` customer row (with `from`).
 * CTWA: insert `ctwa_sessions` only when `ctwa_clid` is present; eligible sessions link to `meta_ads`
 * via Marketing API hierarchy sync (`linkCtwaSessionToMetaAd` / `shouldLinkCtwaSessionToMetaAd`).
 * Sales agent: when `SALES_AGENT_ENABLED=true`, runs OpenAI + DB; WhatsApp send only if
 * `SALES_AGENT_SEND_WHATSAPP=true` (see `lib/sales-agent/process-inbound.ts`).
 *
 * Chakra Chat pass-through: configure `CHAKRA_WEBHOOK_SECRET` from Chakra; Meta’s `X-Hub-Signature-256` is often absent on relayed POSTs.
 * Relayed JSON may use `payload` / stringified bodies or camelCase `ctwaClid`; the route normalizes via `coerceToMetaWhatsAppWebhookBody` before parsing.
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
import {
  coerceToMetaWhatsAppWebhookBody,
  extractMetaInboundContactJobs,
  extractMetaInboundMessageJobs,
} from "@/lib/meta-whatsapp-webhook";
import { processInboundTextForSalesAgent } from "@/lib/sales-agent/process-inbound";
import { linkCtwaSessionToMetaAd } from "@/lib/ctwa-meta-link";
import { shouldLinkCtwaSessionToMetaAd } from "@/lib/feature-set";
import { getMetaWebhookVerifyToken } from "@/lib/meta-page-token";
import {
  chakraSignaturePresent,
  hubSignaturePresent,
  verifyWhatsAppWebhookPost,
} from "@/lib/webhook-signature";

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
  const inboundHubSig = hubSignaturePresent(request.headers);
  const inboundChakraSig = chakraSignaturePresent(request.headers);
  console.info("[whatsapp webhook] inbound POST (received)", {
    bytes: rawBody.length,
    hasMetaSig: inboundHubSig,
    hasChakraSig: inboundChakraSig,
  });

  const verified = verifyWhatsAppWebhookPost(rawBody, request.headers);
  if (!verified.ok) {
    console.warn(
      "[whatsapp webhook] POST rejected (signature):",
      verified.reason,
      verified.detail ?? "",
      {
        bytes: rawBody.length,
        hasMetaSig: inboundHubSig,
        hasChakraSig: inboundChakraSig,
      },
    );
    return NextResponse.json(
      { ok: false, error: verified.reason, detail: verified.detail },
      { status: 401 },
    );
  }

  let body: unknown;
  /** Verify uses raw bytes; JSON.parse rejects a leading UTF‑8 BOM (`\uFEFF`) that some relays add. */
  const jsonText = rawBody.replace(/^\uFEFF/, "");
  try {
    body = jsonText ? JSON.parse(jsonText) : null;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  body = coerceToMetaWhatsAppWebhookBody(body);

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

  const contactJobs = extractMetaInboundContactJobs(body);
  let contactsUpserted = 0;
  let contactsErrors = 0;

  for (const cj of contactJobs) {
    const phoneKey = contactPhoneKeyFromRaw(cj.phoneDigits);
    if (!phoneKey) {
      contactsErrors++;
      continue;
    }

    const { countryCode, countryName } = countryFromPhoneDigits(phoneKey);

    try {
      await upsertContactByPhone({
        phoneNumber: phoneKey,
        name: cj.name,
        countryCode,
        countryName,
        createTime: cj.sendTime,
      });
      contactsUpserted++;
    } catch (e) {
      console.error("[whatsapp webhook] contact persist failed", e);
      contactsErrors++;
    }
  }

  const jobs = extractMetaInboundMessageJobs(body);

  const traceCounts =
    process.env.META_WEBHOOK_TRACE?.trim().toLowerCase() === "true"
      ? {
          contactJobCount: contactJobs.length,
          ctwaJobCount: jobs.length,
        }
      : null;
  if (traceCounts) {
    console.info("[whatsapp webhook] trace", traceCounts);
  }

  let ctwaProcessed = 0;
  let ctwaErrors = 0;
  let ctwaInsertedNew = 0;
  let ctwaDuplicateKey = 0;

  for (const job of jobs) {
    const phoneKey = contactPhoneKeyFromRaw(job.phoneDigits);
    if (!phoneKey) {
      ctwaErrors++;
      continue;
    }

    try {
      const { countryCode, countryName } = countryFromPhoneDigits(phoneKey);

      const contact = await upsertContactByPhone({
        phoneNumber: phoneKey,
        name: job.name,
        countryCode,
        countryName,
        createTime: job.sendTime,
      });

      const inserted = await db
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
        })
        .returning({ id: ctwaSessions.id });

      let sessionId = inserted[0]?.id ?? null;
      if (sessionId) {
        ctwaInsertedNew++;
      } else {
        const [existing] = await db
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
        sessionId = existing?.id ?? null;
        if (sessionId) {
          ctwaDuplicateKey++;
        } else {
          console.error(
            "[whatsapp webhook] CTWA insert skipped but no row matched (contact/sendTime/clid)",
            { contactId: contact.id, ctwaClidLen: job.ctwaClid.length },
          );
        }
      }

      if (sessionId && job.sourceId && shouldLinkCtwaSessionToMetaAd()) {
        try {
          await linkCtwaSessionToMetaAd(sessionId, job.sourceId);
        } catch (e) {
          console.error("[whatsapp webhook] CTWA meta link failed", e);
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

  if (contactJobs.length === 0 && jobs.length === 0 && textMsgs.length === 0) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "no_messages",
    });
  }

  return NextResponse.json({
    ok: true,
    contacts: {
      upserted: contactsUpserted,
      errors: contactsErrors,
    },
    ctwa: {
      processed: ctwaProcessed,
      errors: ctwaErrors,
      /** New rows vs same `(contact_id, ctwa_clid, send_time)` already in DB (replay / double delivery). */
      inserted: ctwaInsertedNew,
      duplicateKey: ctwaDuplicateKey,
    },
    agent: { ok: agentOk, skipped: agentSkipped, errors: agentErrors },
    ...(traceCounts ? { trace: traceCounts } : {}),
  });
}
