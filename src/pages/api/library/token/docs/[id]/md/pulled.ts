// 되돌림 알림 API — 맥 되돌리기 (서가 2단계 T5, Plan J39·J41)
// - POST /api/library/token/docs/{id}/md/pulled { rev, sha256 }, Authorization: Bearer <서가 토큰> → 204
// - 맥 원본에 그 판의 글을 썼다(또는 이미 그 글이었다). 원본 해시를 적고 폰 판을 없음으로 한다
// - 지금 md 판이 rev가 아니면 409 REV_CHANGED. 해시가 그 판의 것이 아니면 400. md 판이 없으면 404

import type { APIRoute } from 'astro';
import { ApiError, noContentResponse, parseJsonBody } from '@/lib/server/api-response';
import { docIdParam, pulledSchema, withLibraryTokenApi } from '@/library/server/api';
import { markMdPulled } from '@/library/server/edit';

export const prerender = false;

export const POST: APIRoute = withLibraryTokenApi(async (context) => {
  const docId = docIdParam(context);
  const report = await parseJsonBody(context.request, pulledSchema);
  if (!(await markMdPulled(docId, report))) throw new ApiError(404, 'NOT_FOUND', '서가에 md 문서가 없습니다.');
  return noContentResponse();
});
