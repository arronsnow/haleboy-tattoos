import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { verifyAccess } from '../../../../lib/access';
import { listIgLog } from '../../../../lib/db';
import { IG_FEED_KEY, IG_STATUS_KEY, type IgFeed, type IgStatus } from '../../../../lib/feed';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Status panel data: last run's status, last successful fetch, and the recent run log. */
export const GET: APIRoute = async ({ request }) => {
  // Middleware already checks this; checked again so the route is safe on its own.
  if (!(import.meta.env.DEV && env.DEV_ADMIN_BYPASS) && !(await verifyAccess(request, env))) {
    return new Response('Forbidden', { status: 403, headers: NO_STORE });
  }

  const [status, feed, log] = await Promise.all([
    env.IG_CACHE.get<IgStatus>(IG_STATUS_KEY, 'json'),
    env.IG_CACHE.get<IgFeed>(IG_FEED_KEY, 'json'),
    listIgLog(env.DB),
  ]);
  return Response.json(
    { status, lastSuccess: feed?.updatedAt ?? null, posts: feed?.posts.length ?? 0, log },
    { headers: NO_STORE },
  );
};
