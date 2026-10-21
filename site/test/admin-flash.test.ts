import { DatabaseSync } from 'node:sqlite';
import type { APIContext } from 'astro';
import schema from '../migrations/0001_init.sql?raw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real SQL from db.ts runs against an in-memory SQLite with the D1 migration applied.
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(schema);
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
};

// vi.mock is hoisted above d1, so the env object is filled in after it exists.
const env = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
Object.assign(env, { DB: d1, MEDIA: {}, IMAGES: {} });
vi.mock('../src/lib/access', () => ({ verifyAccess: vi.fn(async () => 'eathan@example.com') }));
vi.mock('../src/lib/images', async (orig) => {
  const m = await orig<typeof import('../src/lib/images')>();
  return { ...m, processUpload: vi.fn(m.processUpload) };
});

import { verifyAccess } from '../src/lib/access';
import { processUpload } from '../src/lib/images';
import { POST as create } from '../src/pages/api/admin/flash/index';
import { PATCH } from '../src/pages/api/admin/flash/[id]';
import { POST as move } from '../src/pages/api/admin/flash/[id]/move';

const ORIGIN = 'https://haleboy.example';

function call(route: (ctx: APIContext) => unknown, init: RequestInit & { path?: string; id?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  if (init.method !== 'GET' && !headers.has('Origin')) headers.set('Origin', ORIGIN);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  const request = new Request(`${ORIGIN}/api/admin/flash${init.path ?? ''}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  return route({ request, params: { id: init.id } } as unknown as APIContext) as Promise<Response>;
}

type Body = { error?: string; moved?: boolean; items?: { name: string }[]; item?: object };
const read = async (res: Response) => (await res.json()) as Body;

const names = () => (sqlite.prepare('SELECT name FROM flash ORDER BY position, id').all() as { name: string }[]).map((r) => r.name);

beforeEach(() => {
  vi.mocked(verifyAccess).mockResolvedValue('eathan@example.com');
  sqlite.exec(`DELETE FROM flash;
    INSERT INTO flash (id, name, price, position) VALUES (1, 'Oni', '$150', 1), (2, 'Koi', '$120', 2), (3, 'Slime', '$90', 3);`);
});

describe('flash admin API', () => {
  it('rejects requests without a valid Access token', async () => {
    vi.mocked(verifyAccess).mockResolvedValue(null);
    const res = await call(PATCH, { method: 'PATCH', id: '1', json: { taken: true } });
    expect(res.status).toBe(403);
    expect(names()).toEqual(['Oni', 'Koi', 'Slime']);
  });

  it('rejects writes from another origin', async () => {
    const res = await call(PATCH, { method: 'PATCH', id: '1', json: { taken: true }, headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });

  it('returns 415 for a file that is not a supported image', async () => {
    const form = new FormData();
    form.set('photo', new File(['%PDF-1.7 not an image'], 'flash.jpg', { type: 'image/jpeg' }));
    form.set('name', 'Oni');
    const res = await call(create, { body: form });
    expect(res.status).toBe(415);
    expect((await read(res)).error).toMatch(/JPG, PNG, WebP or HEIC/);
  });

  it('stores the taken status in the upload insert and validates it', async () => {
    const upload = (taken: string) => {
      const form = new FormData();
      form.set('photo', new File(['x'], 'flash.jpg'));
      form.set('name', 'Tengu');
      form.set('price', '$100');
      form.set('taken', taken);
      return call(create, { body: form });
    };
    vi.mocked(processUpload).mockResolvedValueOnce({ key: 'uploads/t', width: 960, height: 960 });
    const res = await upload('1');
    expect(res.status).toBe(201);
    expect((await read(res)).item).toMatchObject({ name: 'Tengu', taken: 1 });

    expect((await upload('yes')).status).toBe(400);
    expect(names()).toEqual(['Oni', 'Koi', 'Slime', 'Tengu']);
  });

  it('moves items up and down and stops at the ends', async () => {
    let res = await call(move, { id: '3', path: '/3/move', json: { dir: 'up' } });
    expect(res.status).toBe(200);
    expect((await read(res)).items?.map((i) => i.name)).toEqual(['Oni', 'Slime', 'Koi']);

    res = await call(move, { id: '1', path: '/1/move', json: { dir: 'up' } });
    expect(await read(res)).toMatchObject({ moved: false });
    expect(names()).toEqual(['Oni', 'Slime', 'Koi']);

    await call(move, { id: '1', path: '/1/move', json: { dir: 'down' } });
    expect(names()).toEqual(['Slime', 'Oni', 'Koi']);

    expect((await call(move, { id: '1', path: '/1/move', json: { dir: 'sideways' } })).status).toBe(400);
    expect((await call(move, { id: '99', path: '/99/move', json: { dir: 'up' } })).status).toBe(404);
  });

  it('toggles taken and validates it', async () => {
    let res = await call(PATCH, { method: 'PATCH', id: '2', json: { taken: true } });
    expect(res.status).toBe(200);
    expect((await read(res)).item).toMatchObject({ id: 2, taken: 1 });

    res = await call(PATCH, { method: 'PATCH', id: '2', json: { taken: false } });
    expect((await read(res)).item).toMatchObject({ id: 2, taken: 0 });

    expect((await call(PATCH, { method: 'PATCH', id: '2', json: { taken: 'yes' } })).status).toBe(400);
    expect((await call(PATCH, { method: 'PATCH', id: 'abc', json: { taken: true } })).status).toBe(400);
    expect((await call(PATCH, { method: 'PATCH', id: '99', json: { taken: true } })).status).toBe(404);
  });
});
