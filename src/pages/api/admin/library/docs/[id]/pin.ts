// 고정 API — 서가 화면 (서가 2단계 T4, Plan J34)
// - PUT /api/admin/library/docs/{id}/pin → 200 { doc }: 고정한다(고정 시각 = 지금)
// - DELETE /api/admin/library/docs/{id}/pin → 200 { doc }: 고정을 푼다
// - 없는 문서면 404. 관리자 쿠키·같은 출처 쓰기 검사는 withLibraryAdminApi(미들웨어 Origin 검사)가 한다

import type { APIRoute } from 'astro';
import { ApiError, jsonResponse } from '@/lib/server/api-response';
import { docIdParam, siteOrigin, withLibraryAdminApi } from '@/library/server/api';
import { setLibraryDocPin } from '@/library/server/store';

export const prerender = false;

function pinHandler(pinned: boolean): APIRoute {
  return withLibraryAdminApi(async (context) => {
    const doc = await setLibraryDocPin(docIdParam(context), pinned, siteOrigin(context));
    if (!doc) throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다.');
    return jsonResponse({ doc });
  });
}

export const PUT: APIRoute = pinHandler(true);
export const DELETE: APIRoute = pinHandler(false);
