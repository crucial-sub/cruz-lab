// 문서 출처 호스트·서가 경로 판정 (서가 1단계 T3, Plan 5.1 미들웨어 분기 셋)
// - 미들웨어가 맨 앞에서 부른다. I/O가 없는 순수 함수다.

// 호스트 값을 비교용으로 맞춘다: 소문자, 끝의 점 제거
function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.(?=:|$)/, '');
}

// 포트를 뗀 호스트 이름
function hostname(host: string): string {
  return host.replace(/:\d+$/, '');
}

// 요청 호스트가 문서 출처인가
// - docHost(LIBRARY_DOC_HOST)에 포트가 있으면 포트까지 비교한다(로컬 개발: raw.localhost:4321)
// - 포트가 없으면 이름만 비교한다(운영: raw.cruzlab.dev)
// - 설정이 비어 있으면 늘 거짓이다
export function isDocHost(requestHost: string | null | undefined, docHost: string | null | undefined): boolean {
  if (!requestHost || !docHost) return false;
  const request = normalizeHost(requestHost);
  const target = normalizeHost(docHost);
  if (!request || !target) return false;
  return /:\d+$/.test(target) ? request === target : hostname(request) === target;
}

// 경로가 prefix 자체이거나 그 아래인가
function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// 서가 화면·서가 API 경로 (LIBRARY_ENABLED가 거짓이면 모두 404)
// - /admin/library/**, /api/admin/library/**, /api/library/**
// - 3단계 공개 서가가 쓸 /library는 아직 서가 경로가 아니다(J1)
export function isLibraryPath(pathname: string): boolean {
  return under(pathname, '/admin/library') || under(pathname, '/api/admin/library') || under(pathname, '/api/library');
}

// 서가 토큰으로 부르는 경로 (/api/library/token/**). 쿠키를 보지 않는다
export function isLibraryTokenPath(pathname: string): boolean {
  return under(pathname, '/api/library/token');
}

// LIBRARY_ENABLED 값: 'true' 또는 '1'일 때만 켠다
export function isLibraryEnabled(value: string | boolean | undefined | null): boolean {
  return value === true || value === 'true' || value === '1';
}

// 미들웨어 분기 셋 (Plan 5.1)
// - raw: 문서 출처 호스트. 경로와 상관없이 문서 출처 처리기로만 보낸다(블로그 페이지를 열지 않는다)
// - not-found: 서가가 꺼져 있거나(LIBRARY_ENABLED) 없는 서가 경로
// - token: 서가 토큰 경로(/api/library/token/**). 쿠키를 보지 않고 Bearer 토큰만 확인한다
// - pass: 서가와 상관없거나, 기존 관리자 검사(/admin/**, /api/admin/**)로 넘길 서가 경로
// 경로 우회 방지: 실행할 라우트(routePattern)와 디코딩한 경로를 함께 본다.
// 디코딩할 수 없는 경로는 pass로 넘긴다(기존 미들웨어가 400으로 거부한다).
export type LibraryRoute = 'raw' | 'not-found' | 'token' | 'pass';

export function resolveLibraryRoute(input: {
  host: string | null | undefined;
  pathname: string;
  routePattern: string | undefined;
  enabled: boolean;
  docHost: string | null | undefined;
}): LibraryRoute {
  if (isDocHost(input.host, input.docHost)) return input.enabled ? 'raw' : 'not-found';

  let decoded: string;
  try {
    decoded = decodeURI(input.pathname);
  } catch {
    return 'pass';
  }
  const candidates = [decoded, input.routePattern].filter((path): path is string => Boolean(path));
  if (!candidates.some(isLibraryPath)) return 'pass';
  if (!input.enabled) return 'not-found';
  if (candidates.some(isLibraryTokenPath)) return 'token';
  // /api/library/** 에는 토큰 경로만 있다
  if (candidates.some((path) => path === '/api/library' || path.startsWith('/api/library/'))) return 'not-found';
  return 'pass';
}
