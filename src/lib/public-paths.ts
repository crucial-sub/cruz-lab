// 공개 페이지 주소 (재건 4단계 D11)
// - 페이지·사이트맵·리다이렉트가 같은 함수로 주소를 만든다. 주소 규칙은 이 파일에만 둔다.
// - 4단계 PR-A는 글 상세가 쓰는 것만 둔다. PR-B(T4)가 카테고리·노트 주소 등을 더한다.
// - 글 주소는 slug-lookup.ts의 blogPath, kind별 주소는 entry-rules.ts의 publicPathFor다.

import { CATEGORIES, type CategoryKey } from './taxonomy';

// 카테고리 목록 주소
// - 최종 주소는 /blog/category/<key>다(D11). 그 페이지는 PR-B(T4)가 만든다.
// - 그때까지는 지금 동작하는 동의어 태그 주소를 쓴다. 태그 페이지가 그 카테고리의 글을 보인다.
//   PR-B가 동의어 태그를 카테고리로 301하므로, 이 함수만 /blog/category/<key>로 바꾸면 된다.
export function categoryPath(key: CategoryKey): string {
  const category = CATEGORIES.find((item) => item.key === key);
  const synonym = category?.synonymTags[0] ?? key;
  return tagPath(synonym);
}

// 태그 목록 주소
export function tagPath(tag: string): string {
  return `/blog/tag/${encodeURIComponent(tag)}`;
}

// 연재 상세 주소 (연재 key)
export function seriesPath(key: string): string {
  return `/series/${encodeURIComponent(key)}`;
}
