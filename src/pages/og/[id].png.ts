// 글·노트·프로젝트 글의 OG 이미지 /og/<글 ID>.png (재건 4단계 D13, SSR)
// - 글 ID로 발행본을 읽어 카드(og-template.ts)를 그린다. ID는 slug가 바뀌어도 같다.
// - 캐시: CDN 하루(s-maxage=86400) + 태그 posts,post-<id>. 재발행하면 post-<id> 퍼지가 이미지도 비운다.
// - 없는 글·발행되지 않은 글은 404(캐시 헤더 없음). 404 화면으로 바꿔 그리지 않는다(X-Astro-Reroute: no).
import type { APIRoute } from 'astro';
import { firstLineExcerpt } from '@/lib/content/excerpt';
import { isOgEntryId, ogInputForEntry } from '@/lib/og-template';
import { POSTS_CACHE_TAG, postCacheTag } from '@/lib/server/cache-headers';
import { getPublishedEntryById, listSeriesMeta } from '@/lib/server/entries';
import { OG_CACHE_CONTROL, renderOgPng } from '@/lib/server/og-image';

export const prerender = false;

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Astro-Reroute': 'no' },
  });
}

export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? '';
  // Firestore 문서 ID로 쓸 수 있는 값만 받는다(자동 ID, project-<key>-<한글일 수 있는 slug>)
  if (!isOgEntryId(id)) return notFound();
  const entry = await getPublishedEntryById(id);
  if (!entry) return notFound();

  const projectTitle =
    entry.kind === 'project' && entry.series
      ? (await listSeriesMeta()).get(entry.series.key)?.title
      : undefined;
  const png = await renderOgPng(
    ogInputForEntry(entry, {
      noteFirstLine: entry.kind === 'note' ? firstLineExcerpt(entry.markdown) : undefined,
      projectTitle,
    }),
  );
  return new Response(png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': OG_CACHE_CONTROL,
      'Vercel-Cache-Tag': `${POSTS_CACHE_TAG},${postCacheTag(entry.id)}`,
    },
  });
};
