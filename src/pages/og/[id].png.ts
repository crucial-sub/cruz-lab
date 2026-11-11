// 글·노트·프로젝트 글의 OG 이미지 /og/<글 ID>.png (재건 4단계 D13, SSR)
// - 글 ID로 발행본을 읽어 카드(og-template.ts)를 그린다. ID는 slug가 바뀌어도 같다.
// - 캐시: CDN 하루(s-maxage=86400) + 태그 posts,post-<id>. 재발행하면 post-<id> 퍼지가 이미지도 비운다.
// - 없는 글·발행되지 않은 글은 404(캐시 헤더 없음). 404 화면으로 바꿔 그리지 않는다(X-Astro-Reroute: no).
// - Server-Timing(5단계 T13, D17): db(글 읽기), title(프로젝트 제목), 그리기 단계(og-image.ts), total, inst.
import type { APIRoute } from 'astro';
import { firstLineExcerpt } from '@/lib/content/excerpt';
import { isOgEntryId, ogInputForEntry } from '@/lib/og-template';
import { POSTS_CACHE_TAG, postCacheTag } from '@/lib/server/cache-headers';
import { getPublishedEntryById, getSeriesTitleFresh } from '@/lib/server/entries';
import { OG_CACHE_CONTROL, renderOgPng } from '@/lib/server/og-image';
import { SERVER_TIMING_HEADER, ServerTiming } from '@/lib/server/server-timing';

export const prerender = false;

function notFound(timing: ServerTiming) {
  return new Response('Not found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Astro-Reroute': 'no',
      [SERVER_TIMING_HEADER]: timing.header(),
    },
  });
}

export const GET: APIRoute = async ({ params }) => {
  const timing = new ServerTiming();
  const id = params.id ?? '';
  // Firestore 문서 ID로 쓸 수 있는 값만 받는다(자동 ID, project-<key>-<한글일 수 있는 slug>)
  if (!isOgEntryId(id)) return notFound(timing);
  const entry = await timing.measure('db', () => getPublishedEntryById(id), 'firestore entry');
  if (!entry) return notFound(timing);

  // 프로젝트 제목은 메모 없이 읽는다(화면에서 고친 직후 낡은 제목으로 그린 OG가 하루 남지 않게)
  const seriesKey = entry.kind === 'project' ? entry.series?.key : undefined;
  const projectTitle = seriesKey
    ? await timing.measure('title', () => getSeriesTitleFresh(seriesKey), 'firestore project title')
    : undefined;
  const png = await renderOgPng(
    ogInputForEntry(entry, {
      noteFirstLine: entry.kind === 'note' ? firstLineExcerpt(entry.markdown) : undefined,
      projectTitle,
    }),
    timing,
  );
  return new Response(png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': OG_CACHE_CONTROL,
      'Vercel-Cache-Tag': `${POSTS_CACHE_TAG},${postCacheTag(entry.id)}`,
      [SERVER_TIMING_HEADER]: timing.header(),
    },
  });
};
