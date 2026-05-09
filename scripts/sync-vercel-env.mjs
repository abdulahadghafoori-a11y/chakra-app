/**
 * Pushes non-empty variables from .env.local to Vercel (production + preview).
 * Usage: node scripts/sync-vercel-env.mjs
 * Requires: linked project (`npx vercel link`), `npx vercel login`
 *
 * Production MVP (core) env hints (set in Dashboard or sync from .env.local):
 * - DATABASE_URL, AUTH_SECRET (32+ chars)
 * - FEATURE_SET=core — gates staff UI + blocks /api/webhooks/meta (Page/IG)
 * - CTWA_LINK_META_AD=false — optional; skip Marketing API when linking CTWA → meta_ads
 * - META_DATASET_ID (or META_PIXEL_ID), META_ACCESS_TOKEN
 * - Omit META_TEST_EVENT_CODE in production so CAPI sends real Purchase events
 * - META_APP_SECRET (WhatsApp POST signature), webhook verify token(s)
 * - SALES_AGENT_ENABLED unset/false for minimal WhatsApp agent surface
 */
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const vercelCli = resolve(root, "node_modules/vercel/dist/vc.js");

config({ path: resolve(root, ".env.local"), override: true });

const KEYS = [
  "DATABASE_URL",
  "FEATURE_SET",
  "CTWA_LINK_META_AD",
  "META_ACCESS_TOKEN",
  "META_DATASET_ID",
  "META_WHATSAPP_BUSINESS_ACCOUNT_ID",
  "META_TEST_EVENT_CODE",
  "META_WHATSAPP_VERIFY_TOKEN",
  "META_PAGE_WEBHOOK_VERIFY_TOKEN",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_APP_SECRET",
  "CHAKRA_WEBHOOK_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "SALES_AGENT_ENABLED",
  "SALES_AGENT_SEND_WHATSAPP",
  "SALES_AGENT_UPSERT_CONTACT",
  "SALES_AGENT_BRAND_NAME",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "AUTH_SECRET",
  "META_PAGE_ACCESS_TOKEN",
  "WHATSAPP_REDIRECT_URL",
  "DM_BRIDGE_ENABLED",
  "DM_BRIDGE_OPENAI_MODEL",
  "DM_BRIDGE_SYSTEM_PROMPT_APPEND",
  "DM_BRIDGE_BRAND_NAME",
  "META_COMMENT_SUGGEST_MODEL",
  "META_COMMENT_SUGGEST_BRAND",
];

/** Preview env in Vercel CLI requires a git branch (or use Dashboard → Preview → “All branches”). */
const TARGETS = ["production"];

function runVercelEnvAdd(name, target, value) {
  execFileSync(
    process.execPath,
    [
      vercelCli,
      "--non-interactive",
      "env",
      "add",
      name,
      target,
      "--value",
      value,
      "--yes",
      "--sensitive",
      "--force",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, CI: "1" },
    },
  );
}

for (const name of KEYS) {
  const value = process.env[name];
  if (value === undefined || String(value).trim() === "") continue;
  for (const target of TARGETS) {
    console.log(`Setting ${name} for ${target}…`);
    runVercelEnvAdd(name, target, value);
  }
}

console.log("Done. Redeploy or wait for the next git push so functions pick up new env.");
