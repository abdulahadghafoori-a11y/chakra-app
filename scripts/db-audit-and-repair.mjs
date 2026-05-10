/**
 * Audit & repair DB data for current schema conventions.
 * Run: npm run db:repair  (or: node scripts/db-audit-and-repair.mjs)
 *
 * - contacts.phone_number → E.164
 * - orders.contact_id aligned with ctwa_sessions when ctwa_session_id is set
 * - order_items.line_value = round(unit_sale_price * quantity, 4)
 * - invalid orders.ctwa_session_id cleared
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

import { resolvedDatabaseUrlFromEnv } from "./resolve-database-url.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });
config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const require = createRequire(import.meta.url);
const parsePhoneNumberFromString = require("libphonenumber-js/max");

function envDefaultCountry() {
  const c = (
    process.env.PHONE_DEFAULT_COUNTRY ??
    process.env.NEXT_PUBLIC_PHONE_DEFAULT_COUNTRY
  )
    ?.trim()
    .toUpperCase();
  if (!c || c.length !== 2) return undefined;
  return c;
}

function asCountryCode(v) {
  if (!v || v.length !== 2) return undefined;
  return String(v).toUpperCase();
}

function parseToE164ForDb(raw, hintCountry) {
  const trimmed = String(raw ?? "").trim().replace(/\s/g, "");
  if (!trimmed) return null;

  let parsed = parsePhoneNumberFromString(trimmed);
  if (parsed?.isValid()) return parsed.format("E.164");

  const hint = asCountryCode(hintCountry);
  if (hint) {
    parsed = parsePhoneNumberFromString(trimmed, hint);
    if (parsed?.isValid()) return parsed.format("E.164");
  }

  const dc = envDefaultCountry();
  if (dc) {
    parsed = parsePhoneNumberFromString(trimmed, dc);
    if (parsed?.isValid()) return parsed.format("E.164");
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits) {
    parsed = parsePhoneNumberFromString(`+${digits}`);
    if (parsed?.isValid()) return parsed.format("E.164");
  }

  return null;
}

let url;
try {
  url = resolvedDatabaseUrlFromEnv();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const sql = neon(url);

async function main() {
  console.log("=== DB audit & repair ===\n");

  const counts = await sql`
    SELECT
      (SELECT count(*)::int FROM contacts) AS contacts,
      (SELECT count(*)::int FROM ctwa_sessions) AS ctwa_sessions,
      (SELECT count(*)::int FROM orders) AS orders,
      (SELECT count(*)::int FROM order_items) AS order_items,
      (SELECT count(*)::int FROM products) AS products
  `;
  console.log("Row counts:", counts[0]);

  let phonesUpdated = 0;
  const phoneConflicts = [];

  const allContacts = await sql`SELECT id, phone_number, country_code FROM contacts`;
  for (const c of allContacts) {
    const hint = c.country_code;
    let e164 = parseToE164ForDb(c.phone_number, hint);
    if (!e164) {
      const digits = String(c.phone_number).replace(/\D/g, "");
      if (digits) e164 = parseToE164ForDb(`+${digits}`, hint);
    }
    if (!e164) {
      console.warn(
        `[contacts] ${c.id}: cannot parse phone "${c.phone_number}" — skipped`,
      );
      continue;
    }
    if (e164 === c.phone_number) continue;

    const [other] = await sql`
      SELECT id FROM contacts WHERE phone_number = ${e164} LIMIT 1
    `;
    if (other && other.id !== c.id) {
      phoneConflicts.push({
        id: c.id,
        from: c.phone_number,
        to: e164,
        blocks: other.id,
      });
      continue;
    }

    await sql`
      UPDATE contacts SET phone_number = ${e164} WHERE id = ${c.id}
    `;
    phonesUpdated++;
    console.log(`[contacts] ${c.id}: "${c.phone_number}" → "${e164}"`);
  }

  const misaligned = await sql`
    SELECT o.id AS order_id, s.contact_id AS session_contact
    FROM orders o
    INNER JOIN ctwa_sessions s ON s.id = o.ctwa_session_id
    WHERE o.contact_id IS DISTINCT FROM s.contact_id
  `;
  for (const row of misaligned) {
    await sql`
      UPDATE orders SET contact_id = ${row.session_contact}
      WHERE id = ${row.order_id}
    `;
    console.log(
      `[orders] ${row.order_id}: contact_id → ${row.session_contact}`,
    );
  }
  if (misaligned.length > 0) {
    console.log(`\n[orders] aligned contact_id on ${misaligned.length} row(s)`);
  }

  const lineFixed = await sql`
    UPDATE order_items
    SET line_value = round(unit_sale_price * quantity::numeric, 4)
    WHERE round(line_value, 4) <> round(unit_sale_price * quantity::numeric, 4)
    RETURNING order_id, line_index
  `;
  if (lineFixed.length > 0) {
    console.log(`\n[order_items] fixed line_value on ${lineFixed.length} row(s)`);
  }

  if (phoneConflicts.length > 0) {
    console.log("\n--- Phone E.164 conflicts (manual merge required) ---");
    for (const x of phoneConflicts) {
      console.log(
        `  contact ${x.id}: "${x.from}" would become "${x.to}" but ${x.blocks} already has that number`,
      );
    }
  }

  const orphanSessions = await sql`
    SELECT cs.id FROM ctwa_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    WHERE c.id IS NULL
  `;
  if (orphanSessions.length > 0) {
    console.warn("\n[integrity] ctwa_sessions with missing contact:", orphanSessions);
  }

  const orphanOrdersContact = await sql`
    SELECT o.id FROM orders o
    LEFT JOIN contacts c ON c.id = o.contact_id
    WHERE c.id IS NULL
  `;
  if (orphanOrdersContact.length > 0) {
    console.warn("\n[integrity] orders with missing contact:", orphanOrdersContact);
  }

  const orphanSessionFk = await sql`
    SELECT o.id FROM orders o
    LEFT JOIN ctwa_sessions s ON s.id = o.ctwa_session_id
    WHERE o.ctwa_session_id IS NOT NULL AND s.id IS NULL
  `;
  if (orphanSessionFk.length > 0) {
    console.warn(
      "\n[integrity] orders.ctwa_session_id points to missing session — clearing FK",
    );
    for (const row of orphanSessionFk) {
      await sql`UPDATE orders SET ctwa_session_id = NULL WHERE id = ${row.id}`;
      console.log(`  cleared ctwa_session_id on order ${row.id}`);
    }
  }

  const orphanItems = await sql`
    SELECT oi.order_id FROM order_items oi
    LEFT JOIN orders o ON o.id = oi.order_id
    WHERE o.id IS NULL
  `;
  if (orphanItems.length > 0) {
    console.warn("\n[integrity] order_items with missing order:", orphanItems);
  }

  console.log("\n=== Summary ===");
  console.log(`contacts phone E.164 updates: ${phonesUpdated}`);
  console.log(`phone conflicts (not updated): ${phoneConflicts.length}`);
  console.log(`orders contact aligned: ${misaligned.length}`);
  console.log(`order_items line_value fixed: ${lineFixed.length}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
