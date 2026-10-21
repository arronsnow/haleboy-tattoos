// Site text he can edit in /admin/content. Stored in D1 `content` as key/value rows;
// any key without a row (or a fresh database) uses the default below.

export const CONTENT_FIELDS = {
  about_1: {
    group: 'About',
    label: 'About, paragraph 1',
    max: 600,
    multiline: true,
    default:
      'Eathan tattoos the things he grew up on: anime heroes, video game icons, cartoon characters and the odd samurai. Every custom piece starts as a drawing made for you, then gets reworked until it reads clean on skin.',
  },
  about_2: {
    group: 'About',
    label: 'About, paragraph 2',
    max: 600,
    multiline: true,
    default:
      'He’s dedicated to the craft and sharpens his skills every day. He loves a challenge, whether it’s his own drawing or a commission you bring him, and he takes every chance to grow.',
  },
  about_3: {
    group: 'About',
    label: 'About, paragraph 3',
    max: 600,
    multiline: true,
    default:
      'He also brings the cheer to the shop, with an infectious laugh and a sense of humor to match. Tattooing is the career he dreamed of, and he’s all in.',
  },
  styles: { group: 'About', label: 'Styles', max: 120, multiline: false, default: 'Anime, video game, new school, Japanese' },
  deposit: {
    group: 'Booking',
    label: 'Deposit amount',
    hint: 'Shown in step 二, e.g. "A $50 deposit". Leave empty to just say "A deposit".',
    max: 40,
    multiline: false,
    default: '',
  },
  address_street: { group: 'Shop', label: 'Street address', max: 120, multiline: false, default: '143 Cherokee Heights Drive' },
  address_city: { group: 'Shop', label: 'City, state and ZIP', max: 80, multiline: false, default: 'Maryville, TN 37801' },
  phone: { group: 'Shop', label: 'Phone', max: 30, multiline: false, default: '(865) 724-1322' },
  hours: {
    group: 'Shop',
    label: 'Hours',
    hint: 'One line per row on the site.',
    max: 300,
    multiline: true,
    default: 'Tuesday to Saturday, 12pm to 7pm\nClosed Sunday and Monday\nAppointments and walk-ins',
  },
} as const satisfies Record<string, { group: string; label: string; hint?: string; max: number; multiline: boolean; default: string }>;

export type ContentKey = keyof typeof CONTENT_FIELDS;
export type Content = Record<ContentKey, string>;

const KEYS = Object.keys(CONTENT_FIELDS) as ContentKey[];
export const isContentKey = (k: string): k is ContentKey => (KEYS as string[]).includes(k);

export async function getContent(db: D1Database): Promise<Content> {
  const out = Object.fromEntries(KEYS.map((k) => [k, CONTENT_FIELDS[k].default])) as Content;
  // A database without the migration yet still renders the defaults.
  const rows = await db
    .prepare('SELECT key, value FROM content')
    .all<{ key: string; value: string }>()
    .then((r) => r.results)
    .catch(() => []);
  for (const r of rows) if (isContentKey(r.key)) out[r.key] = r.value;
  return out;
}

export async function saveContent(db: D1Database, values: Partial<Content>): Promise<void> {
  const stmts = Object.entries(values).map(([k, v]) =>
    db
      .prepare(
        `INSERT INTO content (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .bind(k, v),
  );
  if (stmts.length) await db.batch(stmts);
}

/** Non-empty lines of a multi-line field. */
export const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean);

/** tel: href for a US number written any way, e.g. "(865) 724-1322" → "tel:+18657241322". */
export function telHref(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return `tel:${d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === '1' ? `+${d}` : d}`;
}
