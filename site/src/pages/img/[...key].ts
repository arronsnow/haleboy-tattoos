import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

// Only the variant names images.ts writes; anything else in the bucket stays private.
const KEY = /^(uploads|ig)\/[\w-]+\/\d+\.(webp|avif)$/;

export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? '';
  const obj = KEY.test(key) ? await env.MEDIA.get(key) : null;
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  // Keys are never rewritten (new uploads get a new uuid), so they can be cached forever.
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
};
