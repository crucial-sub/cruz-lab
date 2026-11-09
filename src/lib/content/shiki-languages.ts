// Shiki 언어 이름 판정 (재건 4단계 D8)
// - 마크다운 펜스 언어(기존 글: objectivec, nasm 등) → Shiki 언어 이름.
// - 순수 함수다. Shiki를 가져오지 않아 테스트와 미리보기 첫 화면이 가볍다.

// 테마 쌍. light·dark 순서는 CSS 변수 이름(--shiki-light·--shiki-dark)이 된다
export const SHIKI_THEMES = {
  light: 'github-light-default',
  dark: 'github-dark-default',
} as const;

// 하이라이트하지 않는 언어 이름 (Shiki의 민무늬 언어)
export const PLAIN_LANGUAGE = 'text';

// Shiki 기본 별칭에 없는 이름 → Shiki 언어 이름
// - objectivec: 기존 글 4개 블록(highlight.js 이름). Shiki는 objective-c(별칭 objc)다.
// - nasm: 기존 글 1개 블록. Shiki에는 asm(GAS·NASM·Intel 문법을 함께 그린다)만 있다.
export const SHIKI_LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  objectivec: 'objective-c',
  nasm: 'asm',
};

// 펜스 언어 → Shiki 언어 이름. 불러온 언어(별칭 포함)에 없으면 민무늬
// - 대소문자를 가리지 않는다(```JavaScript도 색칠한다).
export function resolveShikiLanguage(
  lang: string | null | undefined,
  loaded: ReadonlySet<string>,
): string {
  if (!lang) return PLAIN_LANGUAGE;
  const lower = lang.trim().toLowerCase();
  if (!lower) return PLAIN_LANGUAGE;
  const name = SHIKI_LANGUAGE_ALIASES[lower] ?? lower;
  return loaded.has(name) ? name : PLAIN_LANGUAGE;
}
