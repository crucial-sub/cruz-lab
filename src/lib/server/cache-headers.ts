// 공개 SSR 페이지용 CDN 캐시 헤더
// - 브라우저는 매번 다시 확인한다 (max-age=0).
// - CDN(Vercel)은 60초 동안 저장한 응답을 바로 준다 (s-maxage=60).
// - 60초가 지나면 오래된 응답을 먼저 주고 뒤에서 새로 만든다 (stale-while-revalidate).
// - 사용자별 내용이 없는 페이지에만 쓴다. 관리자 페이지와 관리자 API에는 쓰지 않는다.
// - Vercel-Cache-Tag로 태그를 붙인다. 발행·숨김·삭제 때 태그로 CDN 캐시를 비운다(Plan D8).
export const PUBLIC_PAGE_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400';

// 캐시 태그
// - 목록성 페이지(홈, /blog, 태그, /series/*, RSS, 사이트맵): posts
// - 글 상세: posts, post-<id>
export const POSTS_CACHE_TAG = 'posts';
export function postCacheTag(entryId: string) {
  return `post-${entryId}`;
}

export function setPublicPageCache(headers: Headers, tags: string[] = [POSTS_CACHE_TAG]) {
  headers.set('Cache-Control', PUBLIC_PAGE_CACHE_CONTROL);
  if (tags.length > 0) headers.set('Vercel-Cache-Tag', tags.join(','));
}
