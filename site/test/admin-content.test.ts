import { DatabaseSync } from 'node:sqlite';
import type { APIContext } from 'astro';
import init from '../migrations/0001_init.sql?raw';
import extra from '../migrations/0002_content_gallery.sql?raw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same fake D1 as admin-flash.test.ts, plus batch() for the content upsert.
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(init);
sqlite.exec(extra);
const d1 = {
  prepare(q: string) {
    let args: unknown[] = [];
    const s = {
      bind: (...a: unknown[]) => ((args = a), s),
      first: async () => sqlite.prepare(q).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(q).all(...args) }),
      run: async () => sqlite.prepare(q).run(...args),
    };
    return s;
  },
  batch: async (stmts: { run: () => Promise<unknown> }[]) => {
    for (const s of stmts) await s.run();
  },
};

const env = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
Object.assign(env, { DB: d1, MEDIA: {}, IMAGES: {} });
vi.mock('../src/lib/access', () => ({ verifyAccess: vi.fn(async () => 'eathan@example.com') }));

import { PUT as putContent } from '../src/pages/api/admin/content';
import { PATCH as patchGallery } from '../src/pages/api/admin/gallery/[id]';
import { POST as moveGallery } from '../src/pages/api/admin/gallery/[id]/move';
import { CONTENT_FIELDS, getContent, telHref } from '../src/lib/content';

const ORIGIN = 'https://haleboy.example';

function call(route: (ctx: APIContext) => unknown, json: unknown, id?: string, method = 'PUT') {
  const request = new Request(`${ORIGIN}/api/admin/x`, {
    method,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(json),
  });
  return route({ request, params: { id } } as unknown as APIContext) as Promise<Response>;
}

beforeEach(() => {
  sqlite.exec(`DELETE FROM content; DELETE FROM gallery;
    INSERT INTO gallery (id, title, placement, position) VALUES (1, 'Goku', 'Forearm', 1), (2, 'Link', 'Calf', 2);`);
});

describe('site text', () => {
  it('falls back to defaults, then returns saved values', async () => {
    expect((await getContent(d1 as unknown as D1Database)).phone).toBe(CONTENT_FIELDS.phone.default);
    const res = await call(putContent, { phone: ' (865) 555-0100 ', deposit: '$50 deposit' });
    expect(res.status).toBe(200);
    const c = await getContent(d1 as unknown as D1Database);
    expect(c.phone).toBe('(865) 555-0100');
    expect(c.deposit).toBe('$50 deposit');
    expect(c.about_1).toBe(CONTENT_FIELDS.about_1.default);
  });

  it('flattens line breaks in single-line fields but keeps them in multi-line ones', async () => {
    await call(putContent, { phone: '865\n555', hours: 'Tue\r\nWed' });
    const c = await getContent(d1 as unknown as D1Database);
    expect(c.phone).toBe('865 555');
    expect(c.hours).toBe('Tue\nWed');
  });

  it('rejects unknown keys, non-strings and over-long values', async () => {
    expect((await call(putContent, { nope: 'x' })).status).toBe(400);
    expect((await call(putContent, { phone: 5 })).status).toBe(400);
    expect((await call(putContent, { phone: 'x'.repeat(31) })).status).toBe(400);
    expect((await call(putContent, {})).status).toBe(400);
  });

  it('builds tel: links from US numbers', () => {
    expect(telHref('(865) 724-1322')).toBe('tel:+18657241322');
    expect(telHref('1-865-724-1322')).toBe('tel:+18657241322');
  });
});

describe('gallery', () => {
  it('edits and reorders like featured', async () => {
    expect((await call(patchGallery, { title: 'Vegeta' }, '1', 'PATCH')).status).toBe(200);
    const res = await call(moveGallery, { dir: 'down' }, '1', 'POST');
    const body = (await res.json()) as { items: { title: string }[] };
    expect(body.items.map((i) => i.title)).toEqual(['Link', 'Vegeta']);
  });
});
