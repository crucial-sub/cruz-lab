// 초안 버리기 API (재건 2단계 Plan 6.3)
// - POST /api/admin/posts/{id}/draft/discard, 요청 { baseVersion }
// - 초안을 발행본 내용으로 덮는다. version은 1 오른다. 발행본이 없으면 409.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { discardDraft } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

const discardSchema = z.object({
  baseVersion: z.number().int().positive(),
});

export const POST: APIRoute = withAdminApi(async ({ params, request }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 없습니다.');
  const { baseVersion } = await parseJsonBody(request, discardSchema);
  return jsonResponse(await discardDraft(id, baseVersion));
});
