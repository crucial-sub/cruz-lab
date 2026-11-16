// 서가에서 내리기 API — 맥 입구 (서가 1단계 T4, J16)
// - DELETE /api/library/token/docs/{id}, Authorization: Bearer <서가 토큰> → 204. 없으면 404

import type { APIRoute } from 'astro';
import { ApiError, noContentResponse } from '@/lib/server/api-response';
import { docIdParam, withLibraryTokenApi } from '@/library/server/api';
import { removeLibraryDoc } from '@/library/server/store';

export const prerender = false;

export const DELETE: APIRoute = withLibraryTokenApi(async (context) => {
  if (!(await removeLibraryDoc(docIdParam(context)))) throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다.');
  return noContentResponse();
});
