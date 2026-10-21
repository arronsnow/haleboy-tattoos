# TODO

## Placeholders in the site

Found with `grep -rnE "\[[A-Z ]+\]" src`, plus seeded data and config.

| Placeholder | Where | Replace with |
|---|---|---|
| Deposit amount | `/admin/content` → Booking | Empty shows "A deposit holds your spot" |
| `[Placement]` ×6 | `scripts/seed.sql` → D1 `featured` rows | Edit or delete in `/admin/featured` |
| `[Name]`, `[PRICE]` ×5 | `scripts/seed.sql` → D1 `flash` rows | Edit or delete in `/admin/flash` |
| `https://haleboy.tattoo` | `astro.config.mjs` `site` (used for canonical and OG URLs) | The real production domain |
| `<your-site-domain>` | `docs/jotform-theme.md` (`@import` option) | The real production domain |

`[Flash design]` in `src/components/Flash.astro` is not a placeholder to fill in. It is the empty box shown for a flash row with no image yet.

## Manual setup

See `README.md` for the full steps.

### Cloudflare
- [ ] `npx wrangler login`
- [ ] Create D1 `haleboy`, then paste `database_id` into `wrangler.toml` **and** `workers/ig-cron/wrangler.toml`
- [ ] `npm run db:migrate:remote` (and optionally `npm run db:seed:remote`); this also applies `0002` (site text, gallery)
- [ ] Create R2 bucket `haleboy-media`
- [ ] Create KV namespace `IG_CACHE`, then paste `id` into both `wrangler.toml` files
- [ ] Enable Cloudflare Images on the account
- [ ] `npm run build && npx wrangler deploy` (creates Worker `haleboy-tattoos`)
- [ ] Attach the custom domain to `haleboy-tattoos`, then update `site` in `astro.config.mjs` and redeploy
- [ ] `npm run deploy:ig-cron` (creates `haleboy-ig-cron` with the hourly cron)

### Cloudflare Access
- [ ] Zero Trust: pick a team name and note `<team>.cloudflareaccess.com`
- [ ] Enable the One-time PIN login method
- [ ] Self-hosted application on the site domain, with paths `admin*` and `api/admin/*`
- [ ] Allow policy: his email only
- [ ] Copy the AUD tag
- [ ] `wrangler secret put` `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `ADMIN_EMAIL` (same email as the policy)
- [ ] Check: `/admin` asks for a PIN, and a different email is refused

### Instagram
- [ ] Switch @haleboy.tattoos to a Creator or Business account
- [ ] Create a Meta app with "Instagram API with Instagram Login"
- [ ] Add the `instagram_business_basic` permission
- [ ] Add his account (as an Instagram tester if he isn't an app admin), accept the invite, and generate a token
- [ ] Exchange it for a long-lived token if it is short-lived
- [ ] `wrangler secret put IG_INITIAL_TOKEN` on the site **and** with `--config workers/ig-cron/wrangler.toml`
- [ ] Optional: `wrangler secret put IG_APP_ID` / `IG_APP_SECRET` (the code doesn't read them)
- [ ] Press **Refresh now** on `/admin/instagram` and confirm the status is OK
- [ ] Every ~60 days only if the status shows `token_invalid`: generate a new token and set `IG_INITIAL_TOKEN` again

### Jotform
- [ ] Agree with the shop that form `250787056108157` (also on their `/booking/` page) may take the Haleboy theme. Don't clone it; a clone has its own inbox
- [ ] If they agree, paste `public/jotform-theme.css` into Form Designer → Styles → Inject custom CSS
- [ ] Run the checks in `docs/jotform-theme.md` on desktop and phone

### Content
- [ ] Fill in the placeholders above
- [ ] Replace the seeded featured and flash rows in admin with real photos
- [ ] Optional: replace the default portrait (`src/assets/eathan.jpg`) in `/admin/portrait`
