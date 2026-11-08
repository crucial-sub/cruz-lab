// 공개 slug 조회 판정 (Plan 4.1, 7.4)
// - 서버 조회 결과(현재 slug 일치, slugHistory 일치)에서 무엇을 보일지 정한다. 순수 함수다.

export interface SlugCandidate {
  id: string;
  slug: string;
  kind: string;
}

export type SlugChoice<T extends SlugCandidate> = { match: T } | { redirectTo: string; target: T } | null;

// 1. 현재 slug가 같은 글이 있으면 그 글. 같은 slug가 여럿이면 post를 먼저 고른다.
// 2. 없으면 slugHistory에 그 slug가 있는 글의 현재 slug로 보낸다. 자기 자신으로는 보내지 않는다.
// - kind 거르기는 호출하는 쪽이 한다(공개 /blog는 post만 받는다).
export function chooseSlugLookup<T extends SlugCandidate>(slug: string, direct: T[], history: T[]): SlugChoice<T> {
  const match = direct.find((item) => item.kind === 'post') ?? direct[0];
  if (match) return { match };
  const target = history.find((item) => item.slug !== slug);
  return target ? { redirectTo: target.slug, target } : null;
}

// 글 주소. Location 헤더에 넣을 수 있게 ASCII로 인코딩한다
export function blogPath(slug: string): string {
  return encodeURI(`/blog/${slug}`);
}
