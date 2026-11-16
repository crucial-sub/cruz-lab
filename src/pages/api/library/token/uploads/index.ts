// 서가 올리기 시작 API — 맥 입구 (서가 1단계 T4, Plan 5.2 ①, J16)
// - POST /api/library/token/uploads, Authorization: Bearer <서가 토큰>
// - 요청 { format, sourcePath: '~/…', fileName, files: [{ path, bytes, sha256 }] }
// - 응답 { docId, rev, expiresAt, uploads: [{ path, url, headers }] }

import type { APIRoute } from 'astro';
import { jsonResponse, parseJsonBody } from '@/lib/server/api-response';
import { macStartSchema, withLibraryTokenApi } from '@/library/server/api';
import { startUpload } from '@/library/server/uploads';

export const prerender = false;

export const POST: APIRoute = withLibraryTokenApi(async ({ request }) => {
  const { format, files, sourcePath, fileName } = await parseJsonBody(request, macStartSchema);
  return jsonResponse(await startUpload({ format, files, origin: 'mac', source: { kind: 'mac', sourcePath, fileName } }));
});
