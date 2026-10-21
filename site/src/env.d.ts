// Bindings (DB, MEDIA, IG_CACHE, IMAGES) come from worker-configuration.d.ts (`npm run types`).
// Secrets live in .dev.vars locally and `wrangler secret put` in production, so wrangler can't see them.
interface HaleboySecrets {
  IG_APP_ID: string;
  IG_APP_SECRET: string;
  IG_INITIAL_TOKEN: string;
  JOTFORM_API_KEY: string;
  JOTFORM_FORM_ID: string;
  /** e.g. "haleboy.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD: string;
  ADMIN_EMAIL: string;
  /** Local dev only: any non-empty value skips Access checks when import.meta.env.DEV. */
  DEV_ADMIN_BYPASS?: string;
}

interface Env extends HaleboySecrets {}
declare namespace Cloudflare {
  interface Env extends HaleboySecrets {}
}

declare namespace App {
  interface Locals {
    /** Set by middleware on verified /admin and /api/admin requests. */
    adminEmail?: string;
  }
}
