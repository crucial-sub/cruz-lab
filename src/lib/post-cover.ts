// 블로그 카드 커버 테마 계산
// - 업로드한 썸네일 대신 코드로 커버를 그린다 (메시 그라디언트 + 노이즈 + 큰 카테고리 글자).
// - 색 계열은 카테고리로 정한다. 카테고리마다 팔레트를 표로 배정해 카테고리 10개(발행 글이 있는 9개 포함)가 서로 다른 색을 갖는다
//   (재건 4단계 D19. 그 전에는 이름 해시로 6개 중 하나를 골라 9개 카테고리가 4색이었다).
//   카테고리가 아닌 라벨(첫 태그, "Note")은 지금처럼 해시로 고른다.
// - 블롭 위치는 slug로 정해 글마다 조금씩 다르다.
// - 순수 함수만 둔다. 서버/클라이언트 어디서 불러도 결과가 같다 (하이드레이션 불일치 없음).
//   OG 이미지 템플릿(4단계 PR-C)도 같은 함수를 쓴다. 입력은 카테고리 표시 이름 또는 key다.

import { CATEGORIES, type CategoryKey } from './taxonomy.ts';

export interface CoverPalette {
  base: string; // 바탕색
  blobs: [string, string, string]; // 메시 그라디언트 색 3개
  ink: string; // 큰 글자 색
}

export interface CoverTheme {
  label: string; // 큰 글자로 쓸 카테고리 이름
  palette: CoverPalette;
  blobPositions: Array<{ x: number; y: number; r: number }>; // 블롭 중심(%)과 반지름(%)
  angle: number; // 격자 기울기(도)
}

// 다크/라이트 테마 어디서나 읽히는 진한 바탕 팔레트
// - 앞 6개는 3단계까지 쓰던 값이다. 뒤 4개는 D19에서 더했다(카테고리 10개가 서로 다른 색을 갖게).
export type PaletteName =
  | 'violet'
  | 'emerald'
  | 'orange'
  | 'sky'
  | 'magenta'
  | 'lime'
  | 'teal'
  | 'amber'
  | 'crimson'
  | 'slate';

export const PALETTES: Readonly<Record<PaletteName, CoverPalette>> = {
  violet: { base: '#0b0b1a', blobs: ['#7c3aed', '#2563eb', '#db2777'], ink: '#ede9fe' }, // 보라·파랑
  emerald: { base: '#04120e', blobs: ['#10b981', '#0ea5e9', '#84cc16'], ink: '#d1fae5' }, // 에메랄드
  orange: { base: '#160a06', blobs: ['#f97316', '#e11d48', '#facc15'], ink: '#ffedd5' }, // 주황·장미
  sky: { base: '#06101c', blobs: ['#38bdf8', '#6366f1', '#22d3ee'], ink: '#e0f2fe' }, // 하늘
  magenta: { base: '#14061a', blobs: ['#d946ef', '#f43f5e', '#8b5cf6'], ink: '#fae8ff' }, // 자홍
  lime: { base: '#0a1206', blobs: ['#a3e635', '#14b8a6', '#eab308'], ink: '#ecfccb' }, // 라임
  teal: { base: '#041414', blobs: ['#14b8a6', '#06b6d4', '#22c55e'], ink: '#ccfbf1' }, // 청록
  amber: { base: '#171004', blobs: ['#f59e0b', '#f97316', '#ef4444'], ink: '#fef3c7' }, // 호박
  crimson: { base: '#1a0608', blobs: ['#ef4444', '#f97316', '#fb7185'], ink: '#fee2e2' }, // 진홍
  slate: { base: '#101418', blobs: ['#94a3b8', '#64748b', '#cbd5e1'], ink: '#f1f5f9' }, // 슬레이트
};

// 해시로 고를 때 쓰는 순서 (3단계까지의 6개. 순서를 바꾸면 카테고리 없는 글의 색이 바뀐다)
const HASH_PALETTES: CoverPalette[] = [
  PALETTES.violet,
  PALETTES.emerald,
  PALETTES.orange,
  PALETTES.sky,
  PALETTES.magenta,
  PALETTES.lime,
];

// 카테고리 key → 팔레트 (D19)
// - JavaScript(자홍)·운영체제(주황)·React Native(라임)는 3단계까지 보이던 색을 지킨다. AI는 하늘 → 보라, React는 자홍 → 하늘로 바뀐다.
// - 겹치던 네트워크·컴퓨터구조·알고리즘·자료구조·React에 서로 다른 색을 준다. 회고는 중성 슬레이트.
export const CATEGORY_PALETTES: Readonly<Record<CategoryKey, CoverPalette>> = {
  javascript: PALETTES.magenta,
  os: PALETTES.orange,
  'react-native': PALETTES.lime,
  ai: PALETTES.violet,
  react: PALETTES.sky,
  network: PALETTES.emerald,
  'computer-architecture': PALETTES.teal,
  algorithm: PALETTES.amber,
  'data-structure': PALETTES.crimson,
  retrospective: PALETTES.slate,
};

// 문자열 → 32비트 해시 (FNV-1a). 같은 입력이면 항상 같은 값
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// 해시에서 0~1 사이 값을 차례로 꺼내는 의사 난수 (mulberry32)
function seededRandom(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 커버 카테고리 이름 결정 (재건 2단계: 제목 접두사 대신 카테고리 표시 이름)
// 1) 카테고리 표시 이름: "운영체제", "React Native"
// 2) 없으면 첫 번째 태그
// 3) 둘 다 없으면 "Note"
export function getCoverLabel(categoryLabel: string | null | undefined, tags: string[]): string {
  if (categoryLabel) return categoryLabel;
  if (tags.length > 0) return tags[0];
  return 'Note';
}

// 라벨(카테고리 표시 이름 또는 key)의 팔레트
// - 카테고리면 표(CATEGORY_PALETTES)에서, 아니면 이름 해시로 6개 중 하나
export function getCoverPalette(label: string): CoverPalette {
  const lower = label.toLowerCase();
  const category = CATEGORIES.find(
    (item) => item.key === lower || item.label.toLowerCase() === lower,
  );
  if (category) return CATEGORY_PALETTES[category.key];
  return HASH_PALETTES[hashString(lower) % HASH_PALETTES.length];
}

// - categoryKey를 주면 팔레트를 key로 고른다(5단계 D1: 화면에서 카테고리 이름을 바꿔도 색이 같다, PR-B 리뷰 S10)
export function getCoverTheme(
  categoryLabel: string | null | undefined,
  tags: string[],
  slug: string,
  categoryKey: string | null = null,
): CoverTheme {
  const label = getCoverLabel(categoryLabel, tags);
  const byKey = categoryKey ? (CATEGORY_PALETTES as Readonly<Record<string, CoverPalette>>)[categoryKey] : undefined;
  const palette = byKey ?? getCoverPalette(label);
  // 블롭 배치는 글마다 다르게 한다
  const rand = seededRandom(hashString(slug));
  const blobPositions = [0, 1, 2].map(() => ({
    x: Math.round(10 + rand() * 80),
    y: Math.round(10 + rand() * 80),
    r: Math.round(45 + rand() * 30),
  }));
  const angle = Math.round(-12 + rand() * 24);

  return { label, palette, blobPositions, angle };
}
