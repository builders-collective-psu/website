import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://psu.builders',
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  // `astro dev` cannot run the Vercel functions in /api, so in dev forward
  // them to production. Keeps live figures working locally without the key.
  vite: {
    server: {
      proxy: {
        '/api': { target: 'https://www.psu.builders', changeOrigin: true },
      },
    },
  },
});
