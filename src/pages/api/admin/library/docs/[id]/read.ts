// 읽음 표시 API — 서가 화면 (서가 1단계 T4, J14)
// - POST /api/admin/library/docs/{id}/read → 204. 처음 연 시각만 남긴다. 없으면 404

import type { APIRoute } from 'astro';
import { ApiError, noContentResponse } from '@/lib/server/api-response';
import { docIdParam, withLibraryAdminApi } from '@/library/server/api';
import { markLibraryDocRead } from '@/library/server/store';

export const prerender = false;

export const POST: APIRoute = withLibraryAdminApi(async (context) => {
  if (!(await markLibraryDocRead(docIdParam(context)))) throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다.');
  return noContentResponse();
});
