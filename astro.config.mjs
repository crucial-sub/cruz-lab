// astro.config.mjs
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  site: 'https://cruzlab.dev',
  integrations: [mdx(), sitemap(), react(), tailwind()],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // 필요하면 추가
        // "@content": fileURLToPath(new URL("./src/content", import.meta.url)),
      },
    },
  },
});
