// 서가 목록 API — 맥 입구 (서가 1단계 T4, J16·J19 "서가 문서" 명령)
// - GET /api/library/token/docs, Authorization: Bearer <서가 토큰>
// - 응답 { docs: 서가 문서 요약[] } (최근 올린 것부터)
// - 서가 2단계 J41: ?pending=md면 아직 맥에 되돌리지 않은 폰 판이 있는 맥 문서만 준다(lab pull 목록)

import type { APIRoute } from 'astro';
import { jsonResponse } from '@/lib/server/api-response';
import { siteOrigin, withLibraryTokenApi } from '@/library/server/api';
import { listLibraryDocs } from '@/library/server/store';
import { hasPendingPull } from '@/library/sync';

export const prerender = false;

export const GET: APIRoute = withLibraryTokenApi(async (context) => {
  const pendingOnly = context.url.searchParams.get('pending') === 'md';
  return jsonResponse({ docs: await listLibraryDocs(siteOrigin(context), pendingOnly ? hasPendingPull : undefined) });
});
