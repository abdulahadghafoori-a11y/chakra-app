/**
 * Exposes local Next.js to HTTPS for Meta/Chakra webhooks using Cloudflare Tunnel (quick tunnel).
 *
 * 1. Terminal A: npm run dev
 * 2. Terminal B: npm run tunnel
 * 3. Copy the printed https://*.trycloudflare.com URL → Meta callbacks:
 *    https://<host>/api/webhooks/meta
 *    https://<host>/api/webhooks/whatsapp
 * 4. Update META_PAGE_WEBHOOK_CALLBACK_URL (and Meta Dashboard) whenever this hostname changes.
 * 5. Webhook POST logs (META_WEBHOOK_DEBUG) appear in Terminal A (next dev), not here.
 *
 * Override binary: CLOUDFLARED_PATH=C:\path\to\cloudflared.exe
 *
 * Safer local dev: point DATABASE_URL at a Neon *branch* or separate DB, not production.
 * When finished, set the Meta webhook back to your Vercel URL.
 *
 * Stable hostname (same URL every run): use a named Cloudflare tunnel + config.yml — see
 * scripts/cloudflared-named-tunnel.config.example.yml
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
config({ path: path.resolve(root, ".env.local"), override: true });
config({ path: path.resolve(root, ".env"), override: false });

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
[dev-webhook-tunnel] Callback bases (same host):
    Meta Page + Instagram + Messenger-style: https://<shown-below>/api/webhooks/meta
    WhatsApp:                                  https://<shown-below>/api/webhooks/whatsapp
[dev-webhook-tunnel] POST logs (META_WEBHOOK_DEBUG) print in the terminal running "npm run dev", not here.
[dev-webhook-tunnel] Quick tunnels get a NEW hostname each run — update Meta Dashboard + META_PAGE_WEBHOOK_CALLBACK_URL.
[dev-webhook-tunnel] If this fails, install cloudflared and/or set CLOUDFLARED_PATH:
  Windows: winget install --id Cloudflare.cloudflared  (then new terminal, or we auto-detect Program Files)
  macOS:   brew install cloudflared
  Docs:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
`);

/** Compare tunnel hostname to META_PAGE_WEBHOOK_CALLBACK_URL once Cloudflare prints it. */
function warnIfMetaCallbackHostnameMismatch(tunnelOriginHttps) {
  const configured = process.env.META_PAGE_WEBHOOK_CALLBACK_URL?.trim();
  let tunHost = "";
  try {
    tunHost = new URL(tunnelOriginHttps).host;
  } catch {
    return;
  }
  if (!configured) {
    console.log(
      `\n[dev-webhook-tunnel] Set META_PAGE_WEBHOOK_CALLBACK_URL=${tunnelOriginHttps}/api/webhooks/meta`,
      "\n            then paste the same URL in Meta → Webhooks (Page + Instagram).\n",
    );
    return;
  }
  try {
    const cfgHost = new URL(configured).host;
    if (cfgHost !== tunHost) {
      console.warn(
        "\n[dev-webhook-tunnel] WARNING: HOSTNAME MISMATCH — Meta will POST to the wrong host",
      );
      console.warn(`    This tunnel:              ${tunHost}`);
      console.warn(`    META_PAGE_WEBHOOK_CALLBACK_URL: ${cfgHost}`);
      console.warn(
        "    Fix: set META_PAGE_WEBHOOK_CALLBACK_URL to\n",
        `        ${tunnelOriginHttps}/api/webhooks/meta`,
        "\n    and the same URL in App Dashboard (Page + Instagram objects).\n",
      );
    } else {
      console.log(
        "\n[dev-webhook-tunnel] META_PAGE_WEBHOOK_CALLBACK_URL host matches this tunnel (OK).\n",
      );
    }
  } catch {
    console.warn(
      "\n[dev-webhook-tunnel] META_PAGE_WEBHOOK_CALLBACK_URL is set but not a valid URL — fix .env.local\n",
    );
  }
}

let stderrAcc = "";
let tunnelUrlAnnounced = false;

const child = spawn(cmd, ["tunnel", "--url", target], {
  stdio: ["inherit", "inherit", "pipe"],
  env: process.env,
  windowsHide: true,
});

child.stderr?.on("data", (chunk) => {
  process.stderr.write(chunk);
  if (tunnelUrlAnnounced) return;
  stderrAcc += chunk.toString();
  const m = stderrAcc.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (m) {
    tunnelUrlAnnounced = true;
    warnIfMetaCallbackHostnameMismatch(m[0]);
  }
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
