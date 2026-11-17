// 서가에서 내리기 API — 서가 화면 (서가 1단계 T4, 분석 8.3 제안 17)
// - DELETE /api/admin/library/docs/{id} → 204. 없으면 404

import type { APIRoute } from 'astro';
import { ApiError, noContentResponse } from '@/lib/server/api-response';
import { docIdParam, withLibraryAdminApi } from '@/library/server/api';
import { removeLibraryDoc } from '@/library/server/store';

export const prerender = false;

export const DELETE: APIRoute = withLibraryAdminApi(async (context) => {
  if (!(await removeLibraryDoc(docIdParam(context)))) throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다.');
  return noContentResponse();
});
