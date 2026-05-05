/**
 * Instagram webhook setup — checklist + diagnostics.
 *
 * Meta difference vs Facebook Page-only:
 * - App-level **Instagram** webhooks must be configured in **App Dashboard**
 *   (`POST /{app-id}/subscriptions` does **not** support object=instagram).
 * - **Step 2** in Meta’s IG webhook docs: enable **Page subscribed_apps** on the Facebook Page
 *   **linked** to the IG professional account — same as `npm run meta:subscribe-page-webhooks -- <PAGE_ID>`.
 *
 * This script prints that checklist and runs GET /{page-id}?fields=instagram_business_account
 * so you can confirm linkage + IG user id (matches webhook entry.id for object "instagram").
 *
 * Usage:
 *   npm run meta:instagram-webhooks -- <FACEBOOK_PAGE_ID>
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
config({ path: resolve(root, ".env.local"), override: true });
config({ path: resolve(root, ".env"), override: false });

const argv = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
let pageId = process.env.META_FACEBOOK_PAGE_ID?.trim();

/** Full callback URL for checklist text (env should already include `/api/webhooks/meta`). */
function metaWebhookCallbackDisplayUrl() {
  const raw = process.env.META_PAGE_WEBHOOK_CALLBACK_URL?.trim();
  if (!raw) {
    return "(set META_PAGE_WEBHOOK_CALLBACK_URL to full URL, e.g. https://host/api/webhooks/meta)";
  }
  const base = raw.replace(/\/+$/, "");
  if (base.includes("/api/webhooks/meta")) {
    return base;
  }
  return `${base}/api/webhooks/meta`;
}

for (const a of argv) {
  if (/^\d{5,}$/.test(a)) {
    if (!pageId) {
      pageId = a;
    } else if (String(pageId) !== String(a)) {
      console.warn(
        `CLI Page ID ${a} overrides META_FACEBOOK_PAGE_ID (${pageId}).`,
      );
      pageId = a;
    }
    continue;
  }
}

const explicitPageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
const userTokenForLookup = process.env.META_ACCESS_TOKEN?.trim();
const version = process.env.META_GRAPH_VERSION?.trim() || "v22.0";

const appId = process.env.META_APP_ID?.trim();
const appSecret = process.env.META_APP_SECRET?.trim();

async function resolvePageAccessToken() {
  if (explicitPageToken) return explicitPageToken;
  if (!userTokenForLookup || !pageId) return null;

  const pages = [];
  let nextUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
  nextUrl.searchParams.set("access_token", userTokenForLookup);
  nextUrl.searchParams.set("fields", "id,name,access_token");
  nextUrl.searchParams.set("limit", "100");

  while (nextUrl) {
    const res = await fetch(nextUrl.toString());
    const json = await res.json();
    if (!res.ok || json.error) return null;
    pages.push(...(json.data ?? []));
    nextUrl = json.paging?.next ? new URL(json.paging.next) : null;
  }

  const match = pages.find((p) => String(p.id) === String(pageId));
  return match?.access_token ?? null;
}

async function appAccessToken() {
  const url = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("grant_type", "client_credentials");
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? JSON.stringify(json));
  }
  return json.access_token;
}

async function main() {
  console.log(`
=== Instagram webhooks (chakra-app /api/webhooks/meta) ===

Meta sends object "instagram" with entry.id = Instagram professional account id.

A) Link assets
   • IG Professional (Business/Creator) must be linked to your Facebook Page.

B) Page subscribed_apps (same as Facebook comments/Messenger)
   • Run (once per linked Page):
       npm run meta:subscribe-page-webhooks -- <FACEBOOK_PAGE_ID>
   • Meta requires ANY Page field subscribed here for IG webhooks to flow — your script uses feed (+ messages when permitted).

C) App Dashboard ONLY — Instagram object
   • Developers → your app → Webhooks → Instagram / Instagram Graph API
   • Callback URL: SAME as Page → ${metaWebhookCallbackDisplayUrl()}
   • Subscribe fields your app handles:
       • comments   → IG comments → /meta-engagement (instagram platform)
       • messages   → IG DM → DM bridge (REQUIRED for Direct; Page → messages is Messenger only)
   • If you see IG comments + FB Messenger but NEVER Instagram DMs: almost always missing Instagram → messages here (not the same field as Page messages).

D) Production nuance — comments + DM (Meta docs)
   • App must be published for typical webhook delivery.
   • Development mode: IG message webhooks are usually only sent when the sender has an App Role
     (admin/developer/tester). Random customers need Live mode + permissions/App Review as required.
   • DM field often needs instagram_manage_messages (Standard or Advanced per product setup).
   • Live comments webhooks often need Advanced Access on instagram_manage_comments (+ App Review).

E) If DMs never hit your server
   • Dashboard callback URL must match your tunnel/host exactly (Page + Instagram objects).
   • Re-run: npm run meta:subscribe-page-webhooks -- <FACEBOOK_PAGE_ID> (needs the Page "messages" field when permitted).
   • Set META_WEBHOOK_DEBUG=true — expect a log line containing [meta webhook] POST received on each delivery.

`);

  if (!pageId) {
    console.log(
      "Diagnostic skipped: pass Page ID — npm run meta:instagram-webhooks -- <FACEBOOK_PAGE_ID>",
    );
    process.exit(0);
  }

  const token = await resolvePageAccessToken();
  if (!token) {
    console.error(
      "Could not resolve Page token. Set META_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN + matching META_FACEBOOK_PAGE_ID.",
    );
    process.exit(1);
  }

  const igFields = "instagram_business_account{id,username}";
  const url = new URL(`https://graph.facebook.com/${version}/${pageId}`);
  url.searchParams.set("fields", igFields);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  const json = await res.json();
  console.log(`GET /${pageId}?fields=instagram_business_account …`);
  console.log(res.status, JSON.stringify(json, null, 2));

  if (json.instagram_business_account?.id) {
    console.log(
      `\n→ Webhook payloads will use entry.id ≈ ${json.instagram_business_account.id} for object "instagram".`,
    );
    console.log(
      `\nOptional .env.local (Dashboard sample tests / docs):\nMETA_INSTAGRAM_BUSINESS_ACCOUNT_ID=${json.instagram_business_account.id}`,
    );
  } else {
    console.warn(
      "\n⚠ No instagram_business_account on this Page — link IG in Page settings / Meta Business Suite.",
    );
  }

  if (appId && appSecret) {
    try {
      const at = await appAccessToken();
      const subUrl = `https://graph.facebook.com/${version}/${appId}/subscriptions?access_token=${encodeURIComponent(at)}`;
      const subRes = await fetch(subUrl);
      const subJson = await subRes.json();
      const ig = (subJson.data ?? []).find((s) => s.object === "instagram");
      console.log("\nApp subscriptions — instagram object (Dashboard-managed):");
      console.log(ig ? JSON.stringify(ig, null, 2) : "(none returned — add Instagram callback + fields in App Dashboard)");
    } catch (e) {
      console.warn("\nCould not fetch app subscriptions:", e.message);
    }
  } else {
    console.log(
      "\n(Set META_APP_ID + META_APP_SECRET to print current app-level instagram subscription summary.)",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
