// 글 분류 상수와 규칙 (재건 2단계 Plan D2, 4.3)
// - 카테고리, 태그 정규화, slug 형식, 연재 key 형식을 한 곳에 둔다.
// - 서버, 마이그레이션 스크립트(Node 직접 실행), 테스트가 모두 이 파일을 가져온다.
//   그래서 상대 경로 import에는 `.ts` 확장자를 쓰고, 지울 수 있는 타입 문법만 쓴다.

// 카테고리 목록
// - key는 URL에 쓰기 좋게 영문이다. 표시 이름은 label이다.
// - synonymTags는 이 카테고리와 뜻이 같은 태그다. 태그를 정규화할 때 뺀다.
export const CATEGORIES = [
  { key: 'ai', label: 'AI', synonymTags: ['ai'] },
  { key: 'javascript', label: 'JavaScript', synonymTags: ['javascript'] },
  { key: 'react', label: 'React', synonymTags: ['react'] },
  { key: 'react-native', label: 'React Native', synonymTags: ['reactnative', 'react-native'] },
  { key: 'os', label: '운영체제', synonymTags: ['운영체제'] },
  { key: 'data-structure', label: '자료구조', synonymTags: ['자료구조'] },
  { key: 'algorithm', label: '알고리즘', synonymTags: ['알고리즘'] },
  { key: 'network', label: '네트워크', synonymTags: ['네트워크'] },
  { key: 'computer-architecture', label: '컴퓨터구조', synonymTags: ['컴퓨터구조'] },
  { key: 'retrospective', label: '회고', synonymTags: ['회고', '에세이'] },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]['key'];

export const CATEGORY_KEYS = CATEGORIES.map((category) => category.key) as [CategoryKey, ...CategoryKey[]];

// 글 하나에 붙일 수 있는 태그 최대 수
export const MAX_TAGS = 3;

// 태그 별칭: 정규화(공백·대소문자) 뒤 값 → 합칠 대상
export const TAG_ALIASES: Readonly<Record<string, string>> = {
  크래프톤정글: '크래프톤-정글',
};

// 새 slug 형식: 소문자 영문·숫자·한글 묶음을 '-' 하나로 잇는다
export const SLUG_PATTERN = /^[a-z0-9가-힣]+(-[a-z0-9가-힣]+)*$/;

// 연재 key 형식
export const SERIES_KEY_PATTERN = /^[a-z0-9-]+$/;

// 카테고리 key인지 확인한다
export function isCategoryKey(value: unknown): value is CategoryKey {
  return typeof value === 'string' && (CATEGORY_KEYS as readonly string[]).includes(value);
}

// 카테고리 표시 이름. 모르는 key면 key를 그대로 돌려준다
export function getCategoryLabel(key: string): string {
  return CATEGORIES.find((category) => category.key === key)?.label ?? key;
}

// 태그 하나를 정규화한다 (D2 규칙 1~4)
// 1. 앞뒤 공백을 지우고 NFC로 맞춘다.
// 2. 영문을 소문자로 바꾼다.
// 3. 공백 묶음을 '-' 하나로 바꾼다.
// 4. 별칭을 합친다.
export function normalizeTag(raw: string): string {
  const base = raw.trim().normalize('NFC').toLowerCase().replace(/\s+/g, '-');
  return TAG_ALIASES[base] ?? base;
}

// 정규화한 태그가 카테고리와 뜻이 같으면 그 카테고리 key를 돌려준다 (D2 규칙 5)
export function categoryForSynonymTag(tag: string): CategoryKey | null {
  const normalized = normalizeTag(tag);
  const match = CATEGORIES.find((category) =>
    (category.synonymTags as readonly string[]).includes(normalized),
  );
  return match ? match.key : null;
}

// 태그 목록을 정규화한다 (D2 규칙 1~6 중 개수 검사를 뺀 것)
// - 빈 값, 카테고리와 뜻이 같은 태그, 중복을 뺀다. 순서는 처음 나온 순서를 지킨다.
// - 개수 한도(MAX_TAGS)는 호출하는 쪽이 검사한다. 넘으면 저장을 거부해야 한다.
export function normalizeTags(rawTags: readonly string[]): string[] {
  const result: string[] = [];
  for (const raw of rawTags) {
    if (typeof raw !== 'string') continue;
    const tag = normalizeTag(raw);
    if (!tag) continue;
    if (categoryForSynonymTag(tag)) continue;
    if (!result.includes(tag)) result.push(tag);
  }
  return result;
}

// 태그가 이미 정규화된 값인지 확인한다 (저장된 문서 검증용)
export function isNormalizedTag(tag: string): boolean {
  return tag.length > 0 && normalizeTag(tag) === tag && categoryForSynonymTag(tag) === null;
}

// 새 slug 형식을 지키는지 확인한다
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

// 제목 앞의 "[접두사] "를 뗀다
export function stripTitlePrefix(title: string): string {
  return title.replace(/^\s*\[[^\]]+\]\s*/, '');
}

// 제목 앞의 "[접두사]"에서 접두사를 꺼낸다. 없으면 null
export function extractTitlePrefix(title: string): string | null {
  const match = title.match(/^\s*\[([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

// 노트 slug를 만든다: note-YYYYMMDD-HHmm (한국 시간 기준)
export function buildNoteSlug(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `note-${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}-${pad(kst.getUTCHours())}${pad(kst.getUTCMinutes())}`;
}
