// 서가 올리기 마무리 API — 서가 화면 (서가 1단계 T4, Plan 5.2 ③)
// - POST /api/admin/library/uploads/finalize, 요청 { docId, rev }
// - 응답 { doc: 서가 문서 요약 }. doc.url이 서가 문서 주소다(QR 코드에 담는다)

import type { APIRoute } from 'astro';
import { jsonResponse, parseJsonBody } from '@/lib/server/api-response';
import { finalizeSchema, siteOrigin, withLibraryAdminApi } from '@/library/server/api';
import { finalizeUpload } from '@/library/server/uploads';

export const prerender = false;

export const POST: APIRoute = withLibraryAdminApi(async (context) => {
  const input = await parseJsonBody(context.request, finalizeSchema);
  return jsonResponse({ doc: await finalizeUpload(input, siteOrigin(context)) });
});
