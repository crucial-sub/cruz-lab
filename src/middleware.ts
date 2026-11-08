// 요청 미들웨어 (재건 2단계)
// - 공개 주소의 301 리다이렉트(Plan 7.4). 공개 요청에서는 쿠키를 읽지도 쓰지도 않는다(D5).
// - 관리자 경로(/admin/**, /api/admin/**)는 세션 쿠키를 검사한다(D5).
//   판정은 실제로 실행할 라우트(routePattern)와 디코딩한 경로로 한다(인코딩 우회 방지).
//   페이지는 /admin/login?next=…로 302, API는 401 JSON.
// - 관리자 API의 쓰기 요청은 Origin이 요청 주소의 origin과 같아야 한다. 다르면 403.
// - prerender 페이지는 미들웨어를 거치지 않는다. 관리자 페이지는 모두 SSR이다.

import { defineMiddleware } from 'astro:middleware';
import { buildLoginRedirect, isSameOrigin, isWriteMethod, resolveAdminRequestKind } from '@/lib/admin-guard';
import { findPublicRedirect } from '@/lib/redirects';
import { errorResponse } from '@/lib/server/api-response';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionCookie, type AdminSession } from '@/lib/server/admin-session';

// 관리자 페이지 응답은 어디에도 저장하지 않는다
const ADMIN_PAGE_CACHE_CONTROL = 'private, no-store';

// 응답에 no-store를 붙인다. 헤더를 바꿀 수 없는 응답(Response.redirect 등)이면 새로 감싼다
function withNoStore(response: Response): Response {
  try {
    response.headers.set('Cache-Control', ADMIN_PAGE_CACHE_CONTROL);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', ADMIN_PAGE_CACHE_CONTROL);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  const kind = resolveAdminRequestKind({
    pathname,
    routePattern: context.routePattern,
    method: context.request.method,
  });

  if (kind === 'invalid') {
    return new Response('잘못된 경로입니다.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  if (kind === 'public') {
    const redirectTo = findPublicRedirect(pathname);
    if (redirectTo) {
      return new Response(null, {
        status: 301,
        headers: {
          Location: `${redirectTo}${search}`,
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
      });
    }
    return next();
  }

  // CSRF: 관리자 API의 쓰기 요청은 같은 origin에서만 받는다 (세션 발급 포함)
  const isApi = kind === 'admin-api' || kind === 'session-create';
  if (isApi && isWriteMethod(context.request.method)) {
    if (!isSameOrigin(context.request.headers.get('origin'), context.request.url)) {
      return errorResponse(403, 'ORIGIN_MISMATCH', '요청 출처가 이 사이트가 아닙니다.');
    }
  }

  // 쿠키 없이 여는 곳: 로그인 페이지, 세션 발급
  if (kind === 'login-page' || kind === 'session-create') {
    const response = await next();
    return kind === 'login-page' ? withNoStore(response) : response;
  }

  let session: AdminSession | null;
  try {
    session = await verifyAdminSessionCookie(context.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  } catch (error) {
    console.error('[middleware] 관리자 인증 설정 오류', error);
    if (kind === 'admin-api') {
      return errorResponse(500, 'ADMIN_NOT_CONFIGURED', '관리자 인증 설정이 없습니다.');
    }
    return new Response('관리자 인증 설정이 없습니다.', {
      status: 500,
      headers: { 'Cache-Control': ADMIN_PAGE_CACHE_CONTROL, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (!session) {
    if (kind === 'admin-api') {
      return errorResponse(401, 'UNAUTHENTICATED', '관리자 로그인이 필요합니다.');
    }
    return new Response(null, {
      status: 302,
      headers: { Location: buildLoginRedirect(pathname, search), 'Cache-Control': ADMIN_PAGE_CACHE_CONTROL },
    });
  }

  context.locals.admin = session;
  const response = await next();
  return kind === 'admin-page' ? withNoStore(response) : response;
});
