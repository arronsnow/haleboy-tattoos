import { env } from 'cloudflare:workers';
import { BadInput, adminRoute, json, readJson, text } from '../../../lib/admin';
import { CONTENT_FIELDS, getContent, isContentKey, saveContent, type Content } from '../../../lib/content';

/** PUT {key: value, ...}: saves the given fields. Unknown keys are rejected so a typo can't silently do nothing. */
export const PUT = adminRoute(async ({ request }) => {
  const body = await readJson(request);
  const values: Partial<Content> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!isContentKey(k)) throw new BadInput(`"${k}" isn’t a field that can be edited.`);
    const f = CONTENT_FIELDS[k];
    // Single-line fields lose any pasted line breaks; multi-line ones keep them but drop Windows \r.
    const raw = typeof v === 'string' ? (f.multiline ? v.replace(/\r/g, '') : v.replace(/\s*\n\s*/g, ' ')) : v;
    values[k] = text(raw, f.label, f.max) ?? '';
  }
  if (!Object.keys(values).length) throw new BadInput('There’s nothing to change.');
  await saveContent(env.DB, values);
  return json({ content: await getContent(env.DB) });
});
