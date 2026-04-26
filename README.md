# Chakra App (Next.js 15)

**Chakra App** is a production-oriented dashboard for storing Click-to-WhatsApp (YCloud) sessions, recording orders in **Neon Postgres** via **Drizzle**, and sending **Purchase** events to **Meta Conversions API** (Graph) from a Server Action.

Repository: [github.com/abdulahadghafoori-a11y/chakra-app](https://github.com/abdulahadghafoori-a11y/chakra-app)

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) database
- Meta **Dataset ID** (Events Manager) and **Access Token** with Conversions API permissions. For local/`next dev`, a **Test Event Code** (`META_TEST_EVENT_CODE`) is **required** so CAPI sends test events; production builds ignore it and send live **Purchase** events only. WABA is taken from each CTWA session when YCloud sends `wabaId`, with env fallback if needed

## Setup

1. **Install dependencies**

   ```bash
   cd chakra-app
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env.local` and set:

   - `DATABASE_URL` — Neon connection string (pooled URL is fine for serverless).
   - `META_ACCESS_TOKEN` — from Meta Business / System User.
   - `META_DATASET_ID` — the **Dataset ID** from Meta Events Manager (same value used in the CAPI `/{dataset-id}/events` path). If unset, `META_PIXEL_ID` is still read for backward compatibility (same numeric id).
   - `META_WHATSAPP_BUSINESS_ACCOUNT_ID` — optional **fallback** WABA if a CTWA session row has no `waba_id` (YCloud inbound normally stores `whatsappInboundMessage.wabaId` on each session).
   - `META_TEST_EVENT_CODE` — **required** when not in production (`next dev`): CAPI sends `TestEvent` with this code. In production (`NODE_ENV=production`) it is **not** read; CAPI sends live `Purchase` events only.
   - Optional: `YCLOUD_WEBHOOK_SECRET` — signing secret from [YCloud Webhooks](https://docs.ycloud.com/reference/configure-webhooks); if set, `POST /api/webhooks/ycloud` requires a valid `YCloud-Signature` header.

3. **Database schema**

   ```bash
   npx drizzle-kit migrate
   ```

   For a quick dev sync without migration files, you can use `npm run db:push` (use migrations for production).

4. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## GitHub

Remote for this project: `https://github.com/abdulahadghafoori-a11y/chakra-app.git`

If you are pushing for the first time:

```bash
git add -A
git commit -m "Initial commit: Chakra App"
git branch -M main
git remote add origin https://github.com/abdulahadghafoori-a11y/chakra-app.git
git push -u origin main
```

If `origin` already exists, point it at this repo:

```bash
git remote set-url origin https://github.com/abdulahadghafoori-a11y/chakra-app.git
git push -u origin main
```

SSH: `git@github.com:abdulahadghafoori-a11y/chakra-app.git`

## Vercel

1. Sign in at [vercel.com](https://vercel.com) and **Add New… → Project**.
2. **Import** the GitHub repository you just pushed (install the GitHub app if prompted).
3. **Framework:** Next.js (auto). **Root directory:** `./` (default). **Build:** `npm run build`, **Output:** Next default.
4. **Environment variables** — add the same keys as `.env.example` for **Production** (and Preview if you want previews to hit a DB):

   | Variable | Notes |
   |----------|--------|
   | `DATABASE_URL` | Neon pooled string (use a Neon *production* branch/database for prod). |
   | `META_ACCESS_TOKEN` | Meta system user token. |
   | `META_DATASET_ID` | Events Manager dataset id (CAPI). |
   | `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | Optional fallback if session has no `waba_id`. |
   | `META_TEST_EVENT_CODE` | Required for Preview/local dev (test events). Omit or unused in production. |
   | `YCLOUD_WEBHOOK_SECRET` | From YCloud Webhook endpoint (required if you enforce signatures). |

5. **Deploy.** After the first deploy, run migrations against the **production** database (from your machine with prod `DATABASE_URL`, or a one-off CI job):

   ```bash
   npm run db:migrate
   ```

6. **YCloud webhooks:** Set the endpoint URL to `https://<your-vercel-domain>/api/webhooks/ycloud` (see [YCloud webhooks](#ycloud-webhooks) below).

### Vercel CLI

After [`vercel login`](https://vercel.com/docs/cli/login), from the project root:

```bash
npm install
npx vercel link          # once: connect repo / project
npx vercel deploy --prod # production
npx vercel deploy        # preview deployment
```

Or use the scripts: `npm run vercel:deploy` / `npm run vercel:preview`. Copy env vars from `.env.local` into the Vercel project (**Settings → Environment Variables**) or use [`vercel env add`](https://vercel.com/docs/cli/env); secrets are not sent from your machine automatically.

**Sync `.env.local` → Vercel (production):** after `vercel login` and `vercel link`, run `npm run vercel:env:sync`. It uploads non-empty keys from [`.env.example`](.env.example) (`DATABASE_URL`, Meta, optional YCloud). **Preview deployments** need variables added separately in the Vercel UI (Preview → all branches) or `vercel env add NAME preview <git-branch>`, because the CLI requires a branch name for Preview.

## Routes

| Path | Purpose |
|------|---------|
| `/` | Recent orders (dashboard) |
| `/orders/new` | Create order + send CAPI Purchase |
| `/products` | Product list + create |
| `POST /api/webhooks/ycloud` | YCloud webhooks → `contacts` + `ctwa_sessions` |

### YCloud webhooks

1. In [YCloud Console](https://www.ycloud.com/console/) go to **Developers → Webhooks** → **Add endpoint** ([docs](https://docs.ycloud.com/reference/configure-webhooks)).
2. **URL:** `https://<your-production-domain>/api/webhooks/ycloud` (must be public HTTPS; use [ngrok](https://ngrok.com/) or similar for local testing: `https://<tunnel>.ngrok-free.app/api/webhooks/ycloud`).
3. Subscribe at minimum to:
   - `whatsapp.inbound_message.received` — stores CTWA rows when `referral.ctwa_clid` is present.
   - `contact.created` — upserts contacts (name, country, etc.).
4. Copy the endpoint **signing secret** into `YCLOUD_WEBHOOK_SECRET` in Vercel (or `.env.local`). Without the secret, the route accepts any POST (fine for dev only).

## YCloud → Meta

- This repo sends **Graph API** `/{dataset-id}/events` from `lib/meta-capi.ts` (same numeric id shown as Dataset ID in Events Manager).
- **Alternative:** route events through **YCloud Custom Event / forwarding** so YCloud calls Meta and this app only stores orders — see comments in `lib/meta-capi.ts` and the webhook route.

## shadcn/ui

Components live under `components/ui`. Add more with:

```bash
npx shadcn@latest add <component>
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run db:generate` | Generate SQL migrations from `drizzle/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:push` | Push schema (dev convenience) |
| `npm run db:studio` | Drizzle Studio |
