// 발행·숨김·삭제 뒤 공개 캐시 비우기 (재건 2단계 D8, 3단계 D7)
// 1. 이 서버 인스턴스의 메모리 캐시를 비운다.
// 2. Vercel CDN 캐시를 태그로 비운다. 태그 범위는 환경별이다.
//    - 글 상세 태그 post-<id>: dangerouslyDeleteByTag. 작성자가 발행 직후 여는 주소라 첫 요청부터 새 내용이어야 한다.
//    - 목록 태그 posts: invalidateByTag. 독자가 많이 여는 주소라 옛 응답을 주면서 뒤에서 새로 만든다.
// - Vercel 밖(로컬)에서는 CDN 퍼지를 건너뛰고 'skipped'를 돌려준다.
// - 퍼지가 실패해도 발행은 성공이다. 60초 TTL이 지나면 새 내용이 나온다.

import { dangerouslyDeleteByTag, invalidateByTag } from '@vercel/functions';
import { POSTS_CACHE_TAG, postCacheTag } from './cache-headers';
import { invalidateEntriesCache } from './entries';

export type PurgeResult = 'ok' | 'skipped' | 'failed';

// Vercel 함수 안에서 도는지. Vercel은 실행 환경에 VERCEL=1을 둔다
function isOnVercel(): boolean {
  return process.env.VERCEL === '1';
}

// 글 하나가 바뀐 뒤 공개 캐시를 비운다
export async function purgePublicCache(entryId: string): Promise<PurgeResult> {
  invalidateEntriesCache();
  if (!isOnVercel()) return 'skipped';
  try {
    await Promise.all([
      dangerouslyDeleteByTag(postCacheTag(entryId)),
      invalidateByTag(POSTS_CACHE_TAG),
    ]);
    return 'ok';
  } catch (error) {
    console.error('[cdn-purge] 캐시 태그 퍼지 실패', error);
    return 'failed';
  }
}

// 한 번에 비울 글 태그 수. Vercel 퍼지 요청 하나에 태그를 너무 많이 싣지 않게 나눈다
const PURGE_TAG_CHUNK = 50;

// 여러 글이 함께 바뀐 뒤(분류·연재 바꾸기, 5단계 D1·D2) 공개 캐시를 비운다
// - 글 상세 태그는 나눠서 지우고, 목록 태그는 한 번 무효화한다. 글이 0편이어도 목록은 비운다.
export async function purgePublicCacheMany(entryIds: readonly string[]): Promise<PurgeResult> {
  invalidateEntriesCache();
  if (!isOnVercel()) return 'skipped';
  try {
    const tags = [...new Set(entryIds)].map(postCacheTag);
    const chunks: string[][] = [];
    for (let index = 0; index < tags.length; index += PURGE_TAG_CHUNK) chunks.push(tags.slice(index, index + PURGE_TAG_CHUNK));
    await Promise.all([...chunks.map((chunk) => dangerouslyDeleteByTag(chunk)), invalidateByTag(POSTS_CACHE_TAG)]);
    return 'ok';
  } catch (error) {
    console.error('[cdn-purge] 여러 글 캐시 태그 퍼지 실패', error);
    return 'failed';
  }
}
