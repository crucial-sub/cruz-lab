// 서버 코드 하이라이터 (재건 5단계 T13, Plan D16, 사용자 결정 2026-11-11 "언어만 + wasm 엔진")
// - 공개 페이지의 코드 블록을 칠한다(render-entry.ts가 부른다).
// - 엔진은 Oniguruma(wasm)다. 문법의 정규식을 번역하지 않고 그대로 돌린다. JS 엔진보다 첫 하이라이트가 빠르다
//   (로컬 측정: 글 하나의 첫 하이라이트 231 ms → 112 ms, 작업 문서 4.16).
// - 글에 markdown 블록이 있으면 사이트 문법 20개를 모두 불러온다(markdown 문법이 다른 언어를 늦게 포함한다.
//   shiki-languages.ts의 LAZY_EMBEDDING_GRAMMARS).
//   wasm은 shiki/wasm(JS 안에 넣은 wasm)이라 파일을 따로 싣지 않는다. 인스턴스마다 한 번 만든다.
// - 언어는 글에 나온 것만 처음 쓸 때 불러온다(문법 파일 import + loadLanguage). 한 번 불러온 언어는 인스턴스가 끝날 때까지 쓴다.
//   글의 언어는 shiki-languages.ts의 grammarsInMarkdown이 넉넉히 고른다.
// - 문법 파일은 이름을 글자 그대로 쓴 import()로 받는다. 함수 번들 추적(nft)이 20개 파일만 싣는다.
// - 에디터 미리보기(브라우저)는 content/highlighter.ts(JS 엔진)를 그대로 쓴다.
// - 실패해도 글을 실패시키지 않는다(rehype-shiki.ts와 같은 원칙, 리뷰 S2). 엔진을 만들지 못하면 하이라이터 없이
//   (코드는 민무늬로) 그리고, 문법 하나를 불러오지 못하면 그 언어만 민무늬다. 경고를 남긴다.
//   다음 요청이 다시 시도하지만 같은 인스턴스에서는 같은 오류일 수 있다(Node는 평가에 실패한 import를 기억하고,
//   Oniguruma 엔진은 wasm 초기화 결과를 모듈에 둔다). 배포 오류라서 테스트·스모크가 먼저 잡는다.

import { createHighlighterCore, type HighlighterCore, type LanguageRegistration } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import themeDark from 'shiki/themes/github-dark-default.mjs';
import themeLight from 'shiki/themes/github-light-default.mjs';
import {
  codeHighlighterFromCore,
  grammarsInMarkdown,
  type CodeHighlighter,
  type SiteGrammar,
} from '@/lib/content/shiki-languages';

type GrammarModule = { default: LanguageRegistration[] };

// 문법 파일 20개 (shiki-languages.ts의 SITE_GRAMMARS와 같다. 테스트가 이 함수로 문법 파일을 읽어 표와 비교한다)
export const GRAMMAR_LOADERS: Readonly<Record<SiteGrammar, () => Promise<GrammarModule>>> = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  'objective-c': () => import('shiki/langs/objective-c.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  asm: () => import('shiki/langs/asm.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
};

let corePromise: Promise<HighlighterCore> | null = null;
// 문법 파일별 불러오기 (같은 언어를 두 요청이 함께 불러오지 않게)
const grammarLoads = new Map<SiteGrammar, Promise<void>>();

// 엔진·테마만 등록한 코어 (언어는 없다)
function getCore(): Promise<HighlighterCore> {
  corePromise ??= createHighlighterCore({
    themes: [themeLight, themeDark],
    langs: [],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  }).catch((error: unknown) => {
    corePromise = null;
    throw error;
  });
  return corePromise;
}

// 문법 하나를 불러온다. 실패하면 경고만 남긴다(그 언어는 resolveShikiLanguage가 민무늬로 둔다)
function loadGrammar(core: HighlighterCore, grammar: SiteGrammar): Promise<void> {
  let loading = grammarLoads.get(grammar);
  if (!loading) {
    loading = GRAMMAR_LOADERS[grammar]()
      .then((module) => core.loadLanguage(...module.default))
      .catch((error: unknown) => {
        grammarLoads.delete(grammar);
        console.warn('코드 문법을 불러오지 못해 그 언어는 민무늬로 둔다', grammar, error);
      });
    grammarLoads.set(grammar, loading);
  }
  return loading;
}

// 이 본문을 칠할 하이라이터. 본문에 나온 언어의 문법을 먼저 불러온다
// - 엔진을 만들지 못하면 null이다(호출하는 쪽이 하이라이터 없이 그린다).
export async function getServerHighlighter(markdown: string): Promise<CodeHighlighter | null> {
  let core: HighlighterCore;
  try {
    core = await getCore();
  } catch (error) {
    console.warn('코드 하이라이터를 만들지 못해 코드를 민무늬로 둔다', error);
    return null;
  }
  await Promise.all(grammarsInMarkdown(markdown).map((grammar) => loadGrammar(core, grammar)));
  return codeHighlighterFromCore(core);
}

// 테스트용: 이 인스턴스에 불러온 언어(별칭 포함)
export async function loadedServerLanguages(): Promise<string[]> {
  return (await getCore()).getLoadedLanguages();
}
