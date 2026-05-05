/**
 * Subscribe your Facebook Page to this app's webhook fields (Messenger + feed comments).
 *
 * Meta only delivers webhooks for fields subscribed at BOTH app level and Page level:
 *   • App: npm run meta:app-webhook-subscribe (POST /{app-id}/subscriptions)
 *   • Page: POST /{page-id}/subscribed_apps (this script)
 *
 * Important: POST with subscribed_fields=messages,feed fails entirely if `pages_messaging`
 * is missing — then **neither** Messenger nor **feed (comments)** gets subscribed. This script
 * subscribes **feed first**, then tries **messages**, and re-applies **feed** if needed.
 *
 * Instagram (`object: instagram`): same Page subscribed_apps step applies to the **linked** FB Page.
 * IG webhook **fields** (`comments`, `messages`) are set in App Dashboard only — run `npm run meta:instagram-webhooks -- <PAGE_ID>` for the checklist.
 *
 * New Pages: use META_PAGE_ACCESS_TOKEN or resolve via GET /me/accounts (user META_ACCESS_TOKEN).
 *
 * Usage:
 *   npm run meta:subscribe-page-webhooks -- <PAGE_ID>
 *
 * Override fields (comma-separated), e.g. comments only until Messenger token is fixed:
 *   META_SUBSCRIBE_PAGE_FIELDS=feed npm run meta:subscribe-page-webhooks -- <PAGE_ID>
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
config({ path: resolve(root, ".env.local"), override: true });
config({ path: resolve(root, ".env"), override: false });

const argv = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
let pageId = process.env.META_FACEBOOK_PAGE_ID?.trim();
const extraFields = [];
for (const a of argv) {
  /** Pure numeric tokens are Page IDs, never webhook field names — avoid pushing duplicate ID into subscribed_fields. */
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
  extraFields.push(a);
}

const explicitPageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
const userTokenForLookup = process.env.META_ACCESS_TOKEN?.trim();
const version = process.env.META_GRAPH_VERSION?.trim() || "v22.0";

const envFieldOverride = process.env.META_SUBSCRIBE_PAGE_FIELDS?.trim();

/** extras from CLI only — env META_SUBSCRIBE_PAGE_FIELDS replaces defaults when set */
function buildFieldLists() {
  if (envFieldOverride) {
    const parts = envFieldOverride.split(",").map((s) => s.trim()).filter(Boolean);
    const wantsMessages = parts.includes("messages");
    const feedFirst =
      parts.filter((p) => p !== "messages").join(",") || "feed";
    const full = wantsMessages
      ? [...new Set(["messages", ...parts])].join(",")
      : parts.join(",");
    return { feedFirst, full, skipMessages: !wantsMessages };
  }
  const base = [
    "messages",
    "feed",
    ...extraFields
      .map((s) => s.replace(/^,+|,+$/g, ""))
      .filter((s) => s && !/^\d{5,}$/.test(s)),
  ];
  const unique = [...new Set(base.filter(Boolean))];
  const full = unique.join(",");
  const feedOnly = unique.filter((f) => f !== "messages").join(",") || "feed";
  return { feedFirst: feedOnly, full, skipMessages: false };
}

function isMessagingPermissionError(json) {
  const msg = json?.error?.message ?? "";
  return (
    msg.includes("pages_messaging") ||
    msg.includes("subscribe to the messages field") ||
    (msg.includes("messages") && json?.error?.code === 200)
  );
}

async function graphGet(path, accessToken) {
  const url = new URL(`https://graph.facebook.com/${version}${path}`);
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString());
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

async function graphPost(path, params, accessToken) {
  const url = new URL(`https://graph.facebook.com/${version}${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { method: "POST" });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

async function resolvePageAccessToken() {
  if (explicitPageToken) {
    console.log("Using META_PAGE_ACCESS_TOKEN for Page Graph calls.\n");
    return explicitPageToken;
  }

  if (!userTokenForLookup) {
    console.error(
      "Set META_PAGE_ACCESS_TOKEN (Page token), or META_ACCESS_TOKEN (user token) to resolve via /me/accounts.",
    );
    return null;
  }

  console.log(
    "No META_PAGE_ACCESS_TOKEN — resolving Page token via GET /me/accounts (user token)…\n",
  );

  const pages = [];
  let nextUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
  nextUrl.searchParams.set("access_token", userTokenForLookup);
  nextUrl.searchParams.set("fields", "id,name,access_token");
  nextUrl.searchParams.set("limit", "100");

  while (nextUrl) {
    const res = await fetch(nextUrl.toString());
    const json = await res.json();
    if (!res.ok || json.error) {
      console.error(
        "/me/accounts failed:",
        json.error?.message ?? JSON.stringify(json),
        "\n→ Generate a Page token in Graph API Explorer: GET /me/accounts?fields=id,access_token then paste one Page’s token as META_PAGE_ACCESS_TOKEN.",
      );
      return null;
    }
    pages.push(...(json.data ?? []));
    const next = json.paging?.next;
    nextUrl = next ? new URL(next) : null;
  }

  const match = pages.find((p) => String(p.id) === String(pageId));
  if (!match?.access_token) {
    console.error(
      `No Page ${pageId} in /me/accounts (${pages.length} pages). IDs:`,
      pages.map((p) => p.id).join(", ") || "(none)",
      "\n→ Use a user token that manages this Page, or set META_PAGE_ACCESS_TOKEN.",
    );
    return null;
  }

  console.log(`Resolved Page token for "${match.name ?? match.id}".\n`);
  return match.access_token;
}

async function main() {
  if (!pageId) {
    console.error(
      "Missing Page ID. Run: npm run meta:subscribe-page-webhooks -- <PAGE_ID>",
    );
    process.exit(1);
  }

  const pageAccessToken = await resolvePageAccessToken();
  if (!pageAccessToken) {
    process.exit(1);
  }

  const { feedFirst, full, skipMessages } = buildFieldLists();

  console.log(
    `Page ${pageId}\n  Step A (comments on posts): subscribed_fields=${feedFirst}\n  Step B (Messenger): ${skipMessages ? "(skipped)" : `subscribed_fields=${full}`}\n`,
  );

  const before = await graphGet(`/${pageId}/subscribed_apps`, pageAccessToken);
  console.log("GET subscribed_apps (before):", before.status, JSON.stringify(before.json, null, 2));

  const postSubs = (fields) =>
    graphPost(`/${pageId}/subscribed_apps`, { subscribed_fields: fields }, pageAccessToken);

  let sub = await postSubs(feedFirst);
  console.log("\nPOST subscribed_apps (feed / comments path):", sub.status, JSON.stringify(sub.json, null, 2));
  if (!sub.ok) {
    console.error(
      "\nIf this failed with permissions, add scopes like pages_manage_metadata, pages_read_engagement to your token.",
    );
    process.exit(1);
  }

  if (!skipMessages && full.includes("messages")) {
    sub = await postSubs(full);
    console.log("\nPOST subscribed_apps (messages + feed):", sub.status, JSON.stringify(sub.json, null, 2));

    if (!sub.ok && isMessagingPermissionError(sub.json)) {
      console.warn(
        "\n⚠ Could not subscribe `messages` (need pages_messaging on the Page token). Re-applying feed-only so comment webhooks stay active…",
      );
      sub = await postSubs(feedFirst);
      console.log(
        "\nPOST subscribed_apps (restore feed):",
        sub.status,
        JSON.stringify(sub.json, null, 2),
      );
      if (!sub.ok) {
        process.exit(1);
      }
      console.warn(
        "\n→ Add pages_messaging to your User/Page token, then run this script again to enable Messenger webhooks.",
      );
    } else if (!sub.ok) {
      process.exit(1);
    }
  }

  const after = await graphGet(`/${pageId}/subscribed_apps`, pageAccessToken);
  console.log("\nGET subscribed_apps (after):", after.status, JSON.stringify(after.json, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
