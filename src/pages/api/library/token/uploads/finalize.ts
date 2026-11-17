// 서가 올리기 마무리 API — 맥 입구 (서가 1단계 T4, Plan 5.2 ③, J16)
// - POST /api/library/token/uploads/finalize, Authorization: Bearer <서가 토큰>, 요청 { docId, rev }
// - 응답 { doc: 서가 문서 요약 }

import type { APIRoute } from 'astro';
import { jsonResponse, parseJsonBody } from '@/lib/server/api-response';
import { finalizeSchema, siteOrigin, withLibraryTokenApi } from '@/library/server/api';
import { finalizeUpload } from '@/library/server/uploads';

export const prerender = false;

export const POST: APIRoute = withLibraryTokenApi(async (context) => {
  const input = await parseJsonBody(context.request, finalizeSchema);
  return jsonResponse({ doc: await finalizeUpload(input, siteOrigin(context)) });
});
