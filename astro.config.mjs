// astro.config.mjs
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';
import { defineConfig, sharpImageService } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  site: 'https://cruzlab.dev',
  output: 'server', // SSR 모드 (Astro 5)
  adapter: vercel(),
  integrations: [mdx(), sitemap(), react(), tailwind()],
  image: {
    service: sharpImageService(),
    domains: ['firebasestorage.googleapis.com'],
    remotePatterns: [{ protocol: 'https' }],
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false, // public/manifest.json 사용
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'firebase-images',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30일
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1년
                },
              },
            },
          ],
        },
      }),
    ],
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
