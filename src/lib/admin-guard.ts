// 관리자 경로 판정 규칙 (재건 2단계 D5, Plan 6.1·6.2)
// - 순수 함수만 둔다. 미들웨어와 단위 테스트가 함께 쓴다.
// - 공개 경로는 'public'이다. 미들웨어는 공개 요청에서 쿠키를 읽지 않는다.

// 요청 종류
// - public: 공개 페이지·공개 API. 인증 검사를 하지 않는다
// - login-page: /admin/login. 쿠키 없이 연다
// - session-create: POST /api/admin/session. 쿠키 없이 부르고 Origin만 검사한다
// - admin-page: 그 밖의 /admin/**. 쿠키가 없으면 로그인 페이지로 보낸다
// - admin-api: 그 밖의 /api/admin/**. 쿠키가 없으면 401 JSON
export type AdminRequestKind = 'public' | 'login-page' | 'session-create' | 'admin-page' | 'admin-api';

export const ADMIN_LOGIN_PATH = '/admin/login';
export const ADMIN_SESSION_API_PATH = '/api/admin/session';

// 끝의 '/'를 뗀다. 루트('/')는 그대로 둔다
function trimTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

// 경로가 base 자체이거나 base 아래인지 확인한다
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

// 요청 경로와 메서드로 요청 종류를 정한다
export function classifyAdminRequest(pathname: string, method: string): AdminRequestKind {
  const path = trimTrailingSlash(pathname);
  if (isUnder(path, '/api/admin')) {
    if (path === ADMIN_SESSION_API_PATH && method.toUpperCase() === 'POST') return 'session-create';
    return 'admin-api';
  }
  if (isUnder(path, '/admin')) {
    return path === ADMIN_LOGIN_PATH ? 'login-page' : 'admin-page';
  }
  return 'public';
}

// 쓰기 메서드인지 확인한다. 쓰기 요청은 Origin 검사를 한다(CSRF)
export function isWriteMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

// Origin 헤더가 요청 주소의 origin과 같은지 확인한다. 헤더가 없으면 false
export function isSameOrigin(originHeader: string | null, requestUrl: string): boolean {
  if (!originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

// 로그인 뒤 돌아갈 경로를 검사한다
// - 같은 사이트의 /admin 아래 경로만 받는다. 그 밖(외부 주소, //host, 로그인 페이지 자신)은 /admin
export function safeAdminNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/admin';
  let parsed: URL;
  try {
    parsed = new URL(next, 'https://admin.invalid');
  } catch {
    return '/admin';
  }
  if (parsed.origin !== 'https://admin.invalid') return '/admin';
  const path = trimTrailingSlash(parsed.pathname);
  if (!isUnder(path, '/admin') || path === ADMIN_LOGIN_PATH) return '/admin';
  return `${parsed.pathname}${parsed.search}`;
}

// 로그인 페이지 주소를 만든다 (돌아갈 경로를 next로 붙인다)
export function buildLoginRedirect(pathname: string, search: string): string {
  const next = safeAdminNextPath(`${pathname}${search}`);
  return `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

// ID 토큰의 로그인 시각이 허용 범위 안인지 확인한다 (D5: 로그인 5분 이내)
// - authTimeSeconds는 토큰의 auth_time(초)이다.
export const RECENT_LOGIN_WINDOW_SECONDS = 5 * 60;

export function isRecentLogin(authTimeSeconds: number, nowMs: number): boolean {
  if (!Number.isFinite(authTimeSeconds)) return false;
  const ageSeconds = nowMs / 1000 - authTimeSeconds;
  return ageSeconds >= -60 && ageSeconds <= RECENT_LOGIN_WINDOW_SECONDS;
}

// 토큰 주인이 관리자인지 확인한다 (D5: ADMIN_UID와 email_verified)
export function isAdminClaims(
  claims: { uid?: string; email_verified?: boolean },
  adminUid: string | null | undefined,
): boolean {
  return Boolean(adminUid) && claims.uid === adminUid && claims.email_verified === true;
}
