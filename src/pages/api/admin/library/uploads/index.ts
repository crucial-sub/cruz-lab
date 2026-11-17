// 서가 올리기 시작 API — 서가 화면 (서가 1단계 T4, Plan 5.2 ①)
// - POST /api/admin/library/uploads, 요청 { format, project, relativePath, fileName, files: [{ path, bytes, sha256 }] }
// - 응답 { docId, rev, expiresAt, uploads: [{ path, url, headers }] }. 입구는 url로 버킷에 바로 PUT한다.

import type { APIRoute } from 'astro';
import { jsonResponse, parseJsonBody } from '@/lib/server/api-response';
import { webStartSchema, withLibraryAdminApi } from '@/library/server/api';
import { startUpload } from '@/library/server/uploads';

export const prerender = false;

export const POST: APIRoute = withLibraryAdminApi(async ({ request }) => {
  const input = await parseJsonBody(request, webStartSchema);
  const { format, files, project, relativePath, fileName } = input;
  return jsonResponse(
    await startUpload({ format, files, origin: 'web', source: { kind: 'web', project, relativePath, fileName } }),
  );
});
