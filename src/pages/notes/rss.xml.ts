// 노트 RSS /notes/rss.xml (재건 4단계 D12)
// - 노트만 담는다. /rss.xml은 글만 그대로다(구독자가 기대하는 것은 긴 글이다).
// - 제목이 없는 노트는 "노트 · 2026-11-09"로, 설명은 본문 첫 줄(120자)로 쓴다.
// - 발행·숨김·삭제 때 posts 태그로 CDN 캐시를 비운다.
export const prerender = false;

import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedNoteEntries } from '@/lib/content-posts';
import { firstLineExcerpt } from '@/lib/content/excerpt';
import { formatSeoulDate } from '@/lib/date-format';
import { notePath, SITE_TITLE } from '@/lib/public-paths';
import { POSTS_CACHE_TAG, setPublicPageCache } from '@/lib/server/cache-headers';

export async function GET(context: APIContext) {
  const notes = await getPublishedNoteEntries();

  const response = await rss({
    title: `${SITE_TITLE} 노트`,
    description: 'Cruz의 짧은 기록',
    site: context.site || 'https://www.cruzlab.dev',
    items: notes.map((note) => ({
      title: note.title || `노트 · ${formatSeoulDate(note.publishedAt)}`,
      description: note.description || firstLineExcerpt(note.markdown),
      pubDate: note.publishedAt,
      link: notePath(note.slug),
    })),
  });
  setPublicPageCache(response.headers, [POSTS_CACHE_TAG]);
  return response;
}
