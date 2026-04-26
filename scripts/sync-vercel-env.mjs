/**
 * Pushes non-empty variables from .env.local to Vercel (production + preview).
 * Usage: node scripts/sync-vercel-env.mjs
 * Requires: linked project (`npx vercel link`), `npx vercel login`
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
  "META_ACCESS_TOKEN",
  "META_DATASET_ID",
  "META_WHATSAPP_BUSINESS_ACCOUNT_ID",
  "META_TEST_EVENT_CODE",
  "META_WHATSAPP_VERIFY_TOKEN",
  "META_APP_SECRET",
  "CHAKRA_WEBHOOK_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "SALES_AGENT_ENABLED",
  "SALES_AGENT_SEND_WHATSAPP",
  "SALES_AGENT_UPSERT_CONTACT",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
];

/** Preview env in Vercel CLI requires a git branch (or use Dashboard → Preview → “All branches”). */
const TARGETS = ["production"];

function runVercelEnvAdd(name, target, value) {
  execFileSync(
    process.execPath,
    [
      vercelCli,
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
    { cwd: root, stdio: "inherit", env: process.env },
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
