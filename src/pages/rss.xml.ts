// 글 RSS /rss.xml
// - 글(kind post)만 담는다. 노트는 /notes/rss.xml이다(4단계 D12).
// - 발행·숨김·삭제 때 posts 태그로 CDN 캐시를 비운다(2단계 Plan D8).
export const prerender = false;

import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedContentPosts } from '@/lib/content-posts';
import { SITE_DESCRIPTION, SITE_TITLE } from '@/lib/public-paths';
import { POSTS_CACHE_TAG } from '@/lib/server/cache-headers';

export async function GET(context: APIContext) {
  const posts = await getPublishedContentPosts();

  const response = await rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site || 'https://www.cruzlab.dev',
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: post.pubDate,
      link: `/blog/${post.slug}/`,
    })),
  });
  response.headers.set('Vercel-Cache-Tag', POSTS_CACHE_TAG);
  return response;
}
