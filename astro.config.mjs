// astro.config.mjs
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';
import { defineConfig, sharpImageService } from 'astro/config';
import { fileURLToPath } from 'node:url';

// 실제 서비스 주소 (cruzlab.dev는 www로 리다이렉트됨)
// - canonical, RSS, 사이트맵이 모두 이 값을 기준으로 만들어진다
const SITE = 'https://www.cruzlab.dev';

export default defineConfig({
  site: SITE,
  output: 'server', // SSR 모드 (Astro 5)
  adapter: vercel(),
  integrations: [
    mdx(),
    sitemap({
      // 관리자 페이지는 사이트맵에서 제외
      filter: (page) => !new URL(page).pathname.startsWith('/admin'),
      // SSR로 렌더링되는 글·시리즈는 빌드 시점에 수집되지 않으므로 별도 사이트맵으로 제공
      customSitemaps: [`${SITE}/sitemap-posts.xml`],
    }),
    react(),
    tailwind(),
  ],
  image: {
    service: sharpImageService(),
    domains: ['firebasestorage.googleapis.com'],
    remotePatterns: [{ protocol: 'https' }],
  },
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
      include: ['react', 'react-dom', 'framer-motion'],
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
