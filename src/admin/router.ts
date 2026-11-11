// 관리자 앱 라우터 (재건 5단계 D9)
// - History API로 주소만 바꾼다. 화면을 바꿀 때 페이지를 다시 받지 않는다.
// - 이 파일은 순수 함수만 둔다(주소 ↔ 화면). 브라우저 이벤트는 AdminApp이 다룬다. 테스트는 admin-router.test.ts.
// - 화면을 만든 주소만 안다. 모르는 주소는 첫 화면(/admin)으로 바꾼다.
//   5단계 PR-A의 화면: 첫 화면·목록(/admin), 에디터(/admin/edit/<id>), 출간 기록(/admin/log).
//   PR-B의 화면: 이미지(/admin/assets), 분류(/admin/taxonomy), 연재·프로젝트(/admin/series).
//   PR-C의 화면: 설정(/admin/settings). 독자 화면은 PR-D가 이 표에 더한다.
// - /admin/login은 이 앱이 아니다(세션 없이 여는 Astro 페이지).

export type AdminRoute =
  | { name: 'home'; search: string }
  | { name: 'edit'; id: string }
  | { name: 'assets' }
  | { name: 'taxonomy' }
  | { name: 'series' }
  | { name: 'log' }
  | { name: 'settings' };

// 쿼리 없는 화면의 주소 (PR-B가 이미지·분류·연재를, PR-C가 설정을 더했다)
const SIMPLE_ROUTES = {
  '/admin/assets': 'assets',
  '/admin/taxonomy': 'taxonomy',
  '/admin/series': 'series',
  '/admin/log': 'log',
  '/admin/settings': 'settings',
} as const satisfies Record<string, AdminRoute['name']>;
type SimpleRouteName = (typeof SIMPLE_ROUTES)[keyof typeof SIMPLE_ROUTES];

export const ADMIN_HOME_PATH = '/admin';

// 글 ID 형식. Firestore 자동 ID(영문·숫자 20자), 시험 ID(stage5-test-…),
// 프로젝트 글 ID(project-<key>-<slug>. slug는 한글을 받는다: taxonomy SLUG_PATTERN)를 받는다.
// 슬래시·점·공백은 받지 않는다(경로를 벗어나지 않게).
const ENTRY_ID_PATTERN = /^[A-Za-z0-9가-힣_-]{1,128}$/;

// 끝의 '/'를 뗀다
function trimTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

// 주소(경로 + 쿼리)를 화면으로 바꾼다. 모르는 주소면 null
export function parseAdminPath(pathname: string, search = ''): AdminRoute | null {
  const path = trimTrailingSlash(pathname);
  if (path === ADMIN_HOME_PATH) return { name: 'home', search: normalizeSearch(search) };
  if (Object.hasOwn(SIMPLE_ROUTES, path)) {
    return { name: SIMPLE_ROUTES[path as keyof typeof SIMPLE_ROUTES] } as { name: SimpleRouteName };
  }

  const edit = /^\/admin\/edit\/([^/]+)$/.exec(path);
  if (edit) {
    let id: string;
    try {
      id = decodeURIComponent(edit[1]);
    } catch {
      return null;
    }
    return ENTRY_ID_PATTERN.test(id) ? { name: 'edit', id } : null;
  }
  return null;
}

// 화면을 주소로 바꾼다
export function adminPathOf(route: AdminRoute): string {
  switch (route.name) {
    case 'home':
      return `${ADMIN_HOME_PATH}${normalizeSearch(route.search)}`;
    case 'edit':
      return `/admin/edit/${encodeURIComponent(route.id)}`;
    case 'assets':
      return '/admin/assets';
    case 'taxonomy':
      return '/admin/taxonomy';
    case 'series':
      return '/admin/series';
    case 'log':
      return '/admin/log';
    case 'settings':
      return '/admin/settings';
  }
}

// 에디터 주소
export function editPath(id: string): string {
  return adminPathOf({ name: 'edit', id });
}

// 쿼리 문자열을 '?a=b' 또는 ''로 맞춘다
function normalizeSearch(search: string): string {
  if (!search || search === '?') return '';
  return search.startsWith('?') ? search : `?${search}`;
}

// 두 화면이 같은 화면인지(같은 주소면 다시 그리지 않는다)
export function isSameRoute(a: AdminRoute, b: AdminRoute): boolean {
  return adminPathOf(a) === adminPathOf(b);
}

// 링크 클릭을 앱이 받아도 되는지 판단한다
// - 왼쪽 버튼, 수정 키 없음, target 없음, download 없음, 같은 origin, 앱이 아는 주소일 때만.
// - 그 밖(새 탭, 공개 페이지, 로그인 화면, 같은 주소의 '#' 링크)은 브라우저에 맡긴다.
export interface LinkClickInput {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: string | null;
  download: boolean;
  href: string;
  currentOrigin: string;
  // 지금 주소의 경로 + 쿼리. 같은 주소의 '#' 링크(제목 앵커·각주)는 브라우저에 맡긴다
  currentPath?: string;
}

export function routeForLinkClick(input: LinkClickInput): AdminRoute | null {
  if (input.defaultPrevented || input.button !== 0) return null;
  if (input.metaKey || input.ctrlKey || input.shiftKey || input.altKey) return null;
  if (input.download) return null;
  if (input.target && input.target !== '_self') return null;
  let url: URL;
  try {
    url = new URL(input.href, input.currentOrigin);
  } catch {
    return null;
  }
  if (url.origin !== input.currentOrigin) return null;
  if (url.hash && input.currentPath !== undefined && `${url.pathname}${url.search}` === input.currentPath) return null;
  return parseAdminPath(url.pathname, url.search);
}

// 화면 제목(브라우저 탭)
export function documentTitleOf(route: AdminRoute): string {
  switch (route.name) {
    case 'home':
      return '글 | Cruz Lab 관리';
    case 'edit':
      return '글 편집 | Cruz Lab 관리';
    case 'assets':
      return '이미지 | Cruz Lab 관리';
    case 'taxonomy':
      return '분류 | Cruz Lab 관리';
    case 'series':
      return '연재·프로젝트 | Cruz Lab 관리';
    case 'log':
      return '출간 기록 | Cruz Lab 관리';
    case 'settings':
      return '설정 | Cruz Lab 관리';
  }
}
