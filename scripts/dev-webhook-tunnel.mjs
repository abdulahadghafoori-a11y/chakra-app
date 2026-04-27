/**
 * Exposes local Next.js to HTTPS for Meta/Chakra webhooks using Cloudflare Tunnel (quick tunnel).
 *
 * 1. Terminal A: npm run dev
 * 2. Terminal B: npm run tunnel
 * 3. Copy the printed https://*.trycloudflare.com URL → Meta callback:
 *    https://<host>/api/webhooks/whatsapp
 * 4. Use the same META_WHATSAPP_VERIFY_TOKEN / META_APP_SECRET (or CHAKRA_*) as in .env.local
 *
 * Override binary: CLOUDFLARED_PATH=C:\path\to\cloudflared.exe
 *
 * Safer local dev: point DATABASE_URL at a Neon *branch* or separate DB, not production.
 * When finished, set the Meta webhook back to your Vercel URL.
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const port = process.env.PORT?.trim() || "3000";
const target = `http://127.0.0.1:${port}`;

function resolveCloudflaredCommand() {
  const fromEnv = process.env.CLOUDFLARED_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  if (process.platform === "win32") {
    const pf86 = process.env["ProgramFiles(x86)"];
    const pf = process.env.ProgramFiles;
    const candidates = [
      pf86 && path.join(pf86, "cloudflared", "cloudflared.exe"),
      pf && path.join(pf, "cloudflared", "cloudflared.exe"),
    ].filter(Boolean);

    for (const exe of candidates) {
      if (existsSync(exe)) {
        return exe;
      }
    }
  }

  return process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
}

const cmd = resolveCloudflaredCommand();

console.log(`
[dev-webhook-tunnel] Starting Cloudflare quick tunnel → ${target}
[dev-webhook-tunnel] Using: ${cmd}
[dev-webhook-tunnel] Webhook URL will be: https://<shown-below>/api/webhooks/whatsapp
[dev-webhook-tunnel] If this fails, install cloudflared and/or set CLOUDFLARED_PATH:
  Windows: winget install --id Cloudflare.cloudflared  (then new terminal, or we auto-detect Program Files)
  macOS:   brew install cloudflared
  Docs:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
`);

const child = spawn(cmd, ["tunnel", "--url", target], {
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});

child.on("error", (err) => {
  if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") {
    console.error(
      "\n[dev-webhook-tunnel] cloudflared not found. Install it (see above) or set CLOUDFLARED_PATH to the full path to cloudflared.exe\n",
    );
    process.exit(1);
  }
  throw err;
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
