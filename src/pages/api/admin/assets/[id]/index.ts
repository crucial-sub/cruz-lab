// 자산 한 개 읽기 API (재건 3단계 Plan 5절, D11 9)
// - GET /api/admin/assets/{id} → { asset }. 3단계에 더하는 유일한 API다. 읽기만 한다.
// - 에디터의 이미지 크기 메뉴가 변형(w480·w960·max)이 있는지 확인할 때 부른다.

import type { APIRoute } from 'astro';
import { getAssetForAdmin } from '@/lib/server/admin-assets';
import { ApiError, jsonResponse, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

export const GET: APIRoute = withAdminApi(async ({ params }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '자산 ID가 없습니다.');
  return jsonResponse(await getAssetForAdmin(id));
});
