// 카테고리 바꾸기 API (재건 5단계 D1)
// - POST /api/admin/taxonomy/categories
//   { op: 'create', key, label } 만들기
//   { op: 'rename', key, label } 표시 이름 바꾸기
//   { op: 'rekey', key, newKey } 주소 key 바꾸기. newKey가 이미 있으면 400
//   { op: 'merge', key, into } 합치기(글을 into로 옮기고 key를 지운다. 동의어 태그는 into로)
//   { op: 'delete', key } 지우기(초안을 포함해 쓰는 글이 0편일 때만, 아니면 409)
//   { op: 'move', ids, to } 글 옮기기(초안과 발행본의 key를 함께 바꾼다. 새 리비전은 만들지 않는다)
//   모두 baseVersion(화면이 받은 분류 version)이 필요하다. 다르면 409 TAXONOMY_CONFLICT. dryRun이면 대상 글만 돌려준다.
// - 200 { version, affected[], purge, backup, logId }. key 바꾸기·합치기는 옛 key를 별칭에 남긴다(옛 주소 301).

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';
import { changeCategories } from '@/lib/server/taxonomy-store';
import { CATEGORY_KEY_PATTERN, MAX_CATEGORY_KEY_LENGTH, MAX_CATEGORY_LABEL_LENGTH } from '@/lib/taxonomy';

export const prerender = false;

const key = z.string().min(1).max(MAX_CATEGORY_KEY_LENGTH).regex(CATEGORY_KEY_PATTERN);
const label = z.string().max(MAX_CATEGORY_LABEL_LENGTH * 2);
const common = { baseVersion: z.number().int().nonnegative(), dryRun: z.boolean().optional() };

const categorySchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), key: z.string().max(MAX_CATEGORY_KEY_LENGTH * 2), label, ...common }),
  z.object({ op: z.literal('rename'), key, label, ...common }),
  z.object({ op: z.literal('rekey'), key, newKey: z.string().max(MAX_CATEGORY_KEY_LENGTH * 2), ...common }),
  z.object({ op: z.literal('merge'), key, into: key, ...common }),
  z.object({ op: z.literal('delete'), key, ...common }),
  z.object({ op: z.literal('move'), ids: z.array(z.string().min(1).max(200)).min(1).max(200), to: key, ...common }),
]);

export const POST: APIRoute = withAdminApi(async ({ request }) => {
  const body = await parseJsonBody(request, categorySchema);
  return jsonResponse(await changeCategories(body));
});
