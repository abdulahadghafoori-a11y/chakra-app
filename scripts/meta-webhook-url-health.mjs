/**
 * DNS + HTTPS probe for META_PAGE_WEBHOOK_CALLBACK_URL.
 * Uses Node (OpenSSL), not Windows curl/Schannel — avoids common SEC_E_ILLEGAL_MESSAGE quirks.
 *
 *   npm run meta:webhook-health
 *
 * Expect GET → 403 Forbidden (Next route without hub.verify_token). 522 = tunnel/down.
 */

import { config } from "dotenv";
import dns from "node:dns/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
config({ path: resolve(root, ".env.local"), override: true });
config({ path: resolve(root, ".env"), override: false });

const rawUrl = process.env.META_PAGE_WEBHOOK_CALLBACK_URL?.trim();
const timeoutMs = Number(process.env.META_WEBHOOK_HEALTH_TIMEOUT_MS ?? 25000);

async function main() {
  if (!rawUrl) {
    console.error(
      "Set META_PAGE_WEBHOOK_CALLBACK_URL in .env.local (full URL ending in /api/webhooks/meta).",
    );
    process.exit(1);
  }

  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    console.error("META_PAGE_WEBHOOK_CALLBACK_URL is not a valid URL:", rawUrl);
    process.exit(1);
  }

  if (u.protocol !== "https:") {
    console.error("Use https:// for META_PAGE_WEBHOOK_CALLBACK_URL.");
    process.exit(1);
  }

  const host = u.hostname;
  console.log("URL:", rawUrl);
  console.log("Host:", host);

  try {
    const v4 = await dns.lookup(host, { family: 4 });
    console.log("DNS A (IPv4):", v4.address);
  } catch (e) {
    console.log("DNS A (IPv4):", e.code ?? e.message);
  }

  try {
    const v6 = await dns.lookup(host, { family: 6 });
    console.log("DNS AAAA (IPv6):", v6.address);
  } catch (e) {
    console.log("DNS AAAA (IPv6):", e.code ?? e.message);
  }

  console.log("\nGET (no verify_token) …");
  try {
    const res = await fetch(rawUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "*/*", "User-Agent": "chakra-app/meta-webhook-health" },
    });
    const bodyPeek = await res.text();
    const clip = bodyPeek.slice(0, 200).replace(/\s+/g, " ").trim();

    console.log("HTTP status:", res.status, res.statusText);
    if (clip) console.log("Body (clip):", clip);

    if (res.status === 403) {
      console.log(
        "\nOK — 403 Forbidden is expected for GET without Meta hub.verify_token (route is reachable).",
      );
      return;
    }
    if (res.status >= 300 && res.status < 400) {
      console.warn("\nUnexpected redirect — check Cloudflare / tunnel hostname.");
      process.exitCode = 1;
      return;
    }
    if (res.status === 522 || res.status === 521 || res.status === 523) {
      console.warn("\nCloudflare cannot reach origin — run cloudflared + npm run dev on port 3000.");
      process.exitCode = 1;
      return;
    }
    console.warn("\nUnexpected status — inspect Cloudflare SSL mode and tunnel ingress hostname.");
    process.exitCode = 1;
  } catch (e) {
    const msg = String(e?.cause?.message ?? e?.message ?? e);
    console.error("Request failed:", msg);

    if (/getaddrinfo|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
      console.error(`
Hints:
  • ENOTFOUND: set Windows DNS to 8.8.8.8 / 1.1.1.1 on your adapter, then: ipconfig /flushdns
  • ETIMEDOWN / timeout: tunnel down or firewall blocking outbound 443`);
    }
    if (/certificate|TLS|SSL|UNABLE_TO_VERIFY/i.test(msg)) {
      console.error(`
Hints:
  • Try from another network or disable AV "HTTPS scanning"
  • Cloudflare SSL/TLS → Full (not Flexible) for tunnel backends`);
    }

    process.exit(1);
  }
}

main();
