// 글 하나의 독자 흐름 API (재건 5단계 D20)
// - GET /api/admin/readers/{글 ID}?days=30|90 (기본 30) → { id, days, today, from, summary, paths, pruned }
//   summary: 날짜별 방문·조회, 합계(방문·조회·75%·100% 읽음·바깥 링크·코드 복사·다음 페이지로 간 수), 들어온 곳, 다음 글, 전 글.
//   paths: 이 글을 연 최근 방문 10개의 경로 예(원본 줄). 비율(읽음·떠남)은 화면이 계산한다(daily.ts rateOf·exitsOf).
// - 글이 없거나 지웠어도 오류가 아니다(기록은 남는다). 제목은 앱이 목록 API로 잇는다.
// - 사이트 요약 API처럼 열 때 90일이 지난 원본 줄을 500개까지 지운다.

import type { APIRoute } from 'astro';
import { ApiError, jsonResponse, withAdminApi } from '@/lib/server/api-response';
import {
  parseReaderDays,
  pruneOldReaderEvents,
  readEntryReaders,
  readerRangeOf,
} from '@/lib/server/reader-store';
import { TRACK_ENTRY_ID_PATTERN } from '@/lib/tracker/events';

export const prerender = false;

export const GET: APIRoute = withAdminApi(async ({ params, url }) => {
  const id = params.id ?? '';
  if (!TRACK_ENTRY_ID_PATTERN.test(id)) {
    throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 올바르지 않습니다.');
  }
  const range = readerRangeOf(parseReaderDays(url));
  const [{ summary, paths }, pruned] = await Promise.all([
    readEntryReaders(id, range),
    pruneOldReaderEvents(range.today).catch((error: unknown) => {
      console.error('[admin-readers] 오래된 원본 줄 정리 실패', error);
      return null;
    }),
  ]);
  return jsonResponse({
    id,
    days: range.days,
    today: range.today,
    from: range.range[0],
    summary,
    paths,
    pruned,
  });
});
