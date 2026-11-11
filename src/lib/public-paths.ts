// 공개 페이지 주소와 사이트 이름 (재건 4단계 D11)
// - 페이지·사이트맵·리다이렉트가 같은 함수로 주소를 만든다. 주소 규칙은 이 파일에만 둔다.
// - 돌려주는 주소는 인코딩된 경로다(한글 태그·slug는 %XX). href와 Location에 그대로 쓴다.
// - 글 주소는 slug-lookup.ts의 blogPath, kind별 주소 규칙(발행 API·에디터)은 이 파일의 publicPathFor다(entry-rules가 다시 내보낸다).
// - 이 파일은 다른 모듈을 가져오지 않는다. 관리자 앱 화면이 가져와도 zod 등이 딸려 오지 않게 한다(5단계 PR-B).
// - 상대 경로 import에 `.ts`를 붙인다(redirects.ts가 가져온다. 다른 공유 모듈과 같은 규칙).

// 공개 주소를 만든다 (인코딩하지 않은 경로). kind는 문자열로 받는다(entry-schema를 가져오지 않는다)
// - post: /blog/<slug> (2단계 D4)
// - note: /notes/<slug> (4단계 D12)
// - project: /projects/<프로젝트 key>/<slug> (4단계 D1). 프로젝트 key는 연재 key다. 연재가 없으면 주소가 없다(null)
export function publicPathFor(
  kind: 'post' | 'note' | 'project',
  slug: string,
  series: { key: string } | null = null,
): string | null {
  if (kind === 'post') return `/blog/${slug}`;
  if (kind === 'note') return `/notes/${slug}`;
  if (kind === 'project') return series?.key ? `/projects/${series.key}/${slug}` : null;
  return null;
}

// 사이트 이름과 기본 설명 (3단계까지는 src/consts.ts)
export const SITE_TITLE = 'Cruz Lab';
export const SITE_DESCRIPTION = 'Cruz의 개발 블로그 - 프론트엔드, 시스템 프로그래밍, 학습 기록';

// 글 목록 첫 화면
export const BLOG_INDEX_PATH = '/blog';

// 카테고리 목록 주소 (D11). 카테고리와 같은 뜻의 태그 주소는 미들웨어가 이 주소로 301한다
export function categoryPath(key: string): string {
  return `/blog/category/${encodeURIComponent(key)}`;
}

// 태그 목록 주소
export function tagPath(tag: string): string {
  return `/blog/tag/${encodeURIComponent(tag)}`;
}

// 연재 상세 주소 (연재 key)
export function seriesPath(key: string): string {
  return `/series/${encodeURIComponent(key)}`;
}

// 노트 1편 주소 (D12). 규칙은 publicPathFor('note')와 같다
export function notePath(slug: string): string {
  return encodeURI(publicPathFor('note', slug) ?? `/notes/${slug}`);
}

// 프로젝트 목록 (4단계 D1·D17)
export const PROJECTS_INDEX_PATH = '/projects';

// 프로젝트 하나의 주소. 첫 Part로 302한다
export function projectPath(key: string): string {
  return `/projects/${encodeURIComponent(key)}`;
}

// 프로젝트 글 주소 (D1). 규칙은 publicPathFor('project')와 같다
export function projectPostPath(key: string, slug: string): string {
  return encodeURI(publicPathFor('project', slug, { key }) ?? `/projects/${key}/${slug}`);
}

// OG 이미지 주소 (D13). 글·노트·프로젝트 글은 글 ID, 그 밖은 기본 이미지
export const DEFAULT_OG_IMAGE_PATH = '/og/default.png';
export function ogImagePath(entryId: string): string {
  return `/og/${encodeURIComponent(entryId)}.png`;
}
