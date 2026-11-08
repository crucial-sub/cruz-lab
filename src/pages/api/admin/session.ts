// 관리자 세션 API (재건 2단계 Plan 6.2)
// - POST: ID 토큰 → 세션 쿠키. 쿠키 없이 부른다. Origin 검사는 미들웨어와 처리기가 함께 한다.
// - GET: 지금 세션 정보.
// - DELETE: 쿠키를 지운다. ?all=1이면 모든 기기의 토큰도 폐기한다.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  assertSameOriginWrite,
  jsonResponse,
  noContentResponse,
  parseJsonBody,
  withAdminApi,
  withApiErrors,
} from '@/lib/server/api-response';
import {
  ADMIN_SESSION_COOKIE,
  adminCookieOptions,
  createAdminSessionCookie,
  revokeAdminTokens,
} from '@/lib/server/admin-session';

export const prerender = false;

const createSessionSchema = z.object({
  idToken: z.string().min(1),
});

// 세션 쿠키 발급
export const POST: APIRoute = withApiErrors(async ({ request, cookies, url }) => {
  assertSameOriginWrite(request);
  const { idToken } = await parseJsonBody(request, createSessionSchema);
  const sessionCookie = await createAdminSessionCookie(idToken);
  cookies.set(ADMIN_SESSION_COOKIE, sessionCookie, adminCookieOptions(url));
  return noContentResponse();
});

// 지금 세션 정보
export const GET: APIRoute = withAdminApi(async ({ locals }) => {
  const admin = locals.admin!;
  return jsonResponse({ uid: admin.uid, email: admin.email, expiresAt: admin.expiresAt });
});

// 로그아웃
export const DELETE: APIRoute = withAdminApi(async ({ locals, cookies, url }) => {
  const admin = locals.admin!;
  if (url.searchParams.get('all') === '1') {
    await revokeAdminTokens(admin.uid);
  }
  const options = adminCookieOptions(url);
  cookies.delete(ADMIN_SESSION_COOKIE, {
    path: options.path,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
  });
  return noContentResponse();
});
