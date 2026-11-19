// 폰 저장 API — 서가 화면 고치기 (서가 2단계 T5, Plan J37~J39)
// - PUT /api/admin/library/docs/{id}/md { baseRev, text } → 200 { changed, rev, doc }
//   - changed=false: 글이 앞 판과 같아 새 판을 만들지 않았다
//   - 409 REV_CHANGED: 그사이 md 판이 바뀌었다(맥에서 새 판이 왔다). 덮어쓰지 않았다
//   - 413 TEXT_TOO_LARGE: 글이 2 MB를 넘는다. 404: md 판이 없다
// - 관리자 쿠키·같은 출처 쓰기 검사는 withLibraryAdminApi(미들웨어 Origin 검사)가 한다

import type { APIRoute } from 'astro';
import { ApiError, jsonResponse, parseJsonBody } from '@/lib/server/api-response';
import { docIdParam, phoneSaveSchema, siteOrigin, withLibraryAdminApi } from '@/library/server/api';
import { savePhoneEdit } from '@/library/server/edit';
import { getLibraryDoc, summarize } from '@/library/server/store';

export const prerender = false;

export const PUT: APIRoute = withLibraryAdminApi(async (context) => {
  const docId = docIdParam(context);
  const { baseRev, text } = await parseJsonBody(context.request, phoneSaveSchema);
  const result = await savePhoneEdit({ docId, baseRev, text });
  const doc = await getLibraryDoc(docId);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다.');
  return jsonResponse({ ...result, doc: summarize(docId, doc, siteOrigin(context)) });
});
