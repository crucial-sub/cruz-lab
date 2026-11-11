// 이미지 라이브러리 목록 API (재건 5단계 D12)
// - GET /api/admin/assets → { items }. 자산 전부를 올린 때 최신순으로 준다. 읽기만 한다.
// - 칸: ID, 주소, 썸네일 주소(새 자산은 w480, legacy는 원본), 종류, 크기(바이트·폭·높이), legacy, usedBy, orphanedAt, 올린 때, 변형.
// - 글 제목은 주지 않는다. 앱이 글 목록 API 결과로 잇는다.

import type { APIRoute } from 'astro';
import { listAssetsForAdmin } from '@/lib/server/admin-assets';
import { jsonResponse, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

export const GET: APIRoute = withAdminApi(async () => jsonResponse(await listAssetsForAdmin()));
