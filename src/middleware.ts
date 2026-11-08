// 요청 미들웨어 (재건 2단계)
// - 공개 주소의 301 리다이렉트(Plan 7.4). 공개 요청에서는 쿠키를 읽지도 쓰지도 않는다(D5).
// - prerender 페이지는 미들웨어를 거치지 않는다. 리다이렉트 대상 경로는 모두 SSR이다.

import { defineMiddleware } from 'astro:middleware';
import { findPublicRedirect } from '@/lib/redirects';

export const onRequest = defineMiddleware(async (context, next) => {
  const redirectTo = findPublicRedirect(context.url.pathname);
  if (redirectTo) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: `${redirectTo}${context.url.search}`,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  }
  return next();
});
