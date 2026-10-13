export const prerender = false;

import type { APIContext } from 'astro';
import { getPublishedContentPosts } from '@/lib/content-posts';
import { getPublishedSeries } from '@/lib/series';

// XML 본문에 넣을 값의 특수문자 이스케이프
function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 글·시리즈 사이트맵
// - 블로그 글과 시리즈는 요청 시점에 Firestore에서 읽어 오므로 @astrojs/sitemap이 수집하지 못한다
// - astro.config.mjs의 customSitemaps를 통해 sitemap-index.xml에 연결된다
export async function GET(context: APIContext) {
  const site = context.site ?? new URL(context.url.origin);
  const [posts, seriesList] = await Promise.all([getPublishedContentPosts(), getPublishedSeries()]);

  const entries = [
    ...posts.map((post) => ({
      loc: new URL(`/blog/${post.slug}`, site).href,
      lastmod: post.updatedDate,
    })),
    ...seriesList.map((series) => ({
      loc: new URL(`/series/${series.slug}`, site).href,
      lastmod: series.updatedAt,
    })),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      (entry) =>
        `<url><loc>${escapeXml(entry.loc)}</loc><lastmod>${entry.lastmod.toISOString()}</lastmod></url>`,
    ),
    '</urlset>',
  ].join('');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // 크롤러 요청마다 Firestore를 읽지 않도록 CDN에서 1시간 캐시
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
