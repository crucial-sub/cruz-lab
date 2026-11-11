// 에디터 설정 API (재건 5단계 D14)
// - GET /api/admin/settings/editor → { keymap, version, updatedAt, stored, problem }
// - PUT /api/admin/settings/editor { keymap, baseVersion } → 200 같은 모양
//   keymap: { [명령 id]: { mac, other } | null }. 기본값과 다른 명령만 보내면 된다(같은 줄은 서버가 뺀다).
//   검사 실패 422 INVALID_KEYMAP(details: [{ field, id, platform, code, message, ids? }]), version이 다르면 409 SETTINGS_CONFLICT.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { MAX_KEY_LENGTH } from '@/editor/commands/keymap-settings';
import { readEditorSettings, writeEditorSettings } from '@/lib/server/admin-settings';
import { jsonResponse, parseJsonBody, withAdminApi } from '@/lib/server/api-response';

export const prerender = false;

const keyString = z.string().min(1).max(MAX_KEY_LENGTH).nullable();
const putSchema = z.object({
  keymap: z
    .record(z.string().min(1).max(64), z.object({ mac: keyString, other: keyString }).nullable())
    .refine((value) => Object.keys(value).length <= 200, { message: '명령이 너무 많습니다' }),
  baseVersion: z.number().int().nonnegative(),
});

export const GET: APIRoute = withAdminApi(async () => jsonResponse(await readEditorSettings()));

export const PUT: APIRoute = withAdminApi(async ({ request }) => {
  const body = await parseJsonBody(request, putSchema);
  return jsonResponse(await writeEditorSettings(body));
});
