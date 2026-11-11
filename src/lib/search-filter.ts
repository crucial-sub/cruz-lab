// 글 목록 필터 검색어 규칙 (재건 4단계 D2)
// - 서버(행의 data-search 값 만들기)와 브라우저(SearchFilter.astro의 <script>)가 같은 함수를 쓴다.
// - 브라우저 번들에 들어가므로 다른 모듈을 가져오지 않는다.

// 비교용 글자: NFC, 소문자, 공백 묶음 하나로
export function normalizeSearchText(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

// 행의 검색 대상 글(이미 normalizeSearchText를 거친 값)이 검색어에 맞는지
// - 검색어를 공백으로 나눈 낱말이 모두 들어 있으면 맞다. 빈 검색어는 모두 맞다.
// - 낱말 앞의 #은 뗀다. 태그 칩에 보이는 "#pintos"를 그대로 써도 찾는다(4단계 PR-B 리뷰 경미 14).
export function matchesSearch(haystack: string, query: string): boolean {
  const words = normalizeSearchText(query)
    .split(' ')
    .map((word) => word.replace(/^#+/, ''))
    .filter(Boolean);
  return words.every((word) => haystack.includes(word));
}
