// 발행·숨김·삭제 뒤 공개 캐시 비우기 (재건 2단계 D8)
// 1. 이 서버 인스턴스의 메모리 캐시를 비운다.
// 2. Vercel CDN 캐시를 태그로 비운다(invalidateByTag). 태그 범위는 환경별이다.
// - Vercel 밖(로컬)에서는 CDN 퍼지를 건너뛰고 'skipped'를 돌려준다.
// - 퍼지가 실패해도 발행은 성공이다. 60초 TTL이 지나면 새 내용이 나온다.

import { invalidateByTag } from '@vercel/functions';
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
    await invalidateByTag([POSTS_CACHE_TAG, postCacheTag(entryId)]);
    return 'ok';
  } catch (error) {
    console.error('[cdn-purge] 캐시 태그 퍼지 실패', error);
    return 'failed';
  }
}
