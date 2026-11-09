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
  // 함수 최대 실행 시간 60초 (재건 2단계 Plan 6.4)
  // - 이미지 변형(finalize)이 몇 초 걸린다. Fluid compute 설정과 상관없이 Hobby 한도 안의 같은 값을 쓴다.
  adapter: vercel({ maxDuration: 60 }),
  integrations: [
    mdx(),
    sitemap({
      // 관리자 페이지는 사이트맵에서 제외
      filter: (page) => !new URL(page).pathname.startsWith('/admin'),
      // SSR로 렌더링되는 글·시리즈는 빌드 시점에 수집되지 않으므로 별도 사이트맵으로 제공
      customSitemaps: [`${SITE}/sitemap-posts.xml`],
    }),
    react(),
    // base.css 자동 주입을 끈다. global.css가 @tailwind 지시문을 갖고, 모든 페이지 틀(BaseLayout·AdminPage)이
    // global.css를 가져온다. 켜 두면 preflight·utilities가 한 벌 더 나갔다(4단계 PR-B 리뷰 경미 10)
    tailwind({ applyBaseStyles: false }),
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
      // 자주 사용하는 의존성 미리 번들링 (React는 관리자 화면만 쓴다. framer-motion은 4단계에서 지웠다)
      include: ['react', 'react-dom'],
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
