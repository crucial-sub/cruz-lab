// 연재·프로젝트 목록 API (재건 5단계 D2)
// - GET /api/admin/series → { items: [{ key, title, description, project, hasMeta, version, parts[], publishedCount }] }
// - seriesMeta 문서와 글의 연재 key를 합친다. 문서 없이 글만 있는 key는 title이 null이다(화면: "제목 없음").
// - 연재 화면과 에디터 메타 패널(연재 key 제안)이 쓴다.

import type { APIRoute } from 'astro';
import { listSeriesForAdmin } from '@/lib/server/admin-series';
import { jsonResponse, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

export const GET: APIRoute = withAdminApi(async () => jsonResponse(await listSeriesForAdmin()));
