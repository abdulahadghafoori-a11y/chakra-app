# Chakra App (Next.js 15)

**Chakra App** (this repository’s product name only) is a dashboard for Click-to-WhatsApp (CTWA) sessions ingested **directly from Meta**: subscribe to webhooks on **your Meta app** (WhatsApp product) and point the callback URL at this service. Payloads follow [Meta’s WhatsApp webhook reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components) (`whatsapp_business_account` + `messages`). There is **no** YCloud, pass-through vendor, or alternate webhook format in this codebase.

Orders are stored in **Neon Postgres** via **Drizzle**; **Purchase** events go to **Meta Conversions API** (Graph) from a Server Action.

Repository: [github.com/abdulahadghafoori-a11y/chakra-app](https://github.com/abdulahadghafoori-a11y/chakra-app)

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) database
- Meta **Dataset ID** (Events Manager) and **Access Token** with Conversions API permissions. For local/`next dev`, a **Test Event Code** (`META_TEST_EVENT_CODE`) is **required** so CAPI sends test events; production builds ignore it and send live **Purchase** events only. WABA is stored on each CTWA session from webhook `entry.id`, with env fallback if needed.

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
   - `META_WABA_ACCOUNTS` — JSON array of WhatsApp business lines (`id`, `label`, `datasetId`, `phoneNumberId`). Run `npm run meta:waba-dataset -- <WABA_ID>` per account to resolve `datasetId`. Staff pick the line in **Create order** when there is no CTWA session or no `ctwa_clid`.
   - `META_TEST_EVENT_CODE` — **required** when not in production (`next dev`): CAPI sends `TestEvent` with this code. In production (`NODE_ENV=production`) it is **not** read; CAPI sends live `Purchase` events only.
   - `META_WHATSAPP_VERIFY_TOKEN` — string you choose; Meta sends it on webhook **GET** verification.
   - `META_APP_SECRET` — Meta App Secret; when set, **POST** webhooks must include a valid `X-Hub-Signature-256` (`sha256=…` HMAC of the raw body). Omit in local dev only if you accept unsigned POSTs.

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
   | `META_WABA_ACCOUNTS` | JSON array — one entry per WhatsApp Business Account (CAPI dataset + outbound phone id). |
   | `META_TEST_EVENT_CODE` | Required for Preview/local dev (test events). Omit or unused in production. |
   | `META_WHATSAPP_VERIFY_TOKEN` | Webhook GET verification. |
   | `META_APP_SECRET` | Webhook POST signature verification (recommended in production). |

5. **Deploy.** After the first deploy, run migrations against the **production** database (from your machine with prod `DATABASE_URL`, or a one-off CI job):

   ```bash
   npm run db:migrate
   ```

6. **WhatsApp webhooks:** In Meta App Dashboard → WhatsApp → Configuration, set the callback URL to `https://<your-vercel-domain>/api/webhooks/whatsapp` and the verify token to `META_WHATSAPP_VERIFY_TOKEN`. Subscribe to **`messages`** (see [Meta webhooks](#meta-whatsapp-webhooks) below).

### Vercel CLI

After [`vercel login`](https://vercel.com/docs/cli/login), from the project root:

```bash
npm install
npx vercel link          # once: connect repo / project
npx vercel deploy --prod # production
npx vercel deploy        # preview deployment
```

Or use the scripts: `npm run vercel:deploy` / `npm run vercel:preview`. Copy env vars from `.env.local` into the Vercel project (**Settings → Environment Variables**) or use [`vercel env add`](https://vercel.com/docs/cli/env); secrets are not sent from your machine automatically.

**Sync `.env.local` → Vercel (production):** after `vercel login` and `vercel link`, run `npm run vercel:env:sync`. It uploads non-empty keys from [`.env.example`](.env.example). **Preview deployments** need variables added separately in the Vercel UI (Preview → all branches) or `vercel env add NAME preview <git-branch>`, because the CLI requires a branch name for Preview.

## Routes

| Path | Purpose |
|------|---------|
| `/` | Recent orders (dashboard) |
| `/orders/new` | Create order + send CAPI Purchase |
| `/products` | Product list + create |
| `GET/POST /api/webhooks/whatsapp` | Meta WhatsApp Cloud API — verify + `messages` → `contacts` + `ctwa_sessions` (when `ctwa_clid` present) |

### Meta WhatsApp webhooks (direct)

Configure in **[Meta for Developers](https://developers.facebook.com/)** → your app → **WhatsApp** → **Configuration** (not a third-party “pass-through” URL unless you intentionally proxy Meta’s raw POST yourself).

1. **Callback URL:** `https://<your-domain>/api/webhooks/whatsapp` (public HTTPS; use [ngrok](https://ngrok.com/) for local testing).
2. **Verify token:** must match `META_WHATSAPP_VERIFY_TOKEN` (you define it in Meta and in `.env`).
3. **Webhook fields:** subscribe to **`messages`** on the WhatsApp Business Account object. Other fields (`message_template_sends`, etc.) are ignored by this route but Meta may still send them if selected.
4. **Signature:** set `META_APP_SECRET` to your Meta **App Secret** so `X-Hub-Signature-256` is verified on POST.
5. **Behavior:** For each inbound **messages** payload with a **`ctwa_clid`**, the app upserts **`contacts`** (phone = `wa_id` / `from` digits only, country via libphonenumber) and inserts **`ctwa_sessions`** with `waba_id` = `entry.id`, `phone_number_id` = `metadata.phone_number_id`, and referral fields. Messages without `ctwa_clid` return `ignored` and do not create contacts.

### Dual WhatsApp Business Accounts (Meta direct + Chakra)

Both lines can use the **same** callback URL: `GET/POST /api/webhooks/whatsapp`.

| Source | Configure | Env |
|--------|-----------|-----|
| Meta Cloud API (direct) | Meta Developers → WhatsApp → Configuration | `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` |
| Chakra Chat relay | Chakra dashboard webhook URL + secret | `CHAKRA_WEBHOOK_SECRET` |

Set **`META_WABA_ACCOUNTS`** with one object per line. Example after running `npm run meta:waba-dataset` for each WABA id:

```json
[
  { "id": "1949044442407684", "label": "Chakra main", "datasetId": "111", "phoneNumberId": "222" },
  { "id": "1699456911242528", "label": "Direct Meta", "datasetId": "333", "phoneNumberId": "444" }
]
```

Purchase CAPI posts to the **dataset** for the WABA on the order (`orders.capi_waba_id` or CTWA session when `ctwa_clid` is present).

## CAPI

- Purchase events use **Graph API** `/{dataset-id}/events` from `lib/meta-capi.ts`. The dataset id comes from `META_WABA_ACCOUNTS` for the chosen WABA (not a single global `META_DATASET_ID`).

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
