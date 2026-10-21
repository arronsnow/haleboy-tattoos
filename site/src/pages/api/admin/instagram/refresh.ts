import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { verifyAccess } from '../../../../lib/access';
import { refreshInstagram } from '../../../../lib/instagram';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Runs the Instagram sync now. Instagram failures come back as a 200 with state 'error'/'token_invalid'. */
export const POST: APIRoute = async ({ request }) => {
  // Middleware already checks this; checked again so the route is safe on its own.
  if (!(import.meta.env.DEV && env.DEV_ADMIN_BYPASS) && !(await verifyAccess(request, env))) {
    return new Response('Forbidden', { status: 403, headers: NO_STORE });
  }
  return Response.json(await refreshInstagram(env), { headers: NO_STORE });
};
