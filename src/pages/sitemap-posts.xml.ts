export const prerender = false;

import type { APIContext } from 'astro';
import { buildCategoryTabs, buildTagChips } from '@/lib/blog-list';
import {
  getPublishedContentPosts,
  getPublishedNoteEntries,
  getPublishedProjects,
  getPublishedSeriesList,
} from '@/lib/content-posts';
import { notePath, projectPostPath, seriesPath } from '@/lib/public-paths';
import { POSTS_CACHE_TAG } from '@/lib/server/cache-headers';
import { getTaxonomy } from '@/lib/server/taxonomy-store';
import { blogPath } from '@/lib/slug-lookup';

// XML 본문에 넣을 값의 특수문자 이스케이프
function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 요청 때 그리는 공개 주소 사이트맵 (재건 4단계 D11·D12)
// - @astrojs/sitemap(sitemap-0.xml)은 주소가 고정된 페이지만 빌드 때 모은다: prerender 페이지(/about)와
//   매개변수가 없는 SSR 페이지(/, /blog/, /notes/, /series/, /projects/). 그래서 여기에는 넣지 않는다(4단계 PR-B 리뷰 경미 7).
// - 여기에는 매개변수가 있는 주소를 entries로 만든다: 글, 발행 글이 있는 카테고리·태그(D11), 노트(D12), 연재,
//   프로젝트 글(D1. 3단계까지는 prerender라 sitemap-0.xml에 있었다). /projects/<key>는 302라 넣지 않는다.
//   글이 없는 카테고리·태그 주소는 404라 넣지 않는다.
// - astro.config.mjs의 customSitemaps로 sitemap-index.xml에 연결된다.
export async function GET(context: APIContext) {
  const site = context.site ?? new URL(context.url.origin);
  const [posts, notes, seriesList, projects] = await Promise.all([
    getPublishedContentPosts(),
    getPublishedNoteEntries(),
    getPublishedSeriesList(),
    getPublishedProjects(),
  ]);

  // 목록 페이지의 lastmod는 그 목록에서 가장 최근에 바뀐 글이다
  const latest = (dates: Date[]) => new Date(Math.max(0, ...dates.map((date) => date.getTime())));

  const entries = [
    ...posts.map((post) => ({ path: blogPath(post.slug), lastmod: post.updatedDate })),
    ...buildCategoryTabs(posts, (await getTaxonomy()).categories.map((category) => category.key)).map((tab) => ({
      path: tab.href,
      lastmod: latest(posts.filter((post) => post.category === tab.key).map((post) => post.updatedDate)),
    })),
    ...buildTagChips(posts).map((chip) => ({
      path: chip.href,
      lastmod: latest(posts.filter((post) => post.tags.includes(chip.tag)).map((post) => post.updatedDate)),
    })),
    ...notes.map((note) => ({ path: notePath(note.slug), lastmod: note.lastPublishedAt })),
    ...seriesList.map((series) => ({ path: seriesPath(series.key), lastmod: series.updatedAt })),
    ...projects.flatMap((project) =>
      project.posts.map((post) => ({ path: projectPostPath(project.key, post.slug), lastmod: post.updatedDate })),
    ),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      (entry) =>
        `<url><loc>${escapeXml(new URL(entry.path, site).href)}</loc><lastmod>${entry.lastmod.toISOString()}</lastmod></url>`,
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
