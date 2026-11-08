export const prerender = false;

import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { getPublishedContentPosts } from '@/lib/content-posts';
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
  // 발행·숨김·삭제 때 posts 태그로 CDN 캐시를 비운다(Plan D8)
  response.headers.set('Vercel-Cache-Tag', POSTS_CACHE_TAG);
  return response;
}
