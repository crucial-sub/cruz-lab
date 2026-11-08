// 자산 업로드 끝내기 API (재건 2단계 Plan 6.4)
// - POST /api/admin/assets/{id}/finalize (요청 본문 없음)
// - 원본의 실제 형식을 확인하고 변형을 만든다. 응답 { asset }.
// - 원본이 없거나 형식이 다르면 422. 이미 ready면 그대로 돌려준다(멱등).

import type { APIRoute } from 'astro';
import { finalizeAsset } from '@/lib/server/admin-assets';
import { ApiError, jsonResponse, withApiErrors } from '@/lib/server/api-response';

export const prerender = false;

export const POST: APIRoute = withApiErrors(async ({ params }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '자산 ID가 없습니다.');
  return jsonResponse(await finalizeAsset(id));
});
