import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ logIgRun: vi.fn(async () => {}) }));
vi.mock('../src/lib/images', async (orig) => ({
  ...(await orig<typeof import('../src/lib/images')>()),
  storeImage: vi.fn(async (_b: Uint8Array, key: string) => ({ key, width: 1080, height: 1350 })),
}));

import { logIgRun } from '../src/lib/db';
import { IG_TOKEN_KEY, pickImageUrl, refreshInstagram, type Media } from '../src/lib/instagram';

const NOW = new Date('2026-10-21T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function makeEnv(token?: { token: string; expires_at: string | null }) {
  const kv = new Map<string, string>(token ? [[IG_TOKEN_KEY, JSON.stringify(token)]] : []);
  const r2 = new Map<string, unknown>();
  return {
    kv,
    r2,
    env: {
      IG_INITIAL_TOKEN: 'initial',
      DB: {},
      IMAGES: {},
      IG_CACHE: {
        get: async (k: string) => (kv.has(k) ? JSON.parse(kv.get(k)!) : null),
        put: async (k: string, v: string) => void kv.set(k, v),
        delete: async (k: string) => void kv.delete(k),
      },
      MEDIA: {
        list: async () => ({ objects: [...r2.keys()].map((key) => ({ key })), truncated: false }),
        put: async (k: string, v: unknown) => void r2.set(k, v),
        delete: async (keys: string[]) => keys.forEach((k) => r2.delete(k)),
      },
    } as unknown as Parameters<typeof refreshInstagram>[0],
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function mockFetch(media: (url: URL) => Response) {
  const fn = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/refresh_access_token') return json({ access_token: 'fresh', token_type: 'bearer', expires_in: 60 * DAY / 1000 });
    if (url.pathname === '/me/media') return media(url);
    return new Response(JPG); // CDN image download
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const calls = (fn: ReturnType<typeof mockFetch>, path: string) =>
  fn.mock.calls.map(([u]) => new URL(String(u))).filter((u) => u.pathname === path);

const POST = { id: '1', media_type: 'IMAGE', media_url: 'https://cdn/1.jpg', permalink: 'https://www.instagram.com/p/a/', timestamp: '2026-10-20T00:00:00Z' } as const;

beforeEach(() => vi.mocked(logIgRun).mockClear());
afterEach(() => vi.unstubAllGlobals());

describe('pickImageUrl', () => {
  it('uses media_url for images, the first child for carousels and the thumbnail for videos', () => {
    expect(pickImageUrl({ ...POST })).toBe('https://cdn/1.jpg');
    expect(pickImageUrl({ ...POST, media_type: 'VIDEO', media_url: 'https://cdn/v.mp4', thumbnail_url: 'https://cdn/v.jpg' })).toBe('https://cdn/v.jpg');
    const carousel: Media = {
      ...POST,
      media_type: 'CAROUSEL_ALBUM',
      media_url: 'https://cdn/cover.jpg',
      children: { data: [{ media_type: 'IMAGE', media_url: 'https://cdn/c1.jpg' }, { media_type: 'IMAGE', media_url: 'https://cdn/c2.jpg' }] },
    };
    expect(pickImageUrl(carousel)).toBe('https://cdn/c1.jpg');
    expect(pickImageUrl({ ...carousel, children: { data: [{ media_type: 'VIDEO', media_url: 'https://cdn/x.mp4', thumbnail_url: 'https://cdn/x.jpg' }] } })).toBe('https://cdn/x.jpg');
  });
});

describe('refreshInstagram', () => {
  it('refreshes a token expiring in under 20 days and writes feed, status and R2 copy', async () => {
    const { env, kv, r2 } = makeEnv({ token: 'old', expires_at: new Date(NOW.getTime() + 19 * DAY).toISOString() });
    r2.set('ig/gone.jpg', 1);
    r2.set('ig/gone/480.webp', 1);
    r2.set('ig/prev.jpg', 1);
    r2.set('ig/prev/480.webp', 1);
    kv.set('ig:feed', JSON.stringify({ updatedAt: 'x', posts: [{ id: 'prev' }] }));
    const fetch = mockFetch((u) => {
      expect(u.searchParams.get('access_token')).toBe('fresh');
      return json({ data: [POST] });
    });

    const status = await refreshInstagram(env, NOW);

    expect(calls(fetch, '/refresh_access_token')[0].searchParams.get('access_token')).toBe('old');
    expect(JSON.parse(kv.get(IG_TOKEN_KEY)!)).toEqual({ token: 'fresh', expires_at: new Date(NOW.getTime() + 60 * DAY).toISOString() });
    expect(status).toMatchObject({ state: 'ok', tokenExpiresAt: new Date(NOW.getTime() + 60 * DAY).toISOString() });
    expect(JSON.parse(kv.get('ig:feed')!).posts[0]).toMatchObject({ id: '1', image: { key: 'ig/1', width: 1080, height: 1350 } });
    // Older stale post removed; the previous feed's post is kept one more run.
    expect([...r2.keys()].sort()).toEqual(['ig/1.jpg', 'ig/prev.jpg', 'ig/prev/480.webp']);
    expect(logIgRun).toHaveBeenCalledWith(env.DB, expect.objectContaining({ ok: true, posts: 1 }));
  });

  it('leaves a token with 20+ days left alone', async () => {
    const { env } = makeEnv({ token: 'good', expires_at: new Date(NOW.getTime() + 30 * DAY).toISOString() });
    const fetch = mockFetch(() => json({ data: [] }));
    expect((await refreshInstagram(env, NOW)).state).toBe('ok');
    expect(calls(fetch, '/refresh_access_token')).toHaveLength(0);
    expect(calls(fetch, '/me/media')[0].searchParams.get('access_token')).toBe('good');
  });

  it('marks the token invalid on OAuthException 190 and keeps the old feed', async () => {
    const { env, kv } = makeEnv({ token: 'dead', expires_at: new Date(NOW.getTime() + 30 * DAY).toISOString() });
    kv.set('ig:feed', '{"updatedAt":"x","posts":[]}');
    mockFetch(() => json({ error: { message: 'Error validating access token', type: 'OAuthException', code: 190 } }, 400));

    const status = await refreshInstagram(env, NOW);

    expect(status).toMatchObject({ state: 'token_invalid', errorCode: '190' });
    expect(JSON.parse(kv.get('ig:status')!).state).toBe('token_invalid');
    expect(kv.has(IG_TOKEN_KEY)).toBe(false); // next run falls back to IG_INITIAL_TOKEN
    expect(kv.get('ig:feed')).toBe('{"updatedAt":"x","posts":[]}');
    expect(logIgRun).toHaveBeenCalledWith(env.DB, expect.objectContaining({ ok: false, errorCode: '190' }));
  });
});
