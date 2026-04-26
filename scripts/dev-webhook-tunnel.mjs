/**
 * Exposes local Next.js to HTTPS for Meta/Chakra webhooks using Cloudflare Tunnel (quick tunnel).
 *
 * 1. Terminal A: npm run dev
 * 2. Terminal B: npm run tunnel
 * 3. Copy the printed https://*.trycloudflare.com URL → Meta callback:
 *    https://<host>/api/webhooks/whatsapp
 * 4. Use the same META_WHATSAPP_VERIFY_TOKEN / META_APP_SECRET (or CHAKRA_*) as in .env.local
 *
 * Safer local dev: point DATABASE_URL at a Neon *branch* or separate DB, not production.
 * When finished, set the Meta webhook back to your Vercel URL.
 */
import { spawn } from "node:child_process";

const port = process.env.PORT?.trim() || "3000";
const target = `http://127.0.0.1:${port}`;

console.log(`
[dev-webhook-tunnel] Starting Cloudflare quick tunnel → ${target}
[dev-webhook-tunnel] Webhook URL will be: https://<shown-below>/api/webhooks/whatsapp
[dev-webhook-tunnel] Install cloudflared if this fails:
  Windows: winget install --id Cloudflare.cloudflared
  macOS:   brew install cloudflared
  Docs:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
`);

const child = spawn("cloudflared", ["tunnel", "--url", target], {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (err) => {
  if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") {
    console.error(
      "\n[dev-webhook-tunnel] cloudflared not found on PATH. Install it (see links above), open a new terminal, retry.\n",
    );
    process.exit(1);
  }
  throw err;
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
