// Shiki 언어 이름 판정 (재건 4단계 D8)
// - 마크다운 펜스 언어(기존 글: objectivec, nasm 등) → Shiki 언어 이름.
// - Shiki를 가져오지 않는다(타입만). 에디터 미리보기 청크와 서버가 함께 가져온다.
// - 5단계 T13: 언어별 문법 파일 표와 "Shiki 코어 → CodeHighlighter" 감싸기를 더했다.
//   에디터 미리보기(highlighter.ts, JS 엔진)와 서버(server/code-highlighter.ts, Oniguruma 엔진)가 함께 쓴다.

import type { Element, Root } from 'hast';
import type { HighlighterCore } from 'shiki/core';

// 공유 파이프라인이 받는 하이라이터 (markdown.ts의 rehype-shiki가 부른다)
export interface CodeHighlighter {
  // 코드 → <pre> hast 요소. 모르는 언어와 언어 없음은 민무늬(text)다
  toPre(code: string, lang: string | null): Element;
}

// 테마 쌍. light·dark 순서는 CSS 변수 이름(--shiki-light·--shiki-dark)이 된다
const SHIKI_THEMES = {
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

// ───────────── 언어별 문법 파일 (5단계 T13, D16) ─────────────
// - 서버는 글에 나온 언어의 문법만 불러온다(src/lib/server/code-highlighter.ts). 그래서 "펜스 언어 이름 → 문법 파일"을
//   Shiki 문법을 가져오지 않고 알아야 한다. 아래 표는 각 문법 파일의 name·aliases를 옮긴 것이다
//   (tests/unit/code-highlighter.test.ts가 문법 파일과 같은지 확인한다).

// 사이트가 쓰는 문법 파일 20개 (shiki/langs/<이름>.mjs, code-languages.ts의 CODE_LANGUAGES와 같은 언어)
export const SITE_GRAMMARS = [
  'javascript',
  'jsx',
  'typescript',
  'tsx',
  'c',
  'python',
  'java',
  'objective-c',
  'css',
  'html',
  'markdown',
  'asm',
  'bash',
  'json',
  'yaml',
  'sql',
  'go',
  'rust',
  'swift',
  'kotlin',
] as const;

export type SiteGrammar = (typeof SITE_GRAMMARS)[number];

// 문법 파일마다 Shiki가 받는 이름(문법 name + aliases)
// - bash.mjs의 문법 name은 shellscript다. html.mjs는 javascript·css 문법도 함께 등록한다.
export const SITE_GRAMMAR_NAMES: Readonly<Record<SiteGrammar, readonly string[]>> = {
  javascript: ['javascript', 'js'],
  jsx: ['jsx'],
  typescript: ['typescript', 'ts'],
  tsx: ['tsx'],
  c: ['c'],
  python: ['python', 'py'],
  java: ['java'],
  'objective-c': ['objective-c', 'objc'],
  css: ['css'],
  html: ['html'],
  markdown: ['markdown', 'md'],
  asm: ['asm'],
  bash: ['shellscript', 'bash', 'sh', 'shell', 'zsh'],
  json: ['json'],
  yaml: ['yaml', 'yml'],
  sql: ['sql'],
  go: ['go'],
  rust: ['rust', 'rs'],
  swift: ['swift'],
  kotlin: ['kotlin', 'kt', 'kts'],
};

// 이름 → 문법 파일 (처음 부를 때 만든다. 모듈 최상위에서 만들면 이 표를 쓰지 않는 미리보기 청크에도 남는다, 리뷰 B7)
let grammarOfName: ReadonlyMap<string, SiteGrammar> | null = null;

function grammarByName(name: string): SiteGrammar | undefined {
  grammarOfName ??= new Map(
    SITE_GRAMMARS.flatMap((grammar) => SITE_GRAMMAR_NAMES[grammar].map((alias) => [alias, grammar] as const)),
  );
  return grammarOfName.get(name);
}

// 펜스 언어 → 문법 파일. 사이트 언어가 아니면 null(민무늬로 그린다)
// - resolveShikiLanguage와 같은 규칙: 대소문자를 가리지 않고, 기존 글 이름(objectivec·nasm)을 맞춘다.
export function grammarForLanguage(lang: string | null | undefined): SiteGrammar | null {
  if (!lang) return null;
  const lower = lang.trim().toLowerCase();
  if (!lower) return null;
  return grammarByName(SHIKI_LANGUAGE_ALIASES[lower] ?? lower) ?? null;
}

// 펜스 여는 줄의 정보 문자열 첫 낱말(``` 또는 ~~~ 뒤)과 원시 HTML 코드 블록의 class="language-…"
// - 넉넉히 고른다. 닫는 펜스·글 속 글자에서 더 골라도 문법을 하나 더 불러올 뿐이다.
//   빠뜨리면 그 블록이 민무늬가 되므로 줄 앞(들여쓰기·목록·인용 기호)을 가리지 않는다.
// - 정보 문자열은 remark처럼 역슬래시 이스케이프와 숫자 문자 참조(&#106; &#x6A;)를 풀고 판정한다(리뷰 S7).
//   이름 문자 참조(&amp; 등)는 풀지 않는다(언어 이름에 쓰일 일이 없다).
const FENCE_LANGUAGE = /(?:`{3,}|~{3,})[ \t]*([^\s`]+)/g;
const CLASS_LANGUAGE = /language-([A-Za-z0-9_+#.-]+)/g;
const ESCAPED_PUNCTUATION = /\\([!-/:-@[-`{-~])/g;
const NUMERIC_REFERENCE = /&#(?:[xX]([0-9a-fA-F]{1,6})|([0-9]{1,7}));/g;

function decodeInfoWord(word: string): string {
  return word
    .replace(ESCAPED_PUNCTUATION, '$1')
    .replace(NUMERIC_REFERENCE, (whole, hex: string | undefined, dec: string | undefined) => {
      const code = hex ? Number.parseInt(hex, 16) : Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    });
}

// 다른 언어를 늦게 포함하는 문법(embeddedLangsLazy). 그 언어가 나중에 등록되면 Shiki가 이 문법을 다시 만든다.
// - markdown은 사이트 언어 16개(머리말 yaml, 안쪽 펜스의 언어 등)를 늦게 포함한다. markdown만 불러오면
//   같은 블록이 인스턴스가 앞서 불러온 언어에 따라 다르게 칠해진다(리뷰 S1). 그래서 markdown이 나오면
//   사이트 문법을 모두 불러온다(에디터 미리보기와 같은 조건). 사이트 문법 중 이런 문법은 markdown뿐이다
//   (tests/unit/code-highlighter.test.ts가 확인한다).
export const LAZY_EMBEDDING_GRAMMARS: readonly SiteGrammar[] = ['markdown'];

// 마크다운 본문을 칠하려고 불러올 사이트 문법 (중복 없음)
export function grammarsInMarkdown(markdown: string): SiteGrammar[] {
  const found = new Set<SiteGrammar>();
  for (const match of markdown.matchAll(FENCE_LANGUAGE)) {
    const grammar = grammarForLanguage(decodeInfoWord(match[1]));
    if (grammar) found.add(grammar);
  }
  for (const match of markdown.matchAll(CLASS_LANGUAGE)) {
    const grammar = grammarForLanguage(match[1]);
    if (grammar) found.add(grammar);
  }
  if (LAZY_EMBEDDING_GRAMMARS.some((grammar) => found.has(grammar))) return [...SITE_GRAMMARS];
  return [...found];
}

// Shiki 코어 → 사이트 하이라이터
// - 펜스 코드 값의 끝 줄바꿈 하나는 뗀다(mdast → hast가 붙인 것. 남기면 빈 줄이 하나 더 생긴다).
// - 언어 판정은 부를 때마다 코어에 지금 등록된 언어로 한다(서버는 언어를 나중에 더 불러온다).
export function codeHighlighterFromCore(core: HighlighterCore): CodeHighlighter {
  return {
    toPre(code, lang) {
      const value = code.endsWith('\n') ? code.slice(0, -1) : code;
      const resolved = resolveShikiLanguage(lang, new Set(core.getLoadedLanguages()));
      const root = core.codeToHast(value, {
        lang: resolved,
        themes: SHIKI_THEMES,
        defaultColor: false,
      }) as Root;
      const pre = root.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'pre',
      );
      if (!pre) throw new Error('Shiki가 <pre>를 만들지 않았습니다');
      return pre;
    },
  };
}
