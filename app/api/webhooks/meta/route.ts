/**
 * Meta webhooks on one URL:
 * - `object: "page"` → Page `feed` changes (Facebook comments) + Messenger (`entry.messaging` /
 *   standby + `changes` field `messages`).
 * - `object: "instagram"` → Instagram comments (`changes` field `comments`) + Instagram Direct
 *   (`collectInstagramDmEnvelopesFromEntry`).
 *
 * GET: subscription verify (`META_WEBHOOK_VERIFY_TOKEN` or aliases — same as WhatsApp).
 * POST: `X-Hub-Signature-256` via `lib/webhook-signature.ts` (Instagram app secret first when set).
 *
 * Dashboard **Test** payloads may use `{ sample: { field, value } }` only — normalized using
 * `META_FACEBOOK_PAGE_ID` / `META_INSTAGRAM_BUSINESS_ACCOUNT_ID` when set.
 * “Success” in the Test UI often does not POST your dev URL — use Recent deliveries or
 * `npm run meta:webhook-send-sample`.
 *
 * Optional: `META_WEBHOOK_DEBUG=true` logs full parsed JSON (local only).
 */

import { NextResponse } from "next/server";

import { getMetaWebhookVerifyToken } from "@/lib/meta-page-token";
import {
  collectInstagramDmEnvelopesFromEntry,
  extractMessagingEnvelopesFromMessagesChangeValue,
  handleFacebookFeedChange,
  handleInstagramCommentChange,
  handleInstagramMessagingEvent,
  handleMessengerEvent,
} from "@/lib/meta-social-webhook-process";
import {
  hubSignaturePresent,
  verifyWhatsAppWebhookPost,
} from "@/lib/webhook-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function metaWebhookDebugEnabled(): boolean {
  const v = process.env.META_WEBHOOK_DEBUG?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Meta App Dashboard “Test” for webhook fields often POSTs only `{ sample: { field, value }, ... }`
 * without `object` + `entry`. Real deliveries always include those. Expand samples so routing works.
 */
function normalizeMetaDeveloperConsolePayload(
  root: Record<string, unknown>,
): Record<string, unknown> {
  const hasObject =
    typeof root.object === "string" && root.object.trim().length > 0;
  const hasEntry = Array.isArray(root.entry) && root.entry.length > 0;
  if (hasObject && hasEntry) return root;

  const sample = asRecord(root.sample);
  if (!sample || typeof sample.field !== "string") return root;

  const field = sample.field.trim();
  const pageId = process.env.META_FACEBOOK_PAGE_ID?.trim();
  const igId = process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  const nowSec = Math.floor(Date.now() / 1000);

  if (field === "messages") {
    if (pageId) {
      console.info(
        "[meta webhook] normalized Dashboard `sample` (messages) → synthetic Page webhook",
      );
      return {
        object: "page",
        entry: [
          {
            id: pageId,
            time: nowSec,
            changes: [{ field: "messages", value: sample.value }],
          },
        ],
      };
    }
    if (igId) {
      console.info(
        "[meta webhook] normalized Dashboard `sample` (messages) → synthetic Instagram webhook (no META_FACEBOOK_PAGE_ID)",
      );
      return {
        object: "instagram",
        entry: [
          {
            id: igId,
            time: nowSec,
            messaging: [sample.value],
          },
        ],
      };
    }
    console.warn(
      "[meta webhook] Dashboard sample uses field=messages — set META_FACEBOOK_PAGE_ID and/or META_INSTAGRAM_BUSINESS_ACCOUNT_ID to expand `sample` into a synthetic webhook body.",
    );
    return root;
  }

  if (field === "comments" && igId) {
    console.info(
      "[meta webhook] normalized Dashboard `sample` (comments) → synthetic Instagram webhook",
    );
    return {
      object: "instagram",
      entry: [
        {
          id: igId,
          time: nowSec,
          changes: [{ field: "comments", value: sample.value }],
        },
      ],
    };
  }

  if (field === "comments" && !igId) {
    console.warn(
      "[meta webhook] Developer Console sample uses field=comments but META_INSTAGRAM_BUSINESS_ACCOUNT_ID is unset.",
    );
  }

  return root;
}

function warnIfMetaNamesOnlyPayload(entry: Record<string, unknown>, ctx: string) {
  const cf = entry.changed_fields;
  if (!Array.isArray(cf) || cf.length === 0) return;
  const hasMessaging =
    Array.isArray(entry.messaging) && entry.messaging.length > 0;
  const hasStandby =
    Array.isArray(entry.standby) && entry.standby.length > 0;
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  const hasChangeValues = changes.some((raw) => {
    const ch = asRecord(raw);
    if (!ch) return false;
    const v = ch.value;
    return v != null && typeof v === "object";
  });
  if (!hasMessaging && !hasStandby && !hasChangeValues) {
    console.warn(
      `[meta webhook] ${ctx}: entry only lists changed_fields=[${cf.join(", ")}] — Meta may be omitting payload bodies; enable including values / payload details for Webhooks in the Developer Dashboard.`,
    );
  }
}

/** Meta JSON uses numeric ids for Page / IG entry.id — coerce for routing + DM scope. */
function entryIdString(id: unknown): string {
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return "";
}

/** Lightweight parse for logs only — never throws. */
function summarizeMetaWebhookInbound(rawBody: string): {
  object: string | null;
  entryCount: number;
  hints: string[];
} {
  if (!rawBody.length) {
    return { object: null, entryCount: 0, hints: ["empty_body"] };
  }
  try {
    const j = JSON.parse(rawBody) as Record<string, unknown>;
    const obj = typeof j.object === "string" ? j.object : null;
    const entries = Array.isArray(j.entry) ? j.entry : [];
    const hints: string[] = [];
    const sample = asRecord(j.sample);
    if (sample && typeof sample.field === "string") {
      hints.push(`sample.field=${sample.field.trim()}`);
    }
    for (const ent of entries.slice(0, 5)) {
      const e = asRecord(ent);
      if (!e) continue;
      const id = entryIdString(e.id);
      if (id) hints.push(`entry.id=${id}`);
      if (Array.isArray(e.messaging) && e.messaging.length > 0) {
        hints.push(`messaging×${e.messaging.length}`);
      }
      if (Array.isArray(e.standby) && e.standby.length > 0) {
        hints.push(`standby×${e.standby.length}`);
      }
      const changes = Array.isArray(e.changes) ? e.changes : [];
      const fields = changes
        .map((c) => {
          const ch = asRecord(c);
          return typeof ch?.field === "string" ? ch.field : null;
        })
        .filter((f): f is string => Boolean(f));
      if (fields.length) {
        hints.push(`changes:[${[...new Set(fields)].join(",")}]`);
      }
    }
    return {
      object: obj,
      entryCount: entries.length,
      hints: [...new Set(hints)].slice(0, 18),
    };
  } catch {
    return { object: null, entryCount: 0, hints: ["invalid_json"] };
  }
}

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
    console.info("[meta webhook] GET subscription verify OK", {
      hubMode: mode,
      challengeLen: challenge.length,
    });
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const inboundHubSig = hubSignaturePresent(request.headers);
  const inboundSummary = summarizeMetaWebhookInbound(rawBody);
  console.info("[meta webhook] inbound POST (received)", {
    bytes: rawBody.length,
    hasMetaSig: inboundHubSig,
    ...inboundSummary,
  });

  const verified = verifyWhatsAppWebhookPost(rawBody, request.headers);
  if (!verified.ok) {
    console.warn(
      "[meta webhook] POST rejected (check META_APP_SECRET matches App Settings → Basic → App secret):",
      verified.reason,
      verified.detail ?? "",
      {
        bytes: rawBody.length,
        hasMetaSig: inboundHubSig,
        ...inboundSummary,
      },
    );
    return NextResponse.json(
      { ok: false, error: verified.reason, detail: verified.detail },
      { status: 401 },
    );
  }

  console.info("[meta webhook] POST signature verified; processing", {
    bytes: rawBody.length,
    ...inboundSummary,
  });

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    console.warn("[meta webhook] POST invalid JSON after verify", {
      bytes: rawBody.length,
    });
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  let root = asRecord(body);
  if (!root) {
    console.info("[meta webhook] POST handled", {
      processed: 0,
      errors: 0,
      ignored: true,
      reason: "empty_body",
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  root = normalizeMetaDeveloperConsolePayload(root);

  if (metaWebhookDebugEnabled()) {
    console.log("[meta webhook] POST payload:", JSON.stringify(root, null, 2));
  }

  const obj = typeof root.object === "string" ? root.object : null;
  const entries = Array.isArray(root.entry) ? root.entry : [];

  let processed = 0;
  let errors = 0;

  const bumpProcessed = () => {
    processed++;
  };
  const bumpError = () => {
    errors++;
  };

  if (obj === "page") {
    for (const ent of entries) {
      const entry = asRecord(ent);
      if (!entry) continue;
      const pageId = entryIdString(entry.id);
      if (!pageId) continue;

      warnIfMetaNamesOnlyPayload(entry, "page");

      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const ch of changes) {
        const change = asRecord(ch);
        if (!change) continue;
        const field =
          typeof change.field === "string" ? change.field.trim() : "";

        if (field === "feed") {
          try {
            await handleFacebookFeedChange(pageId, change);
            bumpProcessed();
          } catch (e) {
            console.error("[meta webhook] facebook feed change failed", e);
            bumpError();
          }
          continue;
        }

        if (field === "messages") {
          const envs = extractMessagingEnvelopesFromMessagesChangeValue(
            change.value,
          );
          if (
            metaWebhookDebugEnabled() &&
            envs.length === 0 &&
            change.value != null
          ) {
            console.log(
              "[meta webhook] Page changes.messages present but no envelopes extracted (check META_WEBHOOK_DEBUG payload shape)",
            );
          }
          for (const env of envs) {
            const m = asRecord(env);
            if (!m) continue;
            try {
              await handleMessengerEvent(pageId, m);
              bumpProcessed();
            } catch (e) {
              console.error("[meta webhook] Page messages change failed", e);
              bumpError();
            }
          }
        }
      }

      const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
      const standby = Array.isArray(entry.standby) ? entry.standby : [];
      for (const msg of [...messaging, ...standby]) {
        const m = asRecord(msg);
        if (!m) continue;
        try {
          await handleMessengerEvent(pageId, m);
          bumpProcessed();
        } catch (e) {
          console.error("[meta webhook] messenger failed", e);
          bumpError();
        }
      }
    }
  } else if (obj === "instagram") {
    for (const ent of entries) {
      const entry = asRecord(ent);
      if (!entry) continue;
      const igId = entryIdString(entry.id);
      if (!igId) continue;

      warnIfMetaNamesOnlyPayload(entry, "instagram");

      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const ch of changes) {
        const change = asRecord(ch);
        if (!change) continue;
        const field =
          typeof change.field === "string" ? change.field.trim() : "";
        if (field !== "comments") continue;
        try {
          await handleInstagramCommentChange(igId, change);
          bumpProcessed();
        } catch (e) {
          console.error("[meta webhook] instagram comment failed", e);
          bumpError();
        }
      }

      const envelopes = collectInstagramDmEnvelopesFromEntry(entry);
      if (
        metaWebhookDebugEnabled() &&
        envelopes.length === 0 &&
        Array.isArray(entry.changes) &&
        entry.changes.length > 0
      ) {
        console.log(
          "[meta webhook] instagram entry had changes but no DM envelopes extracted — check fields:",
          (entry.changes as unknown[])
            .map((c) => (asRecord(c)?.field as string) ?? "?")
            .join(", "),
        );
      }
      for (const msg of envelopes) {
        const m = asRecord(msg);
        if (!m) continue;
        try {
          await handleInstagramMessagingEvent(igId, m);
          bumpProcessed();
        } catch (e) {
          console.error("[meta webhook] instagram dm failed", e);
          bumpError();
        }
      }
    }
  } else {
    console.info("[meta webhook] POST handled", {
      processed: 0,
      errors: 0,
      ignored: true,
      reason: "unsupported_object",
      object: obj,
    });
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "unsupported_object",
      object: obj,
    });
  }

  console.info("[meta webhook] POST handled", {
    processed,
    errors,
    object: obj,
  });

  return NextResponse.json({ ok: true, processed, errors });
}
