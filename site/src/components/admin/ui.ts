// Shared browser helpers for the admin pages: API calls, the live notice, and upload checks.

const STASH = 'admin-notice';
export const MAX_BYTES = 15 * 1024 * 1024; // matches MAX_UPLOAD_BYTES in lib/images.ts
const TYPES = /^image\/(jpeg|png|webp|heic|heif)$/;
const EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

export function announce(message: string, kind: 'ok' | 'error' = 'ok') {
  const el = document.getElementById('notice');
  if (!el) return;
  el.textContent = '';
  el.dataset.kind = kind;
  // A fresh text node after clearing makes screen readers re-read a repeated message.
  requestAnimationFrame(() => (el.textContent = message));
}

/** Reloads the page and shows `message` once it's back, for changes that re-render the page. */
export function reloadWith(message: string) {
  sessionStorage.setItem(STASH, message);
  location.reload();
}

export function showStashedNotice() {
  const message = sessionStorage.getItem(STASH);
  if (!message) return;
  sessionStorage.removeItem(STASH);
  announce(message);
}

/** fetch() that returns the JSON body, or throws an Error with the server's plain-words message. */
export async function api<T = Record<string, unknown>>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  if (json !== undefined) {
    rest.body = JSON.stringify(json);
    rest.headers = { 'Content-Type': 'application/json' };
  }
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...rest });
  } catch {
    throw new Error('No connection. Check your signal and try again.');
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    if (res.status === 403 && !body) throw new Error('Your admin sign-in has expired. Reload the page to sign in again.');
    throw new Error(body?.error ?? `Something went wrong (error ${res.status}). Please try again.`);
  }
  return body as T;
}

export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Plain-words problem with a chosen photo, or null when it can be uploaded. The server checks again. */
export function checkPhoto(file: File): string | null {
  // Some phones leave HEIC files with an empty type, so fall back to the extension.
  if (!(TYPES.test(file.type) || (!file.type && EXT.test(file.name)))) {
    return 'That file isn’t a photo we can use. Pick a JPG, PNG, WebP or HEIC.';
  }
  if (file.size > MAX_BYTES) {
    return `That photo is ${formatSize(file.size)}. The limit is 15 MB. Try a screenshot of it, or pick a smaller one.`;
  }
  return null;
}
