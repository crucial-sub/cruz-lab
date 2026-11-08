// 관리자 글 목록·새 초안 API (재건 2단계 Plan 6.3)
// - GET /api/admin/posts?status=&kind=&q= : 모든 상태의 글 목록과 상태별 수. 본문은 주지 않는다.
// - POST /api/admin/posts : 빈 초안을 만든다. 요청 { kind?: 'post' | 'note' }
// - 세션 쿠키 검사와 Origin 검사는 미들웨어가 하고, withAdminApi가 한 번 더 한다.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { CREATABLE_KINDS } from '@/lib/entry-rules';
import { ENTRY_KINDS, ENTRY_STATUSES } from '@/lib/entry-schema';
import { createEntry, listEntriesForAdmin } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, parseJsonBody, withAdminApi, zodIssues } from '@/lib/server/api-response';

export const prerender = false;

// 빈 문자열은 "조건 없음"으로 본다
const emptyToNull = (value: string | null) => (value === null || value === '' ? null : value);

const listQuerySchema = z.object({
  status: z.enum(ENTRY_STATUSES).nullable(),
  kind: z.enum(ENTRY_KINDS).nullable(),
  q: z.string().max(200).nullable(),
});

const createSchema = z.object({
  kind: z.enum(CREATABLE_KINDS).optional(),
});

export const GET: APIRoute = withAdminApi(async ({ url }) => {
  const parsed = listQuerySchema.safeParse({
    status: emptyToNull(url.searchParams.get('status')),
    kind: emptyToNull(url.searchParams.get('kind')),
    q: emptyToNull(url.searchParams.get('q')),
  });
  if (!parsed.success) {
    throw new ApiError(400, 'INVALID_REQUEST', '조회 조건이 올바르지 않습니다.', zodIssues(parsed.error));
  }
  return jsonResponse(await listEntriesForAdmin(parsed.data));
});

export const POST: APIRoute = withAdminApi(async ({ request }) => {
  const { kind } = await parseJsonBody(request, createSchema);
  return jsonResponse(await createEntry(kind ?? 'post'), 201);
});
