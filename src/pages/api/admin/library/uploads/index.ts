// 서가 올리기 시작 API — 서가 화면 (서가 1단계 T4, Plan 5.2 ①)
// - POST /api/admin/library/uploads, 요청 { format, project, relativePath, fileName, files: [{ path, bytes, sha256 }], force? }
// - 서가 2단계 J42: 아직 되돌리지 않은 폰 판이 있으면 md는 409 PHONE_EDIT_PENDING. force: true면 올린다
// - 응답 { docId, rev, expiresAt, uploads: [{ path, url, headers }] }. 입구는 url로 버킷에 바로 PUT한다.

import type { APIRoute } from 'astro';
import { jsonResponse, parseJsonBody } from '@/lib/server/api-response';
import { webStartSchema, withLibraryAdminApi } from '@/library/server/api';
import { startUpload } from '@/library/server/uploads';

export const prerender = false;

export const POST: APIRoute = withLibraryAdminApi(async ({ request }) => {
  const input = await parseJsonBody(request, webStartSchema);
  const { format, files, project, relativePath, fileName, force } = input;
  return jsonResponse(
    await startUpload({ format, files, force, origin: 'web', source: { kind: 'web', project, relativePath, fileName } }),
  );
});
