// Typed D1 queries. Callers delete R2 objects themselves using the keys these functions return.

export interface Portrait {
  r2_key: string;
  width: number;
  height: number;
  updated_at: string;
}

export interface Featured {
  id: number;
  r2_key: string | null;
  title: string;
  placement: string;
  position: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface Flash {
  id: number;
  r2_key: string | null;
  name: string;
  price: string;
  taken: 0 | 1;
  position: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface IgLogEntry {
  id: number;
  ran_at: string;
  ok: 0 | 1;
  error_code: string | null;
  message: string | null;
  posts: number;
}

export interface StoredImage {
  key: string;
  width: number;
  height: number;
}

export type Direction = 'up' | 'down';
type OrderedTable = 'featured' | 'flash' | 'gallery';

// ---- Portrait ---------------------------------------------------------------

export function getPortrait(db: D1Database): Promise<Portrait | null> {
  return db.prepare('SELECT r2_key, width, height, updated_at FROM portrait WHERE id = 1').first<Portrait>();
}

/** Returns the replaced portrait's R2 key, if any, so the caller can delete it. */
export async function setPortrait(db: D1Database, img: StoredImage): Promise<string | null> {
  const old = await getPortrait(db);
  await db
    .prepare(
      `INSERT INTO portrait (id, r2_key, width, height) VALUES (1, ?1, ?2, ?3)
       ON CONFLICT (id) DO UPDATE SET r2_key = ?1, width = ?2, height = ?3,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(img.key, img.width, img.height)
    .run();
  return old?.r2_key ?? null;
}

/** Reverts to the bundled default portrait. Returns the removed R2 key, if any. */
export async function clearPortrait(db: D1Database): Promise<string | null> {
  const row = await db.prepare('DELETE FROM portrait WHERE id = 1 RETURNING r2_key').first<{ r2_key: string }>();
  return row?.r2_key ?? null;
}

// ---- Shared ordering helpers ------------------------------------------------

async function list<T>(db: D1Database, table: OrderedTable): Promise<T[]> {
  return (await db.prepare(`SELECT * FROM ${table} ORDER BY position, id`).all<T>()).results;
}

/** Swaps an item with its neighbour in one UPDATE, so the order can't be left half-changed. */
async function move(db: D1Database, table: OrderedTable, id: number, dir: Direction): Promise<boolean> {
  const cur = await db.prepare(`SELECT id, position FROM ${table} WHERE id = ?`).bind(id).first<{ id: number; position: number }>();
  if (!cur) return false;
  const [cmp, order] = dir === 'up' ? ['<', 'DESC'] : ['>', 'ASC'];
  const nb = await db
    .prepare(`SELECT id, position FROM ${table} WHERE position ${cmp} ? ORDER BY position ${order} LIMIT 1`)
    .bind(cur.position)
    .first<{ id: number; position: number }>();
  if (!nb) return false;
  await db
    .prepare(`UPDATE ${table} SET position = CASE id WHEN ?1 THEN ?2 WHEN ?3 THEN ?4 END WHERE id IN (?1, ?3)`)
    .bind(cur.id, nb.position, nb.id, cur.position)
    .run();
  return true;
}

async function remove(db: D1Database, table: OrderedTable, id: number): Promise<{ r2_key: string | null } | null> {
  return db.prepare(`DELETE FROM ${table} WHERE id = ? RETURNING r2_key`).bind(id).first<{ r2_key: string | null }>();
}

const NEXT_POSITION = (table: OrderedTable) => `(SELECT COALESCE(MAX(position), 0) + 1 FROM ${table})`;

// ---- Featured ---------------------------------------------------------------

export const listFeatured = (db: D1Database) => list<Featured>(db, 'featured');

export function addFeatured(
  db: D1Database,
  img: StoredImage,
  fields: { title: string; placement: string },
): Promise<Featured | null> {
  return db
    .prepare(
      `INSERT INTO featured (r2_key, width, height, title, placement, position)
       VALUES (?, ?, ?, ?, ?, ${NEXT_POSITION('featured')}) RETURNING *`,
    )
    .bind(img.key, img.width, img.height, fields.title, fields.placement)
    .first<Featured>();
}

/** Omitted fields are left unchanged. Returns null when the id doesn't exist. */
export function updateFeatured(
  db: D1Database,
  id: number,
  fields: { title?: string; placement?: string },
): Promise<Featured | null> {
  return db
    .prepare('UPDATE featured SET title = COALESCE(?, title), placement = COALESCE(?, placement) WHERE id = ? RETURNING *')
    .bind(fields.title ?? null, fields.placement ?? null, id)
    .first<Featured>();
}

export const moveFeatured = (db: D1Database, id: number, dir: Direction) => move(db, 'featured', id, dir);

/** Returns null when the id doesn't exist; otherwise the R2 key to delete. */
export const deleteFeatured = (db: D1Database, id: number) => remove(db, 'featured', id);

// ---- Gallery (same shape as featured) ---------------------------------------

export type GalleryPiece = Featured;

export const listGallery = (db: D1Database) => list<GalleryPiece>(db, 'gallery');

export function addGallery(
  db: D1Database,
  img: StoredImage,
  fields: { title: string; placement: string },
): Promise<GalleryPiece | null> {
  return db
    .prepare(
      `INSERT INTO gallery (r2_key, width, height, title, placement, position)
       VALUES (?, ?, ?, ?, ?, ${NEXT_POSITION('gallery')}) RETURNING *`,
    )
    .bind(img.key, img.width, img.height, fields.title, fields.placement)
    .first<GalleryPiece>();
}

export function updateGallery(
  db: D1Database,
  id: number,
  fields: { title?: string; placement?: string },
): Promise<GalleryPiece | null> {
  return db
    .prepare('UPDATE gallery SET title = COALESCE(?, title), placement = COALESCE(?, placement) WHERE id = ? RETURNING *')
    .bind(fields.title ?? null, fields.placement ?? null, id)
    .first<GalleryPiece>();
}

export const moveGallery = (db: D1Database, id: number, dir: Direction) => move(db, 'gallery', id, dir);

export const deleteGallery = (db: D1Database, id: number) => remove(db, 'gallery', id);

// ---- Flash ------------------------------------------------------------------

export const listFlash = (db: D1Database) => list<Flash>(db, 'flash');

export function addFlash(
  db: D1Database,
  img: StoredImage,
  fields: { name: string; price: string },
  taken = false,
): Promise<Flash | null> {
  return db
    .prepare(
      `INSERT INTO flash (r2_key, width, height, name, price, taken, position)
       VALUES (?, ?, ?, ?, ?, ?, ${NEXT_POSITION('flash')}) RETURNING *`,
    )
    .bind(img.key, img.width, img.height, fields.name, fields.price, taken ? 1 : 0)
    .first<Flash>();
}

export function updateFlash(db: D1Database, id: number, fields: { name?: string; price?: string }): Promise<Flash | null> {
  return db
    .prepare('UPDATE flash SET name = COALESCE(?, name), price = COALESCE(?, price) WHERE id = ? RETURNING *')
    .bind(fields.name ?? null, fields.price ?? null, id)
    .first<Flash>();
}

export function setFlashTaken(db: D1Database, id: number, taken: boolean): Promise<Flash | null> {
  return db.prepare('UPDATE flash SET taken = ? WHERE id = ? RETURNING *').bind(taken ? 1 : 0, id).first<Flash>();
}

export const moveFlash = (db: D1Database, id: number, dir: Direction) => move(db, 'flash', id, dir);

export const deleteFlash = (db: D1Database, id: number) => remove(db, 'flash', id);

// ---- Instagram run log ------------------------------------------------------

const IG_LOG_KEEP = 200;

export async function logIgRun(
  db: D1Database,
  run: { ok: boolean; errorCode?: string | null; message?: string | null; posts?: number },
): Promise<void> {
  // Hourly runs: trim old rows in the same batch so the table stays small.
  await db.batch([
    db
      .prepare('INSERT INTO ig_log (ok, error_code, message, posts) VALUES (?, ?, ?, ?)')
      .bind(run.ok ? 1 : 0, run.errorCode ?? null, run.message ?? null, run.posts ?? 0),
    db.prepare('DELETE FROM ig_log WHERE id <= (SELECT MAX(id) FROM ig_log) - ?').bind(IG_LOG_KEEP),
  ]);
}

export async function listIgLog(db: D1Database, limit = 20): Promise<IgLogEntry[]> {
  return (await db.prepare('SELECT * FROM ig_log ORDER BY id DESC LIMIT ?').bind(limit).all<IgLogEntry>()).results;
}

