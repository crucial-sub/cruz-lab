// 이전 발행본 하나 API (재건 5단계 D3)
// - GET /api/admin/posts/{id}/revisions/{rev} → { revision, current, publishedAt, content: { title, description, slug, category, tags, series, cover, markdown } }
// - 에디터의 "이전 발행본" 미리보기가 쓴다. 글이나 판이 없으면 404.

import type { APIRoute } from 'astro';
import { parseRevisionNumber } from '@/lib/entry-rules';
import { getRevision } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

export const GET: APIRoute = withAdminApi(async ({ params }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 없습니다.');
  const revision = parseRevisionNumber(params.rev);
  if (revision === null) throw new ApiError(400, 'INVALID_REQUEST', '판 번호가 올바르지 않습니다.');
  return jsonResponse(await getRevision(id, revision));
});
