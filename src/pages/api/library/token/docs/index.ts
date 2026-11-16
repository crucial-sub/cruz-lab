// 서가 목록 API — 맥 입구 (서가 1단계 T4, J16·J19 "서가 문서" 명령)
// - GET /api/library/token/docs, Authorization: Bearer <서가 토큰>
// - 응답 { docs: 서가 문서 요약[] } (최근 올린 것부터)

import type { APIRoute } from 'astro';
import { jsonResponse } from '@/lib/server/api-response';
import { siteOrigin, withLibraryTokenApi } from '@/library/server/api';
import { listLibraryDocs } from '@/library/server/store';

export const prerender = false;

export const GET: APIRoute = withLibraryTokenApi(async (context) => {
  return jsonResponse({ docs: await listLibraryDocs(siteOrigin(context)) });
});
