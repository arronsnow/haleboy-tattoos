// Shared plumbing for /api/admin/* routes: auth, CSRF, input checks and JSON errors.
// Responses are no-store; the public page is server-rendered on each request, so edits show at once.

import type { APIContext, APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { verifyAccess } from './access';
import * as db from './db';
import type { Direction, StoredImage } from './db';
import { MAX_UPLOAD_BYTES, UploadError, deleteImage, processUpload, responsiveImage } from './images';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** A request the admin can fix; its message is shown to him as-is. */
export class BadInput extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  try {
    return !!origin && new URL(origin).host === new URL(request.url).host;
  } catch {
    return false; // e.g. Origin: null
  }
}

/** Wraps a handler with the Access check (defense in depth), a same-origin check on writes, and error mapping. */
export function adminRoute(handler: (ctx: APIContext) => Promise<Response>): APIRoute {
  return async (ctx) => {
    if (!(import.meta.env.DEV && env.DEV_ADMIN_BYPASS) && !(await verifyAccess(ctx.request, env))) {
      return json({ error: 'Your admin sign-in has expired. Reload the page to sign in again.' }, 403);
    }
    if (ctx.request.method !== 'GET' && !sameOrigin(ctx.request)) {
      return json({ error: 'This request came from another site, so it was blocked.' }, 403);
    }
    try {
      return await handler(ctx);
    } catch (e) {
      if (e instanceof BadInput || e instanceof UploadError) return json({ error: e.message }, e.status);
      throw e;
    }
  };
}

export function parseId(raw: string | undefined): number {
  if (!raw || !/^[1-9]\d{0,8}$/.test(raw)) throw new BadInput('That item id isn’t valid.');
  return Number(raw);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.includes('application/json')) throw new BadInput('Send this request as JSON.', 415);
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadInput('The request body isn’t valid JSON.');
  return body as Record<string, unknown>;
}

/** Returns the trimmed string, or undefined when absent. Rejects non-strings and over-long values. */
export function text(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new BadInput(`${label} must be text.`);
  const v = value.trim();
  if (v.length > max) throw new BadInput(`${label} is too long. Keep it under ${max} characters.`);
  return v;
}

/** Reads a multipart upload: the `photo` file plus text fields. Size is checked before buffering the body. */
export async function readUpload(request: Request): Promise<{ file: File; form: FormData }> {
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data')) {
    throw new BadInput('Send the photo as a file upload (multipart/form-data).', 415);
  }
  // Allow some room for the multipart envelope and text fields on top of the photo itself.
  if (Number(request.headers.get('Content-Length')) > MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new BadInput('That photo is over 15 MB. Pick a smaller one or take a screenshot of it.', 413);
  }
  const form = await request.formData().catch(() => {
    throw new BadInput('The upload didn’t come through. Please try again.');
  });
  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) throw new BadInput('No photo was attached. Choose a photo and try again.');
  return { file, form };
}

/** Stores the upload in R2, then runs `save`; the R2 objects are removed again if `save` fails. */
export async function uploadThen<T>(file: File, save: (img: StoredImage) => Promise<T>): Promise<T> {
  const img = await processUpload(file, env);
  try {
    return await save(img);
  } catch (e) {
    await deleteImage(img.key, env).catch(() => {});
    throw e;
  }
}

/** Row deleted already; a failed R2 delete only leaves orphaned objects, so it's logged, not surfaced. */
export async function dropImage(key: string | null | undefined): Promise<void> {
  if (key) await deleteImage(key, env).catch((e) => console.error('R2 delete failed', key, e));
}

const withImage = <T extends { r2_key: string | null; width: number | null; height: number | null }>(row: T) => ({
  ...row,
  image: row.r2_key && row.width && row.height ? responsiveImage(row.r2_key, row.width, row.height) : null,
});

// ---- Ordered collections (featured, flash) ----------------------------------

interface Row {
  id: number;
  r2_key: string | null;
  width: number | null;
  height: number | null;
}

interface Collection<T extends Row, F extends string> {
  /** Text fields and their max lengths. */
  fields: Record<F, [label: string, max: number]>;
  list(d: D1Database): Promise<T[]>;
  add(d: D1Database, img: StoredImage, f: Record<F, string>, taken: boolean): Promise<T | null>;
  update(d: D1Database, id: number, f: Partial<Record<F, string>>): Promise<T | null>;
  move(d: D1Database, id: number, dir: Direction): Promise<boolean>;
  remove(d: D1Database, id: number): Promise<{ r2_key: string | null } | null>;
  setTaken?(d: D1Database, id: number, taken: boolean): Promise<T | null>;
}

const NOT_FOUND = () => new BadInput('That item no longer exists. Reload the page.', 404);

function collection<T extends Row, F extends string>(c: Collection<T, F>) {
  const names = Object.keys(c.fields) as F[];
  const readFields = (src: (k: F) => unknown) => {
    const out: Partial<Record<F, string>> = {};
    for (const k of names) {
      const v = text(src(k), c.fields[k][0], c.fields[k][1]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  };

  return {
    GET: adminRoute(async () => json({ items: (await c.list(env.DB)).map(withImage) })),

    POST: adminRoute(async ({ request }) => {
      const { file, form } = await readUpload(request);
      const f = readFields((k) => form.get(k) ?? '') as Record<F, string>;
      // Set in the same insert, so a taken design is never briefly listed as available.
      const taken = form.get('taken');
      if (taken !== null && (!c.setTaken || (taken !== '0' && taken !== '1'))) {
        throw new BadInput(c.setTaken ? 'Taken must be 0 or 1.' : 'This item can’t be marked as taken.');
      }
      const item = await uploadThen(file, async (img) => {
        const row = await c.add(env.DB, img, f, taken === '1');
        if (!row) throw new Error('insert returned no row');
        return row;
      });
      return json({ item: withImage(item) }, 201);
    }),

    PATCH: adminRoute(async ({ params, request }) => {
      const id = parseId(params.id);
      const body = await readJson(request);
      const f = readFields((k) => body[k]);
      if (body.taken !== undefined && (!c.setTaken || typeof body.taken !== 'boolean')) {
        throw new BadInput(c.setTaken ? 'Taken must be true or false.' : 'This item can’t be marked as taken.');
      }
      if (!Object.keys(f).length && body.taken === undefined) throw new BadInput('There’s nothing to change.');

      let row = Object.keys(f).length ? await c.update(env.DB, id, f) : null;
      if (typeof body.taken === 'boolean') row = await c.setTaken!(env.DB, id, body.taken);
      if (!row) throw NOT_FOUND();
      return json({ item: withImage(row) });
    }),

    DELETE: adminRoute(async ({ params }) => {
      const id = parseId(params.id);
      const row = await c.remove(env.DB, id);
      if (!row) throw NOT_FOUND();
      await dropImage(row.r2_key);
      return json({ deleted: id });
    }),

    /** POST /[id]/move {dir}. Returns the new order; `moved` is false at either end. */
    MOVE: adminRoute(async ({ params, request }) => {
      const id = parseId(params.id);
      const { dir } = await readJson(request);
      if (dir !== 'up' && dir !== 'down') throw new BadInput('Direction must be "up" or "down".');
      const moved = await c.move(env.DB, id, dir);
      const items = await c.list(env.DB);
      if (!moved && !items.some((i) => i.id === id)) throw NOT_FOUND();
      return json({ moved, items: items.map(withImage) });
    }),
  };
}

export const featured = collection({
  fields: { title: ['Title', 80], placement: ['Placement', 60] },
  list: db.listFeatured,
  add: db.addFeatured,
  update: db.updateFeatured,
  move: db.moveFeatured,
  remove: db.deleteFeatured,
});

export const gallery = collection({
  fields: { title: ['Title', 80], placement: ['Placement', 60] },
  list: db.listGallery,
  add: db.addGallery,
  update: db.updateGallery,
  move: db.moveGallery,
  remove: db.deleteGallery,
});

export const flash = collection({
  fields: { name: ['Name', 80], price: ['Note', 40] },
  list: db.listFlash,
  add: db.addFlash,
  update: db.updateFlash,
  move: db.moveFlash,
  remove: db.deleteFlash,
  setTaken: db.setFlashTaken,
});
