import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { verifyAccess } from './lib/access';

const ADMIN_PATH = /^\/(api\/)?admin(\/|$)/;

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname.replace(/\/{2,}/g, '/').toLowerCase();
  if (!ADMIN_PATH.test(path)) return next();

  if (import.meta.env.DEV && env.DEV_ADMIN_BYPASS) {
    context.locals.adminEmail = env.ADMIN_EMAIL || 'dev@localhost';
    return next();
  }

  const email = await verifyAccess(context.request, env);
  if (!email) {
    return new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  context.locals.adminEmail = email;
  return next();
});
