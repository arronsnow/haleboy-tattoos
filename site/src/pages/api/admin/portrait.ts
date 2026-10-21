import { env } from 'cloudflare:workers';
import { adminRoute, dropImage, json, readUpload, uploadThen } from '../../../lib/admin';
import { clearPortrait, setPortrait } from '../../../lib/db';
import { responsiveImage } from '../../../lib/images';

/** Replaces the About portrait. The old R2 objects are deleted only after the new row is saved. */
export const POST = adminRoute(async ({ request }) => {
  const { file } = await readUpload(request);
  const { img, old } = await uploadThen(file, async (img) => ({ img, old: await setPortrait(env.DB, img) }));
  await dropImage(old);
  return json({ portrait: responsiveImage(img.key, img.width, img.height) });
});

/** Goes back to the bundled default portrait. */
export const DELETE = adminRoute(async () => {
  await dropImage(await clearPortrait(env.DB));
  return json({ portrait: null });
});
