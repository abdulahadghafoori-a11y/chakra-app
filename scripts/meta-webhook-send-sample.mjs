/**
 * POST the Meta Dashboard–style `{ sample: { field, value } }` body to your webhook with a valid
 * `X-Hub-Signature-256`, so you can verify tunnel + App Secret without relying on the Dashboard
 * “Test” button (which often reports success without hitting your dev machine).
 *
 *   npm run meta:webhook-send-sample
 *
 * Uses META_INSTAGRAM_APP_SECRET (then legacy META_INSTAGRAM_LOGIN_APP_SECRET), then META_APP_SECRET.
 */

import { createHmac } from "node:crypto";
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
config({ path: resolve(root, ".env.local"), override: true });
config({ path: resolve(root, ".env"), override: false });

/** Same shape Meta shows for Instagram “messages” sample test (field docs). */
const SAMPLE_BODY = {
  sample: {
    field: "messages",
    value: {
      sender: { id: "12334" },
      recipient: { id: "23245" },
      timestamp: "1527459824",
      message: { mid: "random_mid", text: "random_text" },
    },
  },
  sub_field_options: null,
  sample_context_metadata: null,
};

function metaSecrets() {
  const instagram = [
    process.env.META_INSTAGRAM_APP_SECRET?.trim(),
    process.env.META_INSTAGRAM_LOGIN_APP_SECRET?.trim(),
  ].filter(Boolean);
  const primary = process.env.META_APP_SECRET?.trim();
  const ordered = [];
  for (const s of instagram) {
    if (s && !ordered.includes(s)) ordered.push(s);
  }
  if (primary && !ordered.includes(primary)) ordered.push(primary);
  return ordered;
}

function secretEnvName(secret) {
  if (secret === process.env.META_APP_SECRET?.trim()) return "META_APP_SECRET";
  if (secret === process.env.META_INSTAGRAM_APP_SECRET?.trim()) {
    return "META_INSTAGRAM_APP_SECRET";
  }
  if (secret === process.env.META_INSTAGRAM_LOGIN_APP_SECRET?.trim()) {
    return "META_INSTAGRAM_LOGIN_APP_SECRET";
  }
  return "unknown_secret";
}

function signMeta(rawBody, secret) {
  const hex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return `sha256=${hex}`;
}

async function main() {
  const urlRaw = process.env.META_PAGE_WEBHOOK_CALLBACK_URL?.trim();
  if (!urlRaw) {
    console.error(
      "Set META_PAGE_WEBHOOK_CALLBACK_URL (full URL ending in /api/webhooks/meta).",
    );
    process.exit(1);
  }

  const secrets = metaSecrets();
  if (secrets.length === 0) {
    console.error(
      "Set META_APP_SECRET and/or META_INSTAGRAM_APP_SECRET (Instagram Graph API app → Basic → App secret).",
    );
    process.exit(1);
  }

  let callbackUrl = urlRaw.replace(/\/+$/, "");
  if (!callbackUrl.includes("/api/webhooks/meta")) {
    callbackUrl = `${callbackUrl}/api/webhooks/meta`;
  }

  const rawBody = JSON.stringify(SAMPLE_BODY);

  console.log("POST", callbackUrl);
  console.log("Bytes:", Buffer.byteLength(rawBody, "utf8"));

  for (let i = 0; i < secrets.length; i++) {
    const secret = secrets[i];
    const label = secretEnvName(secret);
    const sig = signMeta(rawBody, secret);
    const res = await fetch(callbackUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": sig,
      },
      body: rawBody,
    });
    const text = await res.text();
    console.log(`\nSigned with ${label}: HTTP ${res.status}`);
    console.log(text.slice(0, 500));

    if (res.ok) {
      console.log(
        "\nIf `npm run dev` is running behind this URL, you should see [meta webhook] inbound POST …",
      );
      process.exit(0);
    }
  }

  console.error(
    "\nAll signature attempts failed (401). Secrets must match the Meta app that would POST webhooks.",
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
