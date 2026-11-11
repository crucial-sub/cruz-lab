// 글 분류 상수와 규칙 (재건 2단계 Plan D2, 4.3)
// - 카테고리, 태그 정규화, slug 형식, 연재 key 형식을 한 곳에 둔다.
// - 서버, 마이그레이션 스크립트(Node 직접 실행), 테스트가 모두 이 파일을 가져온다.
//   그래서 상대 경로 import에는 `.ts` 확장자를 쓰고, 지울 수 있는 타입 문법만 쓴다.
// - 5단계 D1: 카테고리 목록은 데이터(settings/taxonomy)로 옮겼다. 아래 CATEGORIES는 기본값이다.
//   문서가 없거나 읽지 못하면 이 값을 쓴다. 2단계 이전 스크립트와 미들웨어는 계속 이 값을 쓴다.
//   데이터를 받는 함수는 이름 끝이 In이다(categoryLabelIn, normalizeTagsIn …). 파일 아래쪽에 있다.

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

// 카테고리 key 형식 (5단계 D1). 저장된 문서는 이 형식만 검사한다(목록에 있는지는 API가 본다)
export const CATEGORY_KEY_PATTERN = /^[a-z0-9-]+$/;
// 새로 만들거나 바꾸는 key의 형식: 영문 소문자·숫자 묶음을 '-' 하나로 잇는다(앞뒤 '-' 없음)
export const NEW_CATEGORY_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_CATEGORY_KEY_LENGTH = 40;
export const MAX_CATEGORY_LABEL_LENGTH = 30;

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

// ───────────── 데이터 분류 (재건 5단계 D1) ─────────────
// settings/taxonomy 문서의 값을 받는 순수 함수다. 서버(getTaxonomy)·관리자 앱·에디터가 함께 쓴다.

export interface TaxonomyCategory {
  key: string;
  label: string;
  synonymTags: string[];
}

export interface TaxonomyData {
  categories: TaxonomyCategory[];
  // 옛 key → 새 key (key 바꾸기·합치기 뒤 옛 주소 301)
  categoryAliases: Record<string, string>;
  // 옛 태그 → 새 태그 (태그 바꾸기·합치기 뒤 옛 주소 301, 입력 정규화)
  tagAliases: Record<string, string>;
}

// 코드 기본값 (문서가 없을 때). 첫 저장도 이 값에서 시작한다(기존 10개 그대로)
export function defaultTaxonomy(): TaxonomyData {
  return {
    categories: CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      synonymTags: [...category.synonymTags],
    })),
    categoryAliases: {},
    tagAliases: {},
  };
}

// 목록에 있는 카테고리인지
export function hasCategoryIn(taxonomy: TaxonomyData, key: string): boolean {
  return taxonomy.categories.some((category) => category.key === key);
}

// 카테고리 표시 이름. 목록에 없으면 key를 그대로 돌려준다
export function categoryLabelIn(taxonomy: TaxonomyData, key: string): string {
  return taxonomy.categories.find((category) => category.key === key)?.label ?? key;
}

// 태그 하나를 정규화한다: 코드 규칙(normalizeTag) 뒤 데이터 별칭을 따른다
export function normalizeTagIn(taxonomy: TaxonomyData, raw: string): string {
  const base = normalizeTag(raw);
  return taxonomy.tagAliases[base] ?? base;
}

// 정규화한 태그가 카테고리 동의어면 그 카테고리 key
export function categoryForSynonymTagIn(taxonomy: TaxonomyData, tag: string): string | null {
  const normalized = normalizeTagIn(taxonomy, tag);
  return taxonomy.categories.find((category) => category.synonymTags.includes(normalized))?.key ?? null;
}

// 태그 목록을 정규화한다(normalizeTags와 같은 규칙, 데이터 동의어·별칭을 쓴다). 개수는 호출하는 쪽이 검사한다
export function normalizeTagsIn(taxonomy: TaxonomyData, rawTags: readonly string[]): string[] {
  const result: string[] = [];
  for (const raw of rawTags) {
    if (typeof raw !== 'string') continue;
    const tag = normalizeTagIn(taxonomy, raw);
    if (!tag) continue;
    if (categoryForSynonymTagIn(taxonomy, tag)) continue;
    if (!result.includes(tag)) result.push(tag);
  }
  return result;
}

// 별칭 표에 새 줄을 더한다: from → to
// - to로 가던 옛 줄(to가 원래 다른 곳의 별칭이었다)을 지운다. to는 이제 살아 있는 값이다.
// - from으로 가던 줄은 to로 잇는다(별칭이 두 번 건너지 않게).
export function addAlias(aliases: Readonly<Record<string, string>>, from: string, to: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [source, target] of Object.entries(aliases)) {
    if (source === to || source === from) continue;
    result[source] = target === from ? to : target;
  }
  if (from !== to) result[from] = to;
  return result;
}

// 값으로 가는 별칭 줄을 모두 지운다(지운 카테고리)
export function removeAliasesTo(aliases: Readonly<Record<string, string>>, target: string): Record<string, string> {
  return Object.fromEntries(Object.entries(aliases).filter(([, value]) => value !== target));
}

// 별칭 줄 하나를 지운다(그 값이 다시 살아 있는 값이 될 때)
export function removeAliasFrom(aliases: Readonly<Record<string, string>>, source: string): Record<string, string> {
  return Object.fromEntries(Object.entries(aliases).filter(([key]) => key !== source));
}

// 글 하나의 태그 목록에서 from을 to로 바꾼다. 이미 to가 있으면 합친다(순서는 앞의 자리를 지킨다)
export function replaceTag(tags: readonly string[], from: string, to: string): string[] {
  const result: string[] = [];
  for (const tag of tags) {
    const next = tag === from ? to : tag;
    if (!result.includes(next)) result.push(next);
  }
  return result;
}

export type CategoryInputIssue = { field: 'key' | 'label'; message: string };

// 새 카테고리 key·이름 검사 (만들기, key 바꾸기)
export function checkCategoryKey(taxonomy: TaxonomyData, key: string, options: { allowExisting?: boolean } = {}): CategoryInputIssue | null {
  if (!key) return { field: 'key', message: '주소 key가 필요합니다' };
  if (key.length > MAX_CATEGORY_KEY_LENGTH) return { field: 'key', message: `주소 key는 ${MAX_CATEGORY_KEY_LENGTH}자까지입니다` };
  if (!NEW_CATEGORY_KEY_PATTERN.test(key)) {
    return { field: 'key', message: '주소 key는 영문 소문자·숫자 묶음을 -로 잇습니다' };
  }
  if (!options.allowExisting && hasCategoryIn(taxonomy, key)) return { field: 'key', message: '이미 있는 key입니다' };
  return null;
}

export function checkCategoryLabel(taxonomy: TaxonomyData, label: string, exceptKey: string | null = null): CategoryInputIssue | null {
  const trimmed = label.trim();
  if (!trimmed) return { field: 'label', message: '이름이 필요합니다' };
  if (trimmed.length > MAX_CATEGORY_LABEL_LENGTH) return { field: 'label', message: `이름은 ${MAX_CATEGORY_LABEL_LENGTH}자까지입니다` };
  const lower = trimmed.toLowerCase();
  if (taxonomy.categories.some((category) => category.key !== exceptKey && category.label.toLowerCase() === lower)) {
    return { field: 'label', message: '같은 이름의 카테고리가 있습니다' };
  }
  return null;
}

// 옛 내용(이전 발행본)의 분류를 지금 분류 데이터에 맞춘다 (5단계 D3 가져오기)
// - 카테고리: 목록에 있으면 그대로, 옛 key 별칭이면 새 key, 그 밖(지운 카테고리)은 null(에디터에서 다시 고른다).
// - 태그: 지금 별칭·동의어로 정규화하고 MAX_TAGS개까지.
export function alignContentTaxonomy<T extends { category: string | null; tags: string[] }>(content: T, taxonomy: TaxonomyData): T {
  let category = content.category;
  if (category && !hasCategoryIn(taxonomy, category)) {
    const alias = taxonomy.categoryAliases[category];
    category = alias && hasCategoryIn(taxonomy, alias) ? alias : null;
  }
  return { ...content, category, tags: normalizeTagsIn(taxonomy, content.tags).slice(0, MAX_TAGS) };
}
