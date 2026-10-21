// Companion Worker: the site's Astro worker has no scheduled() handler, so the hourly
// Instagram sync runs here with the same bindings.
import { refreshInstagram } from '../../src/lib/instagram';

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(refreshInstagram(env));
  },
} satisfies ExportedHandler<Env>;
