// 출간 기록 API (재건 5단계 D11)
// - GET /api/admin/publish-log?before=<줄 ID>&limit= : 최신순 한 쪽(기본 50줄). 응답 { items, nextBefore }
// - GET /api/admin/publish-log?alerts=1 : 알림 띠(최근 7일 실패 중 그 뒤 성공 줄이 없는 글). 응답 { alerts }
//   첫 화면은 알림을 이 요청 하나로 계산한다. GitHub를 부르지 않는다(M3).
// - 글 제목은 기록된 title을 준다. 지금 제목·글 존재 여부는 앱이 목록 API 결과로 잇는다.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { ApiError, jsonResponse, withAdminApi, zodIssues } from '@/lib/server/api-response';
import {
  PUBLISH_LOG_PAGE_SIZE,
  readPublishAlerts,
  readPublishLogPage,
} from '@/lib/server/publish-log';

export const prerender = false;

const pageQuerySchema = z.object({
  before: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .nullable(),
  limit: z.coerce.number().int().min(1).max(PUBLISH_LOG_PAGE_SIZE).default(PUBLISH_LOG_PAGE_SIZE),
});

export const GET: APIRoute = withAdminApi(async ({ url }) => {
  if (url.searchParams.get('alerts') === '1') {
    return jsonResponse({ alerts: await readPublishAlerts() });
  }
  const parsed = pageQuerySchema.safeParse({
    before: url.searchParams.get('before') || null,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    throw new ApiError(
      400,
      'INVALID_REQUEST',
      '조회 조건이 올바르지 않습니다.',
      zodIssues(parsed.error),
    );
  }
  return jsonResponse(await readPublishLogPage(parsed.data));
});
