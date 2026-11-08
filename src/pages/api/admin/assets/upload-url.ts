// 자산 업로드 주소 API (재건 2단계 Plan 6.4)
// - POST /api/admin/assets/upload-url, 요청 { fileName, contentType, bytes, sha256 }
// - 같은 해시가 있으면 { existing: Asset }. 없으면 { assetId, uploadUrl, expiresAt, requiredHeaders }.
// - 클라이언트는 uploadUrl로 Storage에 직접 PUT한다(함수의 4.5 MB 한도를 거치지 않는다).

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { ALLOWED_CONTENT_TYPES } from '@/lib/asset-rules';
import { requestUploadUrl } from '@/lib/server/admin-assets';
import { jsonResponse, parseJsonBody, withApiErrors } from '@/lib/server/api-response';

export const prerender = false;

const uploadUrlSchema = z.object({
  fileName: z.string().min(1).max(300),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, { message: 'sha256은 소문자 16진수 64자입니다' }),
});

export const POST: APIRoute = withApiErrors(async ({ request }) => {
  const input = await parseJsonBody(request, uploadUrlSchema);
  return jsonResponse(await requestUploadUrl(input));
});
