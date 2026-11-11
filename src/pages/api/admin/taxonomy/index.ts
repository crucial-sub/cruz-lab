// 분류 읽기 API (재건 5단계 D1)
// - GET /api/admin/taxonomy → { version, stored, updatedAt, categories[], unknownCategories[], categoryAliases, tagAliases, tags[] }
// - categories: 순서대로 key·표시 이름·동의어 태그·글 수(초안 포함)·공개 글 수. tags: 글 수 많은 순.
// - 분류 화면과 에디터 메타 패널(카테고리 칸, 태그 제안)이 쓴다. 메모를 쓰지 않는다(바로 앞의 바꾸기가 보여야 한다).

import type { APIRoute } from 'astro';
import { jsonResponse, withAdminApi } from '@/lib/server/api-response';
import { readTaxonomyForAdmin } from '@/lib/server/taxonomy-store';

export const prerender = false;

export const GET: APIRoute = withAdminApi(async () => jsonResponse(await readTaxonomyForAdmin()));
