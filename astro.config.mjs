// astro.config.mjs
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  site: 'https://cruzlab.dev',
  output: 'server', // SSR 모드 (Astro 5)
  adapter: vercel(),
  integrations: [mdx(), sitemap(), react(), tailwind()],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // Vite 의존성 최적화 캐시 문제 해결
    optimizeDeps: {
      // 개발 서버 시작 시 항상 의존성 재스캔
      force: true,
      // 자주 사용하는 의존성 미리 번들링
      include: [
        'react',
        'react-dom',
        'framer-motion',
        '@milkdown/kit/core',
        '@milkdown/kit/preset/commonmark',
        '@milkdown/kit/preset/gfm',
      ],
    },
    server: {
      // HMR 연결 안정성 향상
      hmr: {
        overlay: true,
      },
      // 파일 감시 안정성
      watch: {
        usePolling: false,
      },
    },
  },
});
