// 공유 API — 서가 화면 (서가 2단계 T8, Plan J53)
// - POST /api/admin/library/shares { scope, duration } → 200 { share, qrSvg }: 공유를 만든다(기간 기본 7일)
//   scope: { kind:'doc', docId } | { kind:'project', project } | { kind:'folder', project, folder }
//   duration: '1d' | '7d' | '30d' | 'forever'
// - GET /api/admin/library/shares → 200 { shares }: 살아 있는 공유(공유 중 칸). 최근 만든 것부터
// - 관리자 쿠키·같은 출처 쓰기 검사는 미들웨어와 withLibraryAdminApi가 한다. 공유 스위치가 꺼지면 404(J50)

import type { APIRoute } from 'astro';
import { ApiError, jsonResponse, parseJsonBody } from '@/lib/server/api-response';
import { shareCreateSchema, siteOrigin, withLibraryShareAdminApi } from '@/library/server/api';
import { qrSvg } from '@/library/server/qr';
import { createShareWith, firestoreShareDeps, listLiveSharesWith } from '@/library/server/shares';
import { parseShareScope } from '@/library/share';

export const prerender = false;

export const POST: APIRoute = withLibraryShareAdminApi(async (context) => {
  const input = await parseJsonBody(context.request, shareCreateSchema);
  const scope = parseShareScope(input.scope);
  if (!scope) throw new ApiError(400, 'VALIDATION_ERROR', '공유 범위가 올바르지 않습니다.');
  const share = await createShareWith(firestoreShareDeps, scope, input.duration, siteOrigin(context));
  return jsonResponse({ share, qrSvg: await qrSvg(share.url) });
});

export const GET: APIRoute = withLibraryShareAdminApi(async (context) => {
  return jsonResponse({ shares: await listLiveSharesWith(firestoreShareDeps, siteOrigin(context)) });
});
