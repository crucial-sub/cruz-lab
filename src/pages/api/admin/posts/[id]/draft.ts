// 초안 저장 API (재건 2단계 Plan 6.3)
// - PUT /api/admin/posts/{id}/draft
// - 요청 { baseVersion, device, draft: { title, description, slug, category, tags, series, cover, markdown, editorJson } }
// - 버전이 같으면 저장하고 200 { version, updatedAt }. 다르면 409 DRAFT_CONFLICT(서버 초안 전체).
// - 분류 값의 형식만 검사한다. 필수 값은 발행할 때 검사한다.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { MAX_DEVICE_LENGTH, draftInputSchema, normalizeDraftInput } from '@/lib/entry-rules';
import { saveDraft } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, parseJsonBody, withApiErrors } from '@/lib/server/api-response';

export const prerender = false;

const saveDraftSchema = z.object({
  baseVersion: z.number().int().positive(),
  device: z.string().max(MAX_DEVICE_LENGTH).nullable().optional(),
  draft: draftInputSchema,
});

export const PUT: APIRoute = withApiErrors(async ({ params, request }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 없습니다.');

  const body = await parseJsonBody(request, saveDraftSchema);
  const normalized = normalizeDraftInput(body.draft);
  if (!normalized.ok) {
    const code = normalized.status === 413 ? 'DRAFT_TOO_LARGE' : 'INVALID_REQUEST';
    throw new ApiError(normalized.status, code, '초안 값이 올바르지 않습니다.', normalized.issues);
  }

  const result = await saveDraft(id, {
    baseVersion: body.baseVersion,
    device: body.device?.trim() || null,
    draft: normalized.draft,
  });
  return jsonResponse(result);
});
