# Haleboy Tattoos

Website for Haleboy (@haleboy.tattoos) at I Love You Tattoo, Maryville, TN. It is built with Astro and the Cloudflare adapter.

- **Public page** (`/`): hero, Instagram work grid, flash sheet, about, and booking (an embedded Jotform).
- **Admin** (`/admin`): gallery, flash sheet, featured pieces, site text (about, deposit, address, phone, hours), portrait, and Instagram status. It is protected by Cloudflare Access.
- **Data**: D1 (`DB`) holds metadata, R2 (`MEDIA`) holds images, KV (`IG_CACHE`) holds the Instagram feed, status and token, and the Images binding (`IMAGES`) resizes uploads.
- **Hourly Instagram sync**: `workers/ig-cron`, a separate Worker with a Cron Trigger.

> **Workers, not Pages.** `@astrojs/cloudflare` v14 deploys a **Worker with static assets** (the successor to Pages). Pages Functions can't run Cron Triggers. So the commands below are `wrangler deploy` and `wrangler secret put`, not `wrangler pages ...`.

## Local development

```sh
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev                      # http://localhost:4321
```

`.dev.vars` is gitignored. Create it in `site/` with these names:

```ini
# Used by the code
ACCESS_TEAM_DOMAIN=
ACCESS_AUD=
ADMIN_EMAIL=
IG_INITIAL_TOKEN=
DEV_ADMIN_BYPASS=
# Declared in src/env.d.ts but not read by any code yet (see the notes below)
IG_APP_ID=
IG_APP_SECRET=
JOTFORM_API_KEY=
JOTFORM_FORM_ID=
```

- **`DEV_ADMIN_BYPASS`**: any non-empty value skips the Access check for `/admin` and `/api/admin/*`, but only under `astro dev` (`import.meta.env.DEV`). It has no effect in a production build. The admin email then becomes `ADMIN_EMAIL`, or `dev@localhost` if that is empty.
- **Seed**: `scripts/seed.sql` adds 6 featured and 5 flash placeholder rows, each with no image, and only when the table is empty. Running it against production is safe.
- **Other scripts**: `npm run check` (types), `npm test` (Vitest), `npm run build`, `npm run types` (regenerates `worker-configuration.d.ts` from `wrangler.toml`).

### Running the cron worker locally

The cron worker has its own config. Point it at the site's local state so it writes into the same D1, R2 and KV that `npm run dev` reads:

```sh
npx wrangler dev --config workers/ig-cron/wrangler.toml --test-scheduled --persist-to .wrangler/state
# in another terminal:
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

The cron worker reads only `IG_INITIAL_TOKEN`. Put it in `workers/ig-cron/.dev.vars`, because wrangler reads `.dev.vars` next to the config file. You can also press **Refresh now** on `/admin/instagram`, which runs the same sync inside the site.

## Cloudflare setup

Run these from `site/` after `npx wrangler login`.

1. **D1**
   ```sh
   npx wrangler d1 create haleboy
   ```
   Copy the `database_id` into `[[d1_databases]]` in **both** `wrangler.toml` and `workers/ig-cron/wrangler.toml`. Then:
   ```sh
   npm run db:migrate:remote
   npm run db:seed:remote     # optional placeholders
   ```
2. **R2**
   ```sh
   npx wrangler r2 bucket create haleboy-media
   ```
   Buckets use a name, not an ID. Both configs already say `haleboy-media`. The bucket stays private. Images are served through `/img/<key>`, which only allows the resized `.webp` and `.avif` variants.
3. **KV**
   ```sh
   npx wrangler kv namespace create IG_CACHE
   ```
   Copy the `id` into `[[kv_namespaces]]` in **both** configs.
4. **Images**: enable Cloudflare Images on the account. The `[images] binding = "IMAGES"` block needs no ID.
5. **Site Worker**: there is no Pages project to create. The first `wrangler deploy` (see [Deploying](#deploying)) creates the Worker `haleboy-tattoos`. Add your domain under **Workers & Pages → haleboy-tattoos → Settings → Domains & Routes**, then update `site` in `astro.config.mjs`.
6. **Cron worker**: deploy it with `npm run deploy:ig-cron`. This creates `haleboy-ig-cron` with the hourly trigger `0 * * * *`. It has `workers_dev = false`, so it has no public URL.

Note: the adapter also adds a `SESSION` KV binding to the generated config (Astro sessions). The code doesn't use it. If `wrangler deploy` asks about it, let wrangler provision it.

## Cloudflare Access (admin login)

The middleware (`src/middleware.ts`) checks every `/admin*` and `/api/admin/*` request. `src/lib/access.ts` verifies the `Cf-Access-Jwt-Assertion` header: the RS256 signature against `https://<team>/cdn-cgi/access/certs`, the `aud`, the `iss`, the `exp`, and that `email` matches `ADMIN_EMAIL`. Anything else gets a 403. The Instagram admin routes run the same check again.

1. Open the Cloudflare dashboard, then **Zero Trust**. The first time, pick a team name. Your team domain is `<team>.cloudflareaccess.com`.
2. **Settings → Authentication → Login methods**: make sure **One-time PIN** is enabled.
3. **Access → Applications → Add an application → Self-hosted.**
   - Name: `Haleboy admin`.
   - Add these public hostnames on the site's domain: path `admin*` and path `api/admin/*`.
   - Login methods: One-time PIN only.
4. Add a policy: action **Allow**, include **Emails** with his email address only.
5. Save. On the application's **Overview** (or Basic information) tab, copy the **Application Audience (AUD) Tag** into `ACCESS_AUD`.
6. Set `ACCESS_TEAM_DOMAIN` to `<team>.cloudflareaccess.com`, without `https://`, and set `ADMIN_EMAIL` to the same address as the policy.

Access only covers the custom domain. A request through the `*.workers.dev` URL has no JWT, so the server-side check rejects it.

Sign out is `/cdn-cgi/access/logout`, linked at the bottom of `/admin`.

## Instagram (Meta app) setup

The sync uses only the **Instagram API with Instagram Login** (`graph.instagram.com`). It does not use the Basic Display API, which is shut down.

1. **Switch the account to Creator or Business.** In the Instagram app, go to Settings → Account type and tools → Switch to professional account.
2. **Create a Meta app.** Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) → Create app → use case **Manage messaging & content on Instagram** (type Business). Add the product **Instagram → API setup with Instagram login**.
3. **Add the permission `instagram_business_basic`.** It is enough to read his own media. The app can stay in development mode, because it only reads the account that owns it or is a tester on it.
4. **Add the account and generate a token.** Under *API setup with Instagram login → Generate access tokens*, click **Add account** and log in as @haleboy.tattoos. If he isn't an app admin, first add him under **App roles → Roles → Instagram Testers** and accept the invite in Instagram (Settings → Website permissions → Apps and websites → Tester invites). Then click **Generate token**.
5. **Exchange it for a long-lived token.** The dashboard token is usually already long-lived (60 days). If you have a short-lived one, exchange it:
   ```sh
   curl "https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=<IG_APP_SECRET>&access_token=<SHORT_TOKEN>"
   ```
   The response's `access_token` is the long-lived token.
6. **Set the secrets** (see [Secrets](#secrets)). Set `IG_INITIAL_TOKEN` on **both** Workers. You can also set `IG_APP_ID` and `IG_APP_SECRET` on the site to keep them with the project, but the code doesn't read them today: the app secret is only needed for the manual exchange in step 5.

### How the token is kept alive (`src/lib/instagram.ts`)

- Each run uses the token stored in KV `ig:token`. If there is none, it uses `IG_INITIAL_TOKEN`.
- If the token has no known expiry (the initial secret) or expires within **20 days**, the run calls `GET /refresh_access_token?grant_type=ig_refresh_token`. It then stores the new token and its expiry in KV `ig:token`. Instagram won't refresh a token less than 24 hours old, so that error is ignored and retried the next hour.
- If Instagram answers with error 190 (expired or revoked), the run deletes `ig:token` and sets the status to `token_invalid`. **Fix:** generate a new token (steps 4 and 5) and `wrangler secret put IG_INITIAL_TOKEN` on both Workers. The next run, or **Retry now** in admin, picks it up.
- Each run fetches the latest 12 posts. Images use `media_url`, carousels use their first child, and videos use `thumbnail_url`. Each image is copied once to R2 at `ig/<id>/<width>.webp|avif`. The run writes KV `ig:feed` and `ig:status` and logs to D1 `ig_log`. Images of posts that left the feed are deleted.
- The public page reads only KV and R2. It never calls Instagram. If the feed is empty or missing, or the status is `token_invalid`, the work grid falls back to the featured pieces from admin.
- `/admin/instagram` shows the status, token expiry and the last 10 runs. **Refresh now** / **Retry now** (`POST /api/admin/instagram/refresh`) runs the sync immediately.

## Jotform booking

The booking section **embeds** the shop's form `250787056108157` ("Tattoo Appointment Request") in an iframe, with `?whoWould=Eathan` to pre-select him. A native form posted to the API was not possible because the form has four file-upload fields, and the Jotform API can't take file uploads. See `docs/jotform-report.md`.

- **No API key is used.** Bookings are managed by the shop in its own Jotform inbox. `JOTFORM_API_KEY` and `JOTFORM_FORM_ID` are declared in `src/env.d.ts` but nothing reads them. The form ID is the `FORM_ID` constant in `src/components/BookingForm.astro`.
- **Styling:** CSS on our page can't reach inside the iframe. The theme is `public/jotform-theme.css`, which you paste into Jotform's Form Designer (**Styles → Inject custom CSS**). Injected CSS also restyles the shop's own booking page, so agree with the shop first. Don't clone the form: a clone has its own inbox, and bookings must land in the shop's existing one. The full steps are in `docs/jotform-theme.md`.
- **Preview** without touching Jotform: run `node docs/preview/serve.mjs`, then open `http://localhost:4321/form`.

## Secrets

Production secrets are set with wrangler and never committed. Locally, use `.dev.vars`.

```sh
# Site Worker (haleboy-tattoos)
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put IG_INITIAL_TOKEN
npx wrangler secret put IG_APP_ID        # optional, unused by code
npx wrangler secret put IG_APP_SECRET    # optional, unused by code

# Cron Worker (haleboy-ig-cron)
npx wrangler secret put IG_INITIAL_TOKEN --config workers/ig-cron/wrangler.toml
```

| Name | Site | Cron | Read by |
|---|---|---|---|
| `ACCESS_TEAM_DOMAIN` | yes | no | `src/lib/access.ts` |
| `ACCESS_AUD` | yes | no | `src/lib/access.ts` |
| `ADMIN_EMAIL` | yes | no | `src/lib/access.ts`, middleware |
| `IG_INITIAL_TOKEN` | yes | yes | `src/lib/instagram.ts` |
| `DEV_ADMIN_BYPASS` | local only | no | middleware, Instagram admin routes |
| `IG_APP_ID`, `IG_APP_SECRET` | optional | no | nothing yet |
| `JOTFORM_API_KEY`, `JOTFORM_FORM_ID` | no | no | nothing (the form is embedded) |

Never set `DEV_ADMIN_BYPASS` in production. It is ignored there anyway.

## Deploying

```sh
npm run check && npm test
npm run build
npx wrangler deploy          # site Worker; uses the config the build generates in dist/server
npm run deploy:ig-cron       # cron Worker, only when src/lib/instagram.ts or its imports change
npm run db:migrate:remote    # only when migrations/ changes
```

Admin changes (uploads, edits, reordering) go straight to D1 and R2. They show on the live page without a rebuild.
