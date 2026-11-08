// 발행 API (재건 2단계 Plan 6.3)
// - POST /api/admin/posts/{id}/publish, 요청 { draftVersion }
// - draftVersion이 지금 초안 버전과 다르면 409. 검사에 실패하면 422 VALIDATION_FAILED.
// - 성공하면 200 { revision, status, publicUrl, purge }.
//   publicUrl은 지금 요청한 사이트 기준이다(entries는 rebuild 배포에서만 보인다). note는 공개 페이지가 없어 null.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { publicPathFor } from '@/lib/entry-rules';
import { publishEntry } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, parseJsonBody, withApiErrors } from '@/lib/server/api-response';
import { purgePublicCache } from '@/lib/server/cdn-purge';

export const prerender = false;

const publishSchema = z.object({
  draftVersion: z.number().int().positive(),
});

export const POST: APIRoute = withApiErrors(async ({ params, request, url }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 없습니다.');
  const { draftVersion } = await parseJsonBody(request, publishSchema);

  const result = await publishEntry(id, draftVersion);
  const purge = await purgePublicCache(id);
  const publicPath = publicPathFor(result.kind, result.slug);

  return jsonResponse({
    revision: result.revision,
    status: 'published',
    publicUrl: publicPath ? new URL(publicPath, url.origin).toString() : null,
    purge,
  });
});
