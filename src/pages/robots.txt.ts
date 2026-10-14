export const prerender = true;

import type { APIContext } from 'astro';

// robots.txt 생성
// - 관리자 화면과 API는 크롤링 대상에서 제외
// - 사이트맵 주소는 astro.config.mjs의 site 값을 기준으로 만든다
export function GET(context: APIContext) {
  const sitemapUrl = new URL('/sitemap-index.xml', context.site);

  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    `Sitemap: ${sitemapUrl.href}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
