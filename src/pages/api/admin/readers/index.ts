// 독자 흐름 사이트 요약 API (재건 5단계 D20)
// - GET /api/admin/readers?days=30|90 (기본 30) → { days, today, from, summary, pruned }
//   summary: 날짜별 방문·조회, 합계, 많이 읽힌 글, 들어온 곳, 검색어(0건 먼저), 없는 주소. 글 제목은 앱이 목록 API로 잇는다.
// - 날짜 요약(readerDaily)만 읽는다. 열 때마다 90일이 지난 원본 줄을 500개까지 지운다(Cron을 쓰지 않는다, D20 4).
//   정리가 실패해도 요약은 돌려준다(pruned: null).

import type { APIRoute } from 'astro';
import { jsonResponse, withAdminApi } from '@/lib/server/api-response';
import {
  parseReaderDays,
  pruneOldReaderEvents,
  readSiteReaders,
  readerRangeOf,
} from '@/lib/server/reader-store';

export const prerender = false;

export const GET: APIRoute = withAdminApi(async ({ url }) => {
  const range = readerRangeOf(parseReaderDays(url));
  const [summary, pruned] = await Promise.all([
    readSiteReaders(range),
    pruneOldReaderEvents(range.today).catch((error: unknown) => {
      console.error('[admin-readers] 오래된 원본 줄 정리 실패', error);
      return null;
    }),
  ]);
  return jsonResponse({
    days: range.days,
    today: range.today,
    from: range.range[0],
    summary,
    pruned,
  });
});
