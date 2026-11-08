// 자산 정리 API (재건 2단계 Plan 6.4)
// - POST /api/admin/assets/purge, 요청 { dryRun?: true, minOrphanDays?: 7, ids?: string[] }
// - 고아가 된 지 minOrphanDays 지난 자산과 pending으로 24시간 지난 자산을 지운다.
// - 기본은 시험 실행(dryRun: true)이다. 지우기 직전에 모든 글을 다시 훑는다. 하나라도 쓰면 kept.
// - main 병합 전에는 legacy 자산을 후보에 넣지 않는다.
// - ids는 Plan에 없는 선택 값이다. 스모크 테스트가 시험 자산만 지울 때 쓴다.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { DEFAULT_MIN_ORPHAN_DAYS } from '@/lib/asset-rules';
import { purgeAssets } from '@/lib/server/admin-assets';
import { jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

const purgeSchema = z.object({
  dryRun: z.boolean().optional(),
  minOrphanDays: z.number().min(0).max(3650).optional(),
  ids: z.array(z.string().min(1)).max(500).optional(),
});

export const POST: APIRoute = withAdminApi(async ({ request }) => {
  const body = await parseJsonBody(request, purgeSchema);
  return jsonResponse(
    await purgeAssets({
      dryRun: body.dryRun ?? true,
      minOrphanDays: body.minOrphanDays ?? DEFAULT_MIN_ORPHAN_DAYS,
      ids: body.ids ?? null,
    }),
  );
});
