import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, UploadError, storeImage, validateUpload, variantWidths } from '../src/lib/images';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const file = (data: Uint8Array<ArrayBuffer>, type = 'image/jpeg') => new File([data], 'photo', { type });

const JPG = bytes([0xff, 0xd8, 0xff, 0xe0], 'rest');
const PNG = bytes([0x89], 'PNG\r\n\x1a\n', 'rest');
const WEBP = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ');
const HEIC = bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0]);

async function code(f: File) {
  try {
    await validateUpload(f);
    return 'ok';
  } catch (e) {
    expect(e).toBeInstanceOf(UploadError);
    return (e as UploadError).code;
  }
}

describe('validateUpload', () => {
  it.each([
    ['jpg', JPG],
    ['png', PNG],
    ['webp', WEBP],
    ['heic', HEIC],
  ])('accepts %s by magic bytes', async (kind, data) => {
    expect((await validateUpload(file(data))).kind).toBe(kind);
  });

  it('ignores a lying MIME type', async () => {
    expect(await code(file(bytes('GIF89a....'), 'image/jpeg'))).toBe('bad_type');
    expect(await code(file(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png'))).toBe('bad_type');
    expect((await validateUpload(file(PNG, 'application/octet-stream'))).kind).toBe('png');
  });

  it('rejects AVIF/MP4 ftyp boxes that are not HEIC', async () => {
    expect(await code(file(bytes([0, 0, 0, 24], 'ftypisom', [0, 0, 0, 0])))).toBe('bad_type');
  });

  it('rejects empty and oversized files', async () => {
    expect(await code(file(new Uint8Array()))).toBe('empty');
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(JPG);
    const err = await validateUpload(file(big)).catch((e: UploadError) => e);
    expect(err).toMatchObject({ code: 'too_large', status: 413 });
  });
});

describe('variantWidths', () => {
  it('never upscales', () => {
    expect(variantWidths(4000)).toEqual([480, 960, 1600]);
    expect(variantWidths(1000)).toEqual([480, 960, 1000]);
    expect(variantWidths(960)).toEqual([480, 960]);
    expect(variantWidths(300)).toEqual([300]);
  });
});

describe('storeImage', () => {
  // Fake Images binding (any input → 2000×1000 image) and an in-memory R2 that can fail the nth put.
  function fakeEnv(failOnPut = 0) {
    const r2 = new Map<string, unknown>();
    let puts = 0;
    const out = { response: () => new Response('x'), contentType: () => 'image/webp' };
    const env = {
      IMAGES: { info: async () => ({ width: 2000, height: 1000 }), input: () => ({ transform: () => ({ output: async () => out }) }) },
      MEDIA: {
        put: async (k: string, v: unknown) => {
          if (++puts === failOnPut) throw new Error('R2 down');
          r2.set(k, v);
        },
        list: async ({ prefix }: { prefix: string }) => ({ objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
        delete: async (keys: string[]) => keys.forEach((k) => r2.delete(k)),
      },
    } as unknown as Parameters<typeof storeImage>[2];
    return { env, r2 };
  }

  it('writes every width in every format and reports the largest size', async () => {
    const { env, r2 } = fakeEnv();
    expect(await storeImage(JPG, 'uploads/a', env)).toEqual({ key: 'uploads/a', width: 1600, height: 800 });
    expect([...r2.keys()].sort()).toEqual(
      ['480', '960', '1600'].flatMap((w) => [`uploads/a/${w}.avif`, `uploads/a/${w}.webp`]).sort(),
    );
  });

  it('removes the variants already written when a later write fails', async () => {
    const { env, r2 } = fakeEnv(4);
    r2.set('uploads/other/480.webp', 1);
    const err = await storeImage(JPG, 'uploads/a', env).catch((e: UploadError) => e);
    expect(err).toMatchObject({ code: 'process_failed', status: 500 });
    expect([...r2.keys()]).toEqual(['uploads/other/480.webp']);
  });
});
