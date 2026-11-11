// 이미지 회전·좌우반전 API (이미지 회전·좌우반전 작업, 사용자 결정 2026-11-12)
// - POST /api/admin/assets/{id}/transform, 요청 { op: 'rotate-left' | 'rotate-right' | 'flip-horizontal' }
// - 응답 { asset }(finalize와 같은 모양). 에디터는 asset.url로 이미지 src를 바꾼다.
// - 옛 이미지·영상·움직이는 이미지는 422. 원본 자산은 바꾸지 않는다.
// - 응답에 Server-Timing을 붙인다(read·dl·img·up·write). 미리보기·운영에서 어느 단계가 느린지 본다.

import type { APIRoute } from 'astro';
import { transformRequestSchema } from '@/lib/asset-transform';
import { transformAsset } from '@/lib/server/admin-assets';
import { ApiError, jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';
import { SERVER_TIMING_HEADER, ServerTiming } from '@/lib/server/server-timing';

export const prerender = false;

export const POST: APIRoute = withAdminApi(async ({ params, request }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '자산 ID가 없습니다.');
  const { op } = await parseJsonBody(request, transformRequestSchema);
  const timing = new ServerTiming();
  const result = await transformAsset(id, op, timing);
  return jsonResponse(result, 200, { [SERVER_TIMING_HEADER]: timing.header() });
});
