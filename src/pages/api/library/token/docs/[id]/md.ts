// 폰 판 읽기 API — 맥 되돌리기 (서가 2단계 T5, Plan J41)
// - GET /api/library/token/docs/{id}/md, Authorization: Bearer <서가 토큰>
// - 응답 { id, title, rev, origin, text, sha256, macSha256, pendingRev, sourcePath }
// - md 판이 없으면 404. md가 2 MB를 넘으면 413
// - lab pull과 Raycast "서가에서 가져오기"가 부른다(client/pull.ts)

import type { APIRoute } from 'astro';
import { ApiError, jsonResponse } from '@/lib/server/api-response';
import { docIdParam, withLibraryTokenApi } from '@/library/server/api';
import { readPhoneMd } from '@/library/server/edit';

export const prerender = false;

export const GET: APIRoute = withLibraryTokenApi(async (context) => {
  const payload = await readPhoneMd(docIdParam(context));
  if (!payload) throw new ApiError(404, 'NOT_FOUND', '서가에 md 문서가 없습니다.');
  return jsonResponse(payload);
});
