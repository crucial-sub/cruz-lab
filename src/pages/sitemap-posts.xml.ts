export const prerender = false;

import type { APIContext } from 'astro';
import { getPublishedContentPosts, getPublishedSeriesList } from '@/lib/content-posts';
import { POSTS_CACHE_TAG } from '@/lib/server/cache-headers';

// XML 본문에 넣을 값의 특수문자 이스케이프
function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 글·연재 사이트맵
// - 블로그 글과 연재는 요청 시점에 Firestore(entries)에서 읽어 오므로 @astrojs/sitemap이 수집하지 못한다
// - 연재 주소는 entries의 published.series.key로 만든다(옛 /series/wesbos 등은 없다)
// - astro.config.mjs의 customSitemaps를 통해 sitemap-index.xml에 연결된다
export async function GET(context: APIContext) {
  const site = context.site ?? new URL(context.url.origin);
  const [posts, seriesList] = await Promise.all([getPublishedContentPosts(), getPublishedSeriesList()]);

  const entries = [
    ...posts.map((post) => ({
      loc: new URL(`/blog/${post.slug}`, site).href,
      lastmod: post.updatedDate,
    })),
    ...seriesList.map((series) => ({
      loc: new URL(`/series/${series.key}`, site).href,
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
      // 발행·숨김·삭제 때 posts 태그로 CDN 캐시를 비운다(Plan D8)
      'Vercel-Cache-Tag': POSTS_CACHE_TAG,
    },
  });
}
