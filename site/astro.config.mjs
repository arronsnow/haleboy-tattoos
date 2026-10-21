// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://haleboy.tattoo', // TODO: replace with the production domain
  output: 'server',
  adapter: cloudflare({ imageService: 'cloudflare-binding' }),
});
