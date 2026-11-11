// 새 프로젝트 API (재건 5단계 D2)
// - POST /api/admin/projects { key, title } → 201 { id, key }
// - seriesMeta/<key>(project 칸)와 첫 Part 초안(kind project, series { key, order: 1 })을 한 트랜잭션에서 만든다.
//   화면은 받은 id로 에디터를 연다. key가 이미 쓰이면 409 SERIES_EXISTS.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createProject } from '@/lib/server/admin-series';
import { jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

const createSchema = z.object({
  key: z.string().max(100),
  title: z.string().max(400),
});

export const POST: APIRoute = withAdminApi(async ({ request }) => {
  const body = await parseJsonBody(request, createSchema);
  return jsonResponse(await createProject(body), 201);
});
