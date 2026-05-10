/**
 * Resolve the Conversions API dataset ID bound to a WhatsApp Business Account (fixes CTWA
 * error_subcode 2804118 — dataset ↔ WABA mismatch).
 *
 *   npm run meta:waba-dataset
 *   npm run meta:waba-dataset -- 1699456911242528
 *
 * Reads META_ACCESS_TOKEN + META_WHATSAPP_BUSINESS_ACCOUNT_ID from .env.local.
 * Uses META_GRAPH_VERSION (default v25.0) to match lib/meta-capi.ts.
 *
 * Strategy: GET /{waba-id}/dataset → if missing or error → POST …/dataset
 * (Meta returns an existing canonical id when one is already bound).
 *
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
config({ path: resolve(root, ".env.local"), override: true });
config({ path: resolve(root, ".env"), override: false });

const GRAPH =
  process.env.META_GRAPH_VERSION?.trim().replace(/^=+/, "") || "v25.0";

/** Collect numeric Meta dataset IDs from heterogeneous Graph payloads. */
function extractDatasetIds(obj) {
  if (!obj || typeof obj !== "object") return [];
  const ids = [];
  const push = (s) => {
    const x = typeof s === "string" ? s.trim() : "";
    if (/^\d+$/.test(x)) ids.push(x);
  };
  push(obj.id);
  if (typeof obj.dataset_id === "string") push(obj.dataset_id);

  const dataArr = Array.isArray(obj.data) ? obj.data : [];
  for (const row of dataArr) {
    if (row && typeof row === "object") {
      push(row.id);
      if (typeof row.dataset_id === "string") push(row.dataset_id);
    }
  }
  return [...new Set(ids)];
}

function datasetUrl(wabaId, token) {
  const q = encodeURIComponent(token);
  return `https://graph.facebook.com/${GRAPH}/${wabaId}/dataset?access_token=${q}`;
}

async function fetchJson(method, url) {
  const res = await fetch(url, { method });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _nonJson: text?.slice(0, 900) ?? "" };
  }
  return { res, json };
}

async function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("-"));
  const waba =
    positional[0]?.trim() ||
    process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID?.trim().replace(/^=+/, "") ||
    "";
  const token = process.env.META_ACCESS_TOKEN?.trim();

  if (!waba || !/^\d+$/.test(waba)) {
    console.error(
      "Pass WABA id as argument or set META_WHATSAPP_BUSINESS_ACCOUNT_ID in .env.local (digits only).",
    );
    process.exit(1);
  }
  if (!token) {
    console.error(
      "Set META_ACCESS_TOKEN in .env.local (needs Graph access to this WABA).",
    );
    process.exit(1);
  }

  const url = datasetUrl(waba, token);
  console.log(`GET Graph ${GRAPH} /${waba}/dataset\n`);

  const get = await fetchJson("GET", url);
  let ids = extractDatasetIds(get.json);

  if (!get.res.ok || ids.length === 0) {
    if (!get.res.ok) {
      console.error("GET result:", get.res.status);
      console.error(JSON.stringify(get.json, null, 2));
    } else if (ids.length === 0) {
      console.log("GET ok but no dataset id parsed:");
      console.log(JSON.stringify(get.json, null, 2));
    }
    console.log("\nPOST Graph …/dataset (create or return canonical id)\n");

    const post = await fetchJson("POST", url);
    if (!post.res.ok) {
      console.error("POST failed:", post.res.status);
      console.error(JSON.stringify(post.json, null, 2));
      process.exit(1);
    }
    ids = extractDatasetIds(post.json);
    if (ids.length === 0) {
      console.error(
        "POST ok but could not parse dataset id:",
        JSON.stringify(post.json, null, 2),
      );
      process.exit(1);
    }
  }

  const datasetId = ids[0];
  console.log(`\nMETA_DATASET_ID=${datasetId}`);
  console.log(`
Put that in .env.local, restart npm run dev (or redeploy), then retry CAPI.`);

  if (ids.length > 1) {
    console.warn("Multiple ids extracted; showing all:", ids);
  }
}

await main();
