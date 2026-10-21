// Upload validation and resizing. Every image is re-encoded by the Images binding,
// which drops EXIF/GPS. Variants are stored in R2 as <key>/<width>.webp and <key>/<width>.avif.

import type { StoredImage } from './db';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const WIDTHS = [480, 960, 1600] as const;
const QUALITY = 80;
const FORMATS = [
  ['webp', 'image/webp'],
  ['avif', 'image/avif'],
] as const;

export type UploadErrorCode = 'empty' | 'too_large' | 'bad_type' | 'unreadable' | 'process_failed';

export class UploadError extends Error {
  constructor(
    readonly code: UploadErrorCode,
    message: string,
    readonly status = code === 'process_failed' ? 500 : code === 'too_large' ? 413 : 415,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export type ImageKind = 'jpg' | 'png' | 'webp' | 'heic';

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/** Identifies the file from its first bytes. The browser-supplied MIME type is ignored. */
export function sniffImage(b: Uint8Array): ImageKind | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii(8, 12))) return 'heic';
  return null;
}

/** Checks size and type; returns the file's bytes. */
export async function validateUpload(file: File): Promise<{ bytes: Uint8Array<ArrayBuffer>; kind: ImageKind }> {
  if (!file || file.size === 0) throw new UploadError('empty', 'No photo was attached. Choose a photo and try again.', 400);
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('too_large', 'That photo is over 15 MB. Pick a smaller one or take a screenshot of it.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) throw new UploadError('bad_type', 'That file type isn’t supported. Use a JPG, PNG, WebP or HEIC photo.');
  return { bytes, kind };
}

/** Widths actually generated for an image of the given (stored) width. Never upscales. */
export function variantWidths(width: number): number[] {
  const max = Math.min(width, WIDTHS[WIDTHS.length - 1]);
  return [...WIDTHS.filter((w) => w < max), max];
}

export interface ResponsiveImage {
  src: string;
  srcset: string;
  avifSrcset: string;
  width: number;
  height: number;
}

/** Public URLs for a stored image's variants (served by /img/[...key]). */
export function responsiveImage(key: string, width: number, height: number): ResponsiveImage {
  const ws = variantWidths(width);
  const set = (ext: string) => ws.map((w) => `/img/${key}/${w}.${ext} ${w}w`).join(', ');
  return { src: `/img/${key}/${ws[Math.min(1, ws.length - 1)]}.webp`, srcset: set('webp'), avifSrcset: set('avif'), width, height };
}

type ImageEnv = Pick<Env, 'IMAGES' | 'MEDIA'>;

/**
 * Resizes trusted bytes to every web width/format and writes them under `key`.
 * Also used by the Instagram job (key `ig/<postId>`). Returns the largest variant's dimensions.
 */
export async function storeImage(bytes: Uint8Array<ArrayBuffer>, key: string, env: ImageEnv): Promise<StoredImage> {
  const stream = () => new Blob([bytes]).stream();
  let info: ImageInfoResponse;
  try {
    info = await env.IMAGES.info(stream());
  } catch {
    throw new UploadError('unreadable', 'We couldn’t open that photo. Try exporting it as a JPG and uploading again.');
  }
  if (!('width' in info)) throw new UploadError('bad_type', 'That file type isn’t supported. Use a JPG, PNG, WebP or HEIC photo.');

  const widths = variantWidths(info.width);
  const top = widths[widths.length - 1];
  try {
    for (const w of widths) {
      for (const [ext, format] of FORMATS) {
        const out = await env.IMAGES.input(stream())
          .transform({ width: w, fit: 'scale-down' })
          .output({ format, quality: QUALITY });
        // R2 needs a known length, so buffer each variant. Content type comes from the result
        // in case the binding falls back to another format.
        await env.MEDIA.put(`${key}/${w}.${ext}`, await out.response().arrayBuffer(), {
          httpMetadata: { contentType: out.contentType() },
        });
      }
    }
  } catch {
    await deleteImage(key, env).catch(() => {});
    throw new UploadError('process_failed', 'Something went wrong saving that photo. Please try again.', 500);
  }
  return { key, width: top, height: Math.round((info.height * top) / info.width) };
}

/** Validates an admin upload, resizes it and stores it under a fresh `uploads/<uuid>` prefix. */
export async function processUpload(file: File, env: ImageEnv): Promise<StoredImage> {
  const { bytes } = await validateUpload(file);
  return storeImage(bytes, `uploads/${crypto.randomUUID()}`, env);
}

/** Deletes every variant stored under `key`. */
export async function deleteImage(key: string, env: Pick<Env, 'MEDIA'>): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: `${key}/`, cursor });
    if (page.objects.length) await env.MEDIA.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
