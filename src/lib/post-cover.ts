// 블로그 카드 커버 테마 계산
// - 업로드한 썸네일 대신 코드로 커버를 그린다 (메시 그라디언트 + 노이즈 + 큰 카테고리 글자).
// - 같은 카테고리는 같은 색 계열을 쓴다. 블롭 위치는 slug로 정해 글마다 조금씩 다르다.
// - 순수 함수만 둔다. 서버/클라이언트 어디서 불러도 결과가 같다 (하이드레이션 불일치 없음).

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
const PALETTES: CoverPalette[] = [
  { base: '#0b0b1a', blobs: ['#7c3aed', '#2563eb', '#db2777'], ink: '#ede9fe' }, // 보라·파랑
  { base: '#04120e', blobs: ['#10b981', '#0ea5e9', '#84cc16'], ink: '#d1fae5' }, // 에메랄드
  { base: '#160a06', blobs: ['#f97316', '#e11d48', '#facc15'], ink: '#ffedd5' }, // 주황·장미
  { base: '#06101c', blobs: ['#38bdf8', '#6366f1', '#22d3ee'], ink: '#e0f2fe' }, // 하늘
  { base: '#14061a', blobs: ['#d946ef', '#f43f5e', '#8b5cf6'], ink: '#fae8ff' }, // 자홍
  { base: '#0a1206', blobs: ['#a3e635', '#14b8a6', '#eab308'], ink: '#ecfccb' }, // 라임
];

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

export function getCoverTheme(categoryLabel: string | null | undefined, tags: string[], slug: string): CoverTheme {
  const label = getCoverLabel(categoryLabel, tags);
  // 색 계열은 카테고리로 정한다 (대소문자 무시)
  const palette = PALETTES[hashString(label.toLowerCase()) % PALETTES.length];
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
