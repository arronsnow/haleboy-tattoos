// Read-side contract for the public page. Everything here is read per request,
// so admin changes and Instagram refreshes show up without a rebuild.

import { getPortrait, listFeatured, listFlash, listGallery } from './db';
import { responsiveImage, type ResponsiveImage } from './images';

export const INSTAGRAM_URL = 'https://www.instagram.com/haleboy.tattoos/';

/**
 * KV `ig:feed`, written by the hourly Instagram job:
 *   {
 *     updatedAt: string,              // ISO time of the successful fetch
 *     posts: Array<{
 *       id: string,                   // Instagram media id
 *       permalink: string,            // https://www.instagram.com/p/...
 *       caption: string,              // may be ''
 *       mediaType: 'IMAGE' | 'CAROUSEL_ALBUM' | 'VIDEO',
 *       timestamp: string,            // ISO
 *       image: { key: string, width: number, height: number }  // from storeImage(), key `ig/<id>`
 *     }>                              // newest first, at most 12
 *   }
 *
 * KV `ig:status`, written by the same job on every run:
 *   {
 *     state: 'ok' | 'error' | 'token_invalid',  // 'error' = transient (cache still served)
 *     checkedAt: string,
 *     errorCode?: string, message?: string,
 *     tokenExpiresAt?: string                   // ISO, for the admin status panel
 *   }
 */
export interface IgFeed {
  updatedAt: string;
  posts: {
    id: string;
    permalink: string;
    caption: string;
    mediaType: 'IMAGE' | 'CAROUSEL_ALBUM' | 'VIDEO';
    timestamp: string;
    image: { key: string; width: number; height: number };
  }[];
}

export interface IgStatus {
  state: 'ok' | 'error' | 'token_invalid';
  checkedAt: string;
  errorCode?: string;
  message?: string;
  tokenExpiresAt?: string;
}

export const IG_FEED_KEY = 'ig:feed';
export const IG_STATUS_KEY = 'ig:status';

export interface WorkPanel {
  /** null for seeded placeholders: render the design's empty box with `caption`. */
  image: ResponsiveImage | null;
  alt: string;
  caption: string;
  href: string;
}

export interface WorkPanels {
  source: 'instagram' | 'featured';
  panels: WorkPanel[];
}

type FeedEnv = Pick<Env, 'DB' | 'IG_CACHE'>;

const image = (key: string | null, w: number | null, h: number | null) =>
  key && w && h ? responsiveImage(key, w, h) : null;

function altFromCaption(caption: string): string {
  const line = caption.split('\n')[0].replace(/#\S+/g, '').trim();
  if (!line) return 'Tattoo by Haleboy';
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/** First panel is the large featured one. Instagram when the cache is usable, else admin's featured pieces. */
export async function getWorkPanels(env: FeedEnv): Promise<WorkPanels> {
  const [feed, status] = await Promise.all([
    env.IG_CACHE.get<IgFeed>(IG_FEED_KEY, 'json').catch(() => null),
    env.IG_CACHE.get<IgStatus>(IG_STATUS_KEY, 'json').catch(() => null),
  ]);

  if (feed?.posts?.length && status?.state !== 'token_invalid') {
    return {
      source: 'instagram',
      panels: feed.posts.map((p) => ({
        image: responsiveImage(p.image.key, p.image.width, p.image.height),
        alt: altFromCaption(p.caption),
        caption: p.caption,
        href: p.permalink,
      })),
    };
  }

  const featured = await listFeatured(env.DB);
  return {
    source: 'featured',
    panels: featured.map((f) => {
      const caption = [f.title, f.placement].filter(Boolean).join(', ');
      return {
        image: image(f.r2_key, f.width, f.height),
        alt: caption ? `Tattoo: ${caption}` : 'Tattoo by Haleboy',
        caption,
        href: INSTAGRAM_URL,
      };
    }),
  };
}

export interface GalleryItem {
  id: number;
  title: string;
  placement: string;
  image: ResponsiveImage;
}

/** Hand-uploaded portfolio pieces, in his order. Rows without a photo are skipped. */
export async function getGallery(env: Pick<Env, 'DB'>): Promise<GalleryItem[]> {
  // A database without the gallery migration yet just shows no gallery.
  const rows = await listGallery(env.DB).catch(() => []);
  return rows.flatMap((r) => {
    const img = image(r.r2_key, r.width, r.height);
    return img ? [{ id: r.id, title: r.title, placement: r.placement, image: img }] : [];
  });
}

export interface FlashItem {
  id: number;
  name: string;
  price: string;
  taken: boolean;
  /** null for seeded placeholders: render the design's "[Flash design]" box. */
  image: ResponsiveImage | null;
}

export async function getFlash(env: Pick<Env, 'DB'>): Promise<FlashItem[]> {
  const rows = await listFlash(env.DB);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: r.price,
    taken: r.taken === 1,
    image: image(r.r2_key, r.width, r.height),
  }));
}

/**
 * The uploaded portrait, or null to use the bundled default:
 *   import eathan from '../assets/eathan.jpg';  <Picture src={eathan} formats={['avif','webp']} />
 */
export async function getPortraitImage(env: Pick<Env, 'DB'>): Promise<ResponsiveImage | null> {
  const p = await getPortrait(env.DB);
  return p ? responsiveImage(p.r2_key, p.width, p.height) : null;
}
