// 숨김 / 다시 보임 API (재건 2단계 Plan 6.3)
// - POST /api/admin/posts/{id}/visibility, 요청 { visible: boolean }
// - published ↔ hidden만 바꾼다. 초안은 발행하지 않는다. 발행본이 없으면 409.
// - 바뀌었을 때만 publishLog와 CDN 퍼지를 한다. 퍼지 결과는 그 줄에 적는다(5단계 D11).

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { setEntryVisibility } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';
import { purgePublicCache, type PurgeResult } from '@/lib/server/cdn-purge';
import { recordSideEffects } from '@/lib/server/publish-log';

export const prerender = false;

const visibilitySchema = z.object({
  visible: z.boolean(),
});

export const POST: APIRoute = withAdminApi(async ({ params, request }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 없습니다.');
  const { visible } = await parseJsonBody(request, visibilitySchema);

  const result = await setEntryVisibility(id, visible);
  const purge: PurgeResult = result.changed ? await purgePublicCache(id) : 'skipped';
  if (result.changed) await recordSideEffects(result.logId, { purge });
  return jsonResponse({ status: result.status, changed: result.changed, purge });
});
