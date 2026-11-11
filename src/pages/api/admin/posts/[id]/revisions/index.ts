// 이전 발행본 목록 API (재건 5단계 D3)
// - GET /api/admin/posts/{id}/revisions → { items: [{ revision, title, slug, publishedAt, wordCount, current }], currentRevision }
// - 최신 판이 먼저다. 본문은 보내지 않는다. 글이 없으면 404.

import type { APIRoute } from 'astro';
import { listRevisions } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

export const GET: APIRoute = withAdminApi(async ({ params }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 없습니다.');
  return jsonResponse(await listRevisions(id));
});
