// 서가 올리기 마무리 API — 서가 화면 (서가 1단계 T4, Plan 5.2 ③)
// - POST /api/admin/library/uploads/finalize, 요청 { docId, rev }
// - 응답 { doc: 서가 문서 요약, sharedBy: 이 문서를 덮는 살아 있는 공유 [{ id, kind, label }] (서가 2단계 J52) }. doc.url이 서가 문서 주소다(QR 코드에 담는다)

import type { APIRoute } from 'astro';
import { jsonResponse, parseJsonBody } from '@/lib/server/api-response';
import { finalizeSchema, libraryShareEnabled, siteOrigin, withLibraryAdminApi } from '@/library/server/api';
import { sharedByForUpload } from '@/library/server/shares';
import { finalizeUpload } from '@/library/server/uploads';

export const prerender = false;

export const POST: APIRoute = withLibraryAdminApi(async (context) => {
  const input = await parseJsonBody(context.request, finalizeSchema);
  const doc = await finalizeUpload(input, siteOrigin(context));
  // 이 문서를 덮는 살아 있는 공유 (서가 2단계 J52: 올리기 결과의 경고 줄)
  return jsonResponse({ doc, sharedBy: await sharedByForUpload(doc.id, libraryShareEnabled()) });
});
