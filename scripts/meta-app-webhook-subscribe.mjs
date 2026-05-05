/**
 * App-level Page webhook subscription (Graph API).
 *
 * Meta: "Only fields with subscriptions at BOTH the page and app levels will get Webhooks."
 * https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/
 *
 * Dashboard "Test" can hit your server without this alignment; live Page Messenger events require:
 *   1) App subscribed to Page object fields (this script, OR matching setup in App Dashboard)
 *   2) POST /{page-id}/subscribed_apps — run: npm run meta:subscribe-page-webhooks
 *
 * Requires:
 *   META_APP_ID              — App ID (Settings → Basic)
 *   META_APP_SECRET          — App Secret (same as webhook signature secret)
 *   META_PAGE_WEBHOOK_CALLBACK_URL — Full HTTPS URL, e.g. https://YOUR_TUNNEL/api/webhooks/meta
 *
 * Verify token (same as Meta Dashboard): META_WEBHOOK_VERIFY_TOKEN or META_WHATSAPP_VERIFY_TOKEN or META_PAGE_WEBHOOK_VERIFY_TOKEN
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
config({ path: resolve(root, ".env.local"), override: true });
config({ path: resolve(root, ".env"), override: false });

const appId = process.env.META_APP_ID?.trim();
const appSecret = process.env.META_APP_SECRET?.trim();
const callbackUrl = process.env.META_PAGE_WEBHOOK_CALLBACK_URL?.trim();
const version = process.env.META_GRAPH_VERSION?.trim() || "v22.0";

const verifyToken =
  process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
  process.env.META_WHATSAPP_VERIFY_TOKEN?.trim() ||
  process.env.META_PAGE_WEBHOOK_VERIFY_TOKEN?.trim();

const fields =
  process.env.META_APP_PAGE_WEBHOOK_FIELDS?.trim() || "messages,feed";

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
  if (!appId || !appSecret || !callbackUrl || !verifyToken) {
    console.error(
      "Set META_APP_ID, META_APP_SECRET, META_PAGE_WEBHOOK_CALLBACK_URL, and a verify token (META_WEBHOOK_VERIFY_TOKEN or META_WHATSAPP_VERIFY_TOKEN).",
    );
    process.exit(1);
  }

  const token = await appAccessToken();
  console.log("Got app access token.");
  console.warn(
    "Meta may GET your callback_url now — tunnel + dev server must be reachable.\n",
  );

  const base = `https://graph.facebook.com/${version}/${appId}`;

  const getRes = await fetch(`${base}/subscriptions?access_token=${encodeURIComponent(token)}`);
  const getJson = await getRes.json();
  console.log("GET app subscriptions:", getRes.status, JSON.stringify(getJson, null, 2));

  const body = new URLSearchParams({
    object: "page",
    callback_url: callbackUrl,
    fields,
    verify_token: verifyToken,
  });

  const postRes = await fetch(`${base}/subscriptions?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const postJson = await postRes.json();
  console.log("\nPOST app subscriptions (page):", postRes.status, JSON.stringify(postJson, null, 2));

  if (!postRes.ok || postJson.error || postJson.success === false) {
    process.exit(1);
  }

  console.log(
    "\nNext: subscribe Page + see Instagram Dashboard reminder:\n  npm run meta:subscribe-webhooks -- <PAGE_ID>\n  (or: META_FACEBOOK_PAGE_ID=<id> npm run meta:subscribe-page-webhooks)",
  );
  console.log(
    "Instagram fields (comments, messages): App Dashboard only — https://developers.facebook.com/docs/graph-api/reference/app/subscriptions/",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
