// 공유 끄기 API — 서가 화면 (서가 2단계 T8, Plan J44·J53)
// - DELETE /api/admin/library/shares/{공유 id} → 204. 끄는 시각(revokedAt)만 적는다. 기록은 지우지 않는다.
//   이미 끈 공유도 204다. 없는 공유면 404
// - 끄면 이 서버의 메모리는 바로 비운다. 다른 서버는 60초 안에 막힌다(J47)

import type { APIRoute } from 'astro';
import { ApiError, noContentResponse } from '@/lib/server/api-response';
import { withLibraryShareAdminApi } from '@/library/server/api';
import { firestoreShareDeps, revokeShareWith } from '@/library/server/shares';

export const prerender = false;

export const DELETE: APIRoute = withLibraryShareAdminApi(async (context) => {
  const found = await revokeShareWith(firestoreShareDeps, context.params.id ?? '');
  if (!found) throw new ApiError(404, 'NOT_FOUND', '공유가 없습니다.');
  return noContentResponse();
});
