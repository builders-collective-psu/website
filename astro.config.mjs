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
  // them to production (or API_PROXY). Keeps live figures working locally.
  vite: {
    server: {
      proxy: {
        '/api': { target: process.env.API_PROXY || 'https://www.psu.builders', changeOrigin: true },
      },
    },
  },
});
