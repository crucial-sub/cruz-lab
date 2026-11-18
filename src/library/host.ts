// 문서 출처 호스트·서가 경로 판정 (서가 1단계 T3, Plan 5.1 미들웨어 분기 셋)
// - 미들웨어가 맨 앞에서 부른다. I/O가 없는 순수 함수다.

// 문서 출처의 경로 접두사 (사용자 결정 2026-11-17)
// - 문서 주소: {문서 출처}/d/{문서 id}/{파일 경로}, 입장권: {문서 출처}/d/_open?t=…
// - Vercel은 라우트가 없는 경로를 서버 함수로 보내지 않고 정적 404를 준다. 그래서 라우트(src/pages/d/[...path].ts)가
//   잡을 수 있는 접두사 아래에 둔다. 주소가 늘 같다는 J4의 성질은 그대로다.
export const RAW_PATH_PREFIX = '/d';

// 문서 출처 안의 문서 경로 (/d/{문서 id}/{파일 경로})
export function rawDocPath(docId: string, path = 'index.html'): string {
  return `${RAW_PATH_PREFIX}/${docId}/${path}`;
}

// 서가 문서 주소(J7)가 보낼 문서 출처 (https://raw.cruzlab.dev)
// - docHost는 LIBRARY_DOC_HOST(호스트[:포트])다. 프로토콜·경로·@ 같은 글자가 들면 null이다(다른 곳으로 보내지 않는다).
// - 운영은 늘 https다. 개발은 요청과 같은 프로토콜이다(http://raw.localhost:4341).
export function docOriginFor(docHost: string | null | undefined, requestProtocol: string, dev: boolean): string | null {
  const host = docHost?.trim().toLowerCase();
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return null;
  return `${dev ? requestProtocol : 'https:'}//${host}`;
}

// 문서 출처 404 화면(J5)의 "서가에서 다시 열기"가 갈 블로그 출처
// - 'raw-'로 시작하는 호스트는 'raw-'를 뗀다: raw-preview.cruzlab.dev → https://preview.cruzlab.dev (미리보기)
// - 개발은 'raw.'를 떼고 요청 프로토콜·포트를 지킨다: raw.localhost:4341 → http://localhost:4341
// - 그 밖(운영 raw.cruzlab.dev)은 사이트 주소(astro.config의 site)다
// - 떼고 남은 값이 호스트 꼴이 아니면 사이트 주소로 간다(다른 곳으로 보내지 않는다)
export function blogOriginForDocHost(
  requestHost: string,
  input: { dev: boolean; protocol: string; site: string },
): string {
  const host = requestHost.trim().toLowerCase();
  const site = input.site.replace(/\/$/, '');
  const protocol = input.dev ? input.protocol : 'https:';
  if (host.startsWith('raw-')) {
    const rest = host.slice('raw-'.length);
    return /^[a-z0-9][a-z0-9.-]*(:\d{1,5})?$/.test(rest) ? `${protocol}//${rest}` : site;
  }
  if (input.dev) return `${protocol}//${host.replace(/^raw\./, '')}`;
  return site;
}

// 문서 출처의 입장권 주소: {문서 출처}/d/_open?t={입장권}
export function rawOpenUrl(docOrigin: string, ticket: string): string {
  return `${docOrigin}${RAW_PATH_PREFIX}/_open?t=${encodeURIComponent(ticket)}`;
}

// 입장권 그림 주소: {문서 출처}/d/_open?t={입장권}&pixel=1
// - 문서 출처가 302 대신 1px 그림과 문서 쿠키를 준다(raw.ts). md 뷰어가 상대 그림보다 먼저 부른다(J12).
export function rawTicketPixelUrl(docOrigin: string, ticket: string): string {
  return `${rawOpenUrl(docOrigin, ticket)}&pixel=1`;
}

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
