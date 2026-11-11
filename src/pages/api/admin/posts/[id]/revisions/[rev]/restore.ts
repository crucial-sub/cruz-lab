// 이전 발행본을 초안으로 가져오기 API (재건 5단계 D3)
// - POST /api/admin/posts/{id}/revisions/{rev}/restore { baseVersion } → 200 { version, revision, updatedAt, assetUsage }
// - 초안을 그 판의 내용으로 바꾸고 초안 버전을 1 올린다. baseVersion이 다르면 409 DRAFT_CONFLICT.
// - 발행본은 그대로다. 원래대로 돌리려면 초안 버리기를 쓴다. 카테고리·태그는 지금 분류 데이터에 맞춘다.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { parseRevisionNumber } from '@/lib/entry-rules';
import { restoreRevision } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

const restoreSchema = z.object({ baseVersion: z.number().int().positive() });

export const POST: APIRoute = withAdminApi(async ({ params, request }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 없습니다.');
  const revision = parseRevisionNumber(params.rev);
  if (revision === null) throw new ApiError(400, 'INVALID_REQUEST', '판 번호가 올바르지 않습니다.');
  const { baseVersion } = await parseJsonBody(request, restoreSchema);
  return jsonResponse(await restoreRevision(id, revision, baseVersion));
});
