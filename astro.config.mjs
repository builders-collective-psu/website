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
  // `astro dev` cannot run the Vercel functions in /api. Set API_PROXY to a
  // deployment (e.g. API_PROXY=https://bc.matmanna.dev) to forward /api there
  // for live data; without it nothing is proxied, so local work does not
  // quietly load the production database.
  vite: {
    server: {
      proxy: process.env.API_PROXY
        ? { '/api': { target: process.env.API_PROXY, changeOrigin: true } }
        : {},
    },
  },
});
