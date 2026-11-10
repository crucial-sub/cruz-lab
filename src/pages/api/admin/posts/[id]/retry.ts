// 부수 작업 다시 시도 API (재건 5단계 D11)
// - POST /api/admin/posts/{id}/retry, 요청 { purge?: true, backup?: true } (하나 이상)
// - purge: 그 글의 공개 캐시를 다시 비운다. backup: 백업 저장소에 다시 알린다.
//   글이 있으면 백업 알림은 publish, 지워졌으면 delete다. 지운 글도 캐시 태그는 비울 수 있다.
// - 결과를 새 publishLog 줄(action: retry)에 적는다. 성공하면 알림 띠에서 그 글이 사라진다.
//   로컬(Vercel 밖)의 퍼지는 skipped다. skipped는 실패를 지우지 않는다.
// - 글도 없고 기록도 없으면 404.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import type { RetryTarget } from '@/lib/publish-log';
import { getEntryLabel } from '@/lib/server/admin-entries';
import { ApiError, jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';
import { notifyContentChanged, type BackupResult } from '@/lib/server/backup-dispatch';
import { purgePublicCache, type PurgeResult } from '@/lib/server/cdn-purge';
import { addRetryLog, readLatestLogForEntry } from '@/lib/server/publish-log';

export const prerender = false;

const retrySchema = z
  .object({
    purge: z.literal(true).optional(),
    backup: z.literal(true).optional(),
  })
  .refine((body) => body.purge || body.backup, { message: 'purge 또는 backup이 필요합니다' });

export const POST: APIRoute = withAdminApi(async ({ params, request }) => {
  const id = params.id;
  if (!id) throw new ApiError(400, 'INVALID_REQUEST', '글 ID가 없습니다.');
  const body = await parseJsonBody(request, retrySchema);

  // 이름표: 글이 있으면 글에서, 지워졌으면 마지막 기록에서
  const label = await getEntryLabel(id);
  const exists = label !== null;
  const latest = exists ? null : await readLatestLogForEntry(id);
  if (!exists && !latest) throw new ApiError(404, 'NOT_FOUND', '글도 출간 기록도 없습니다.');

  const retried: RetryTarget[] = [];
  let purge: PurgeResult | undefined;
  let backup: BackupResult | undefined;
  if (body.purge) {
    retried.push('purge');
    purge = await purgePublicCache(id);
  }
  if (body.backup) {
    retried.push('backup');
    backup = await notifyContentChanged({ entryId: id, action: exists ? 'publish' : 'delete' });
  }

  const logId = await addRetryLog({
    entryId: id,
    slug: label?.slug ?? latest?.slug ?? '',
    title: label?.title ?? latest?.title ?? null,
    retried,
    results: { purge, backup },
  });
  return jsonResponse({ ...(purge ? { purge } : {}), ...(backup ? { backup } : {}), logId });
});
