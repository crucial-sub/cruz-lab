// 연재·프로젝트 정보 고치기·지우기 API (재건 5단계 D2)
// - PUT /api/admin/series/{key} { baseVersion, title, description, project? } → 200 { version, purge, backup, logId }
//   baseVersion은 목록이 준 version(문서가 없던 연재는 null)이다. 다르면 409 SERIES_CONFLICT.
//   project는 프로젝트였던 문서만 준다(칸 전체). 저장하면 그 연재의 공개 글 캐시와 목록 캐시를 비운다.
// - DELETE /api/admin/series/{key} { baseVersion } → 200 { deleted: true }. 그 key를 쓰는 글이 있으면 409.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { projectMetaSchema } from '@/lib/entry-schema';
import { deleteSeriesMeta, MAX_SERIES_TITLE_LENGTH, updateSeriesMeta } from '@/lib/server/admin-series';
import { ApiError, jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

const saveSchema = z.object({
  baseVersion: z.string().max(40).nullable(),
  title: z.string().trim().min(1).max(MAX_SERIES_TITLE_LENGTH),
  description: z.string().max(2000),
  project: projectMetaSchema.nullable().optional(),
});

const deleteSchema = z.object({ baseVersion: z.string().max(40).nullable() });

export const PUT: APIRoute = withAdminApi(async ({ params, request }) => {
  const key = params.key;
  if (!key) throw new ApiError(400, 'INVALID_REQUEST', '연재 key가 없습니다.');
  const body = await parseJsonBody(request, saveSchema);
  return jsonResponse(
    await updateSeriesMeta(key, { title: body.title, description: body.description, project: body.project ?? null }, body.baseVersion),
  );
});

export const DELETE: APIRoute = withAdminApi(async ({ params, request }) => {
  const key = params.key;
  if (!key) throw new ApiError(400, 'INVALID_REQUEST', '연재 key가 없습니다.');
  const body = await parseJsonBody(request, deleteSchema);
  return jsonResponse(await deleteSeriesMeta(key, body.baseVersion));
});
