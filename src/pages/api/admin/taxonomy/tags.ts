// 태그 바꾸기 API (재건 5단계 D1)
// - POST /api/admin/taxonomy/tags { from, to, baseVersion, dryRun? }
//   from을 쓰는 모든 글의 초안·발행본 태그를 to로 바꾼다. to를 이미 쓰는 글은 합친다(중복을 뺀다).
//   to는 정규화한다. 카테고리 동의어면 400. from을 쓰는 글이 없으면 404. baseVersion이 다르면 409.
// - 옛 태그를 별칭에 남긴다(/blog/tag/<옛 태그> → 301, 에디터 입력도 새 태그로 바뀐다).
// - 200 { version, affected[], purge, backup, logId }. dryRun이면 대상 글만 돌려준다.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';
import { renameTag } from '@/lib/server/taxonomy-store';

export const prerender = false;

const tagSchema = z.object({
  from: z.string().min(1).max(100),
  to: z.string().max(200),
  baseVersion: z.number().int().nonnegative(),
  dryRun: z.boolean().optional(),
});

export const POST: APIRoute = withAdminApi(async ({ request }) => {
  const body = await parseJsonBody(request, tagSchema);
  return jsonResponse(await renameTag(body));
});
