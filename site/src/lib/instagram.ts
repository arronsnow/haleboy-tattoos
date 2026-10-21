// Instagram sync, using only the Instagram API with Instagram Login (graph.instagram.com).
// Run hourly by workers/ig-cron and on demand by POST /api/admin/instagram/refresh.
// Writes KV `ig:feed` / `ig:status` in the shape documented in feed.ts.

import { logIgRun } from './db';
import { IG_FEED_KEY, IG_STATUS_KEY, type IgFeed, type IgStatus } from './feed';
import { sniffImage, storeImage } from './images';

const GRAPH = 'https://graph.instagram.com';
export const IG_TOKEN_KEY = 'ig:token';
const REFRESH_WITHIN_MS = 20 * 24 * 60 * 60 * 1000;
const FIELDS = 'id,media_type,media_url,thumbnail_url,caption,permalink,timestamp,children{media_type,media_url,thumbnail_url}';
const TIMEOUT_MS = 20_000;
// Originals are kept as `ig/<id>.<ext>` (not publicly served); their presence means the variants exist.
const ORIGINAL = /^ig\/([\w-]+)\.\w+$/;

type IgEnv = Pick<Env, 'DB' | 'MEDIA' | 'IG_CACHE' | 'IMAGES' | 'IG_INITIAL_TOKEN'>;

/** KV `ig:token`. expires_at is null for the IG_INITIAL_TOKEN secret, whose expiry we don't know. */
export interface StoredToken {
  token: string;
  expires_at: string | null;
}

interface MediaItem {
  media_type: 'IMAGE' | 'CAROUSEL_ALBUM' | 'VIDEO';
  media_url?: string;
  thumbnail_url?: string;
}

export interface Media extends MediaItem {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp: string;
  children?: { data: MediaItem[] };
}

class IgError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly tokenInvalid = false,
  ) {
    super(message);
  }
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await res.json().catch(() => null)) as (T & { error?: { code?: number; message?: string } }) | null;
  const err = body?.error;
  if (res.ok && body && !err) return body;
  throw new IgError(
    err?.code ? String(err.code) : `http_${res.status}`,
    (err?.message ?? `Instagram returned HTTP ${res.status}`).slice(0, 300),
    err?.code === 190, // OAuthException 190: token expired, revoked or wrong
  );
}

/** IMAGE: media_url. CAROUSEL_ALBUM: its first child's image. VIDEO (incl. a video child): thumbnail_url. */
export function pickImageUrl(m: Media): string | undefined {
  const item = m.media_type === 'CAROUSEL_ALBUM' ? m.children?.data[0] : m;
  if (!item) return undefined;
  return item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url;
}

async function currentToken(env: IgEnv, now: Date): Promise<StoredToken> {
  let tok = await env.IG_CACHE.get<StoredToken>(IG_TOKEN_KEY, 'json');
  if (!tok?.token) {
    if (!env.IG_INITIAL_TOKEN) throw new IgError('no_token', 'No Instagram token is set. Add the IG_INITIAL_TOKEN secret.', true);
    tok = { token: env.IG_INITIAL_TOKEN, expires_at: null };
  }
  if (tok.expires_at && Date.parse(tok.expires_at) - now.getTime() >= REFRESH_WITHIN_MS) return tok;

  try {
    const r = await graph<{ access_token?: string; expires_in?: number }>('/refresh_access_token', {
      grant_type: 'ig_refresh_token',
      access_token: tok.token,
    });
    if (!r.access_token || !r.expires_in) throw new IgError('refresh_bad_response', 'Instagram sent an unexpected token refresh response.');
    tok = { token: r.access_token, expires_at: new Date(now.getTime() + r.expires_in * 1000).toISOString() };
    await env.IG_CACHE.put(IG_TOKEN_KEY, JSON.stringify(tok));
  } catch (e) {
    // A token under 24 h old can't be refreshed yet; keep using it unless it's dead. Retried next run.
    if (!(e instanceof IgError) || e.tokenInvalid) throw e;
  }
  return tok;
}

async function listIgObjects(env: IgEnv): Promise<R2Object[]> {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: 'ig/', cursor, include: ['customMetadata'] });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** Copies one post's image into R2 once; later runs reuse the stored size. */
async function copyImage(id: string, url: string, original: R2Object | undefined, env: IgEnv) {
  const meta = original?.customMetadata;
  if (meta?.width && meta.height) return { key: `ig/${id}`, width: Number(meta.width), height: Number(meta.height) };

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new IgError('media_download', `Couldn’t download post ${id} (HTTP ${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) throw new IgError('media_type', `Post ${id} isn’t a supported image.`);
  const stored = await storeImage(bytes, `ig/${id}`, env);
  // Written last, so it only exists when every variant does.
  await env.MEDIA.put(`ig/${id}.${kind}`, bytes, {
    customMetadata: { width: String(stored.width), height: String(stored.height) },
  });
  return stored;
}

/** Refreshes the token if needed, syncs the latest 12 posts into R2 + KV, and records the outcome. Never throws for Instagram errors. */
export async function refreshInstagram(env: IgEnv, now = new Date()): Promise<IgStatus> {
  const checkedAt = now.toISOString();
  let tokenExpiresAt: string | undefined;
  let count = 0;
  let status: IgStatus;

  try {
    const tok = await currentToken(env, now);
    tokenExpiresAt = tok.expires_at ?? undefined;
    const { data } = await graph<{ data: Media[] }>('/me/media', { fields: FIELDS, limit: '12', access_token: tok.token });

    const objects = await listIgObjects(env);
    const originals = new Map<string, R2Object>();
    for (const o of objects) {
      const id = ORIGINAL.exec(o.key)?.[1];
      if (id) originals.set(id, o);
    }

    const posts: IgFeed['posts'] = [];
    let skipped = 0;
    for (const m of data.slice(0, 12)) {
      const url = pickImageUrl(m);
      // Ids become R2 keys and permalinks become hrefs, so only accept the expected shapes.
      if (!url || !/^[\w-]+$/.test(m.id) || !m.permalink?.startsWith('https://www.instagram.com/')) {
        skipped++;
        continue;
      }
      try {
        const image = await copyImage(m.id, url, originals.get(m.id), env);
        posts.push({ id: m.id, permalink: m.permalink, caption: m.caption ?? '', mediaType: m.media_type, timestamp: m.timestamp, image });
      } catch {
        skipped++; // retried next run, since its original wasn't stored
      }
    }
    if (data.length && !posts.length) throw new IgError('media_copy_failed', 'None of the latest posts could be copied. Will retry next hour.');

    const previous = await env.IG_CACHE.get<IgFeed>(IG_FEED_KEY, 'json');
    await env.IG_CACHE.put(IG_FEED_KEY, JSON.stringify({ updatedAt: checkedAt, posts } satisfies IgFeed));
    count = posts.length;

    // Drop images of posts that left the feed before the previous run. Posts of the previous feed keep
    // theirs until the next run, since KV may still serve that feed for a while and open pages lazy-load.
    // Objects created this run weren't listed, so they're safe.
    const keep = new Set([...posts, ...(previous?.posts ?? [])].map((p) => p.id));
    const stale = objects.map((o) => o.key).filter((k) => !keep.has(k.slice(3).split(/[./]/)[0]));
    for (let i = 0; i < stale.length; i += 1000) await env.MEDIA.delete(stale.slice(i, i + 1000));

    status = {
      state: 'ok',
      checkedAt,
      tokenExpiresAt,
      message: skipped ? `${skipped} of the latest posts couldn’t be shown and were left out.` : undefined,
    };
  } catch (e) {
    const err = e instanceof IgError ? e : new IgError('internal', e instanceof Error ? e.message.slice(0, 300) : String(e));
    // Forget a dead stored token so a new IG_INITIAL_TOKEN secret takes over on the next run.
    if (err.tokenInvalid) await env.IG_CACHE.delete(IG_TOKEN_KEY);
    status = { state: err.tokenInvalid ? 'token_invalid' : 'error', checkedAt, errorCode: err.code, message: err.message, tokenExpiresAt };
  }

  await env.IG_CACHE.put(IG_STATUS_KEY, JSON.stringify(status));
  await logIgRun(env.DB, { ok: status.state === 'ok', errorCode: status.errorCode, message: status.message, posts: count });
  return status;
}
