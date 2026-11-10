// 관리자 글 한 편 API (재건 2단계 Plan 6.3)
// - GET /api/admin/posts/{id} : 문서 전체(draft, published, status, 날짜). revisions는 주지 않는다.
// - DELETE /api/admin/posts/{id} : 삭제. 요청 { confirm: "<id>" }. confirm이 경로 ID와 다르면 400.
//   응답 { deleted, orphanedAssets, assetUsage, purge, backup }
//   부수 결과는 삭제 publishLog 줄에 적는다(5단계 D11).

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { deleteEntry, getEntryForAdmin } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';
import { notifyContentChanged } from '@/lib/server/backup-dispatch';
import { purgePublicCache } from '@/lib/server/cdn-purge';
import { recordSideEffects } from '@/lib/server/publish-log';

export const prerender = false;

const deleteSchema = z.object({
  confirm: z.string().min(1),
});

// 경로의 글 ID를 꺼낸다
function requireId(id: string | undefined): string {
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 없습니다.');
  return id;
}

export const GET: APIRoute = withAdminApi(async ({ params }) => {
  return jsonResponse(await getEntryForAdmin(requireId(params.id)));
});

export const DELETE: APIRoute = withAdminApi(async ({ params, request }) => {
  const id = requireId(params.id);
  const { confirm } = await parseJsonBody(request, deleteSchema);
  if (confirm !== id) throw new ApiError(400, 'CONFIRM_MISMATCH', 'confirm 값이 글 ID와 다릅니다.');

  const result = await deleteEntry(id);
  const [purge, backup] = await Promise.all([
    purgePublicCache(id),
    notifyContentChanged({ entryId: id, action: 'delete' }),
  ]);
  await recordSideEffects(result.logId, { purge, backup, assetUsage: result.assetUsage });
  return jsonResponse({
    deleted: result.deleted,
    orphanedAssets: result.orphanedAssets,
    assetUsage: result.assetUsage,
    purge,
    backup,
  });
});
