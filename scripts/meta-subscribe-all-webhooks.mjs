/**
 * Run every **Graph API** step Meta allows for Page + Instagram webhook delivery:
 *
 *   1) App-level `object: page` subscription (same callback URL + verify token)
 *   2) Page `POST /{page-id}/subscribed_apps` (feed + messages when permitted)
 *
 * Instagram **app-level** subscriptions (`object: instagram`, fields `comments` / `messages`)
 * are **not** supported on `POST /{app-id}/subscriptions` — Meta requires **App Dashboard**.
 * @see https://developers.facebook.com/docs/graph-api/reference/app/subscriptions/ — Limitations
 *
 * After this script succeeds, complete Instagram in:
 *   Developers → App → Webhooks → **Instagram** → same Callback URL → subscribe **comments** + **messages**.
 *
 * Usage:
 *   npm run meta:subscribe-webhooks
 *   npm run meta:subscribe-webhooks -- <FACEBOOK_PAGE_ID>
 *
 * Requires same env as `meta:app-webhook-subscribe` + `meta:subscribe-page-webhooks`.
 */

import { execSync } from "node:child_process";
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
config({ path: resolve(root, ".env.local"), override: true });
config({ path: resolve(root, ".env"), override: false });

const argv = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
let pageId = process.env.META_FACEBOOK_PAGE_ID?.trim();

for (const a of argv) {
  if (/^\d{5,}$/.test(a)) {
    if (!pageId) {
      pageId = a;
    } else if (String(pageId) !== String(a)) {
      console.warn(
        `[meta:subscribe-webhooks] CLI Page ID ${a} overrides META_FACEBOOK_PAGE_ID (${pageId}).`,
      );
      pageId = a;
    }
    continue;
  }
  console.warn(`[meta:subscribe-webhooks] Ignoring unknown CLI arg: ${a}`);
}

function metaWebhookCallbackDisplayUrl() {
  const raw = process.env.META_PAGE_WEBHOOK_CALLBACK_URL?.trim();
  if (!raw) return "(set META_PAGE_WEBHOOK_CALLBACK_URL)";
  const base = raw.replace(/\/+$/, "");
  return base.includes("/api/webhooks/meta")
    ? base
    : `${base}/api/webhooks/meta`;
}

function main() {
  if (!pageId) {
    console.error(
      "Set META_FACEBOOK_PAGE_ID or run:\n  npm run meta:subscribe-webhooks -- <FACEBOOK_PAGE_ID>",
    );
    process.exit(1);
  }

  const opts = { cwd: root, stdio: "inherit", shell: true };

  console.log(`
=== meta:subscribe-webhooks (Graph API steps) ===
Page ID: ${pageId}

Step 1/2 — App subscriptions (object: page only)
`);

  execSync("npm run meta:app-webhook-subscribe", opts);

  console.log(`
Step 2/2 — Page subscribed_apps (Messenger + feed / comments path)
`);

  execSync(
    `npm run meta:subscribe-page-webhooks -- ${pageId}`,
    opts,
  );

  console.log(`
=== Instagram — App Dashboard only (Graph API cannot subscribe object=instagram) ===

  • Open: https://developers.facebook.com/apps → Your app → Webhooks → Instagram
  • Callback URL must match Page webhooks:
      ${metaWebhookCallbackDisplayUrl()}
  • Subscribe fields: **comments**, **messages**
  • Docs: https://developers.facebook.com/docs/graph-api/reference/app/subscriptions/

Then verify linkage + IG user id:
  npm run meta:instagram-webhooks -- ${pageId}
`);
}

main();
