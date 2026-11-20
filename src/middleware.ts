// 요청 미들웨어 (재건 2단계)
// - 공개 주소의 301 리다이렉트(Plan 7.4). 공개 요청에서는 쿠키를 읽지도 쓰지도 않는다(D5).
// - 관리자 경로(/admin/**, /api/admin/**)는 세션 쿠키를 검사한다(D5).
//   판정은 실제로 실행할 라우트(routePattern)와 디코딩한 경로로 한다(인코딩 우회 방지).
//   페이지는 /admin/login?next=…로 302, API는 401 JSON.
// - 관리자 API의 쓰기 요청은 Origin이 요청 주소의 origin과 같아야 한다. 다르면 403.
// - prerender 페이지는 미들웨어를 거치지 않는다. 관리자 페이지는 모두 SSR이다.
// - 문서 서가(서가 1단계 Plan 5.1): 맨 앞에서 분기 셋을 본다.
//   1) 요청 호스트가 문서 출처(LIBRARY_DOC_HOST)면 문서 출처 처리기로만 보낸다. 관리자 쿠키를 읽지 않는다.
//   2) /api/library/token/**은 서가 토큰(Authorization: Bearer)만 확인한다. 쿠키를 보지 않는다.
//   3) LIBRARY_ENABLED가 거짓이면 서가 경로와 문서 출처는 모두 404다.
//   그 밖의 서가 경로(/admin/library/**, /api/admin/library/**)는 아래 관리자 검사를 그대로 거친다.

import { defineMiddleware } from 'astro:middleware';
import { buildLoginRedirect, isSameOrigin, isWriteMethod, resolveAdminRequestKind } from '@/lib/admin-guard';
import { findPublicRedirect } from '@/lib/redirects';
import { errorResponse } from '@/lib/server/api-response';
import { adminCookieName, verifyAdminSessionCookie, type AdminSession } from '@/lib/server/admin-session';
import { isLibraryEnabled, resolveLibraryRoute } from '@/library/host';
import { createRawDeps, handleRawRequest, libraryOffResponse, rawMisconfiguredResponse, type RawDeps } from '@/library/server/raw';
import { verifyBearerToken } from '@/library/ticket';

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

  // 문서 서가 분기 셋 (블로그 요청은 'pass'로 아래를 그대로 탄다)
  const libraryRoute = resolveLibraryRoute({
    host: context.url.host,
    pathname,
    routePattern: context.routePattern,
    enabled: isLibraryEnabled(import.meta.env.LIBRARY_ENABLED),
    docHost: import.meta.env.LIBRARY_DOC_HOST,
  });
  if (libraryRoute === 'raw') {
    let deps: RawDeps;
    try {
      deps = createRawDeps(context.url);
    } catch (error) {
      console.error('[middleware] 문서 출처 설정 오류', error);
      return rawMisconfiguredResponse();
    }
    return handleRawRequest(context.request, deps);
  }
  if (libraryRoute === 'not-found') return libraryOffResponse();
  if (libraryRoute === 'token') {
    if (!verifyBearerToken(context.request.headers.get('authorization'), import.meta.env.LIBRARY_TOKEN_SHA256)) {
      return errorResponse(401, 'UNAUTHENTICATED', '서가 토큰이 필요합니다.');
    }
    context.locals.libraryToken = true;
    return next();
  }

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
    // 서가 2단계 J54: https는 __Host-cruz_admin, http(로컬 개발)는 cruz_admin. 옛 이름은 읽지 않는다(한 번 로그아웃)
    session = await verifyAdminSessionCookie(context.cookies.get(adminCookieName(context.url))?.value);
  } catch (error) {
    console.error('[middleware] 관리자 인증 설정 오류', error);
    // 500은 Astro가 오류 페이지로 바꿔 본문이 사라진다. 설정 문제는 503으로 알린다
    if (kind === 'admin-api') {
      return errorResponse(503, 'ADMIN_NOT_CONFIGURED', '관리자 인증 설정이 없습니다.');
    }
    return new Response('관리자 인증 설정이 없습니다.', {
      status: 503,
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
