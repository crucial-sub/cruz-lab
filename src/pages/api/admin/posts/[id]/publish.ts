// 발행 API (재건 2단계 Plan 6.3)
// - POST /api/admin/posts/{id}/publish, 요청 { draftVersion }
// - draftVersion이 지금 초안 버전과 다르면 409. 검사에 실패하면 422 VALIDATION_FAILED.
// - 성공하면 200 { revision, status, publicUrl, purge, backup, assetUsage }.
//   CDN 퍼지와 백업 알림은 함께 보낸다. 둘 다 실패해도 발행은 성공이다.
//   assetUsage는 커밋 뒤 자산 사용 기록 갱신 결과다(실패해도 발행은 성공).
//   publicUrl은 지금 요청한 사이트 기준이다(entries는 rebuild 배포에서만 보인다). note는 /notes/<slug>(4단계 D12),
//   project는 아직 공개 주소가 없어 null(4단계 PR-C가 더한다).

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { publicPathFor } from '@/lib/entry-rules';
import { publishEntry } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';
import { notifyContentChanged } from '@/lib/server/backup-dispatch';
import { purgePublicCache } from '@/lib/server/cdn-purge';

export const prerender = false;

const publishSchema = z.object({
  draftVersion: z.number().int().positive(),
});

export const POST: APIRoute = withAdminApi(async ({ params, request, url }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 없습니다.');
  const { draftVersion } = await parseJsonBody(request, publishSchema);

  const result = await publishEntry(id, draftVersion);
  const [purge, backup] = await Promise.all([
    purgePublicCache(id),
    notifyContentChanged({ entryId: id, action: 'publish' }),
  ]);
  const publicPath = publicPathFor(result.kind, result.slug);

  return jsonResponse({
    revision: result.revision,
    status: 'published',
    publicUrl: publicPath ? new URL(publicPath, url.origin).toString() : null,
    purge,
    backup,
    assetUsage: result.assetUsage,
  });
});
