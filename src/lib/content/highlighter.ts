// 코드 하이라이트 (재건 4단계 D8)
// - Shiki 세밀 번들: createHighlighterCoreSync + JS 정규식 엔진 + 언어 20종 + 테마 2종.
//   전체 묶음(언어 200여 종)과 wasm 엔진을 쓰지 않는다. Vercel 함수와 브라우저에서 같은 코드가 돈다.
// - 듀얼 테마(github-light-default·github-dark-default), defaultColor: false.
//   토큰 색은 CSS 변수(--shiki-light·--shiki-dark)로만 나간다. 어느 쪽을 쓸지는 src/styles/shiki.css가 정한다.
// - 서버(render-entry.ts)는 처음 쓸 때 한 번 만든다. 에디터 미리보기는 import()로 따로 받는다(관리자만).
// - 공유 파이프라인(markdown.ts)은 이 파일을 가져오지 않는다. CodeHighlighter를 주입받는다.
//   그래서 왕복 검사와 미리보기 첫 화면은 Shiki 없이 돈다.
// - Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙이고 '@/' 별칭을 쓰지 않는다.

import type { Element, Root } from 'hast';
import { createHighlighterCoreSync, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import langAsm from 'shiki/langs/asm.mjs';
import langBash from 'shiki/langs/bash.mjs';
import langC from 'shiki/langs/c.mjs';
import langCss from 'shiki/langs/css.mjs';
import langGo from 'shiki/langs/go.mjs';
import langHtml from 'shiki/langs/html.mjs';
import langJava from 'shiki/langs/java.mjs';
import langJavascript from 'shiki/langs/javascript.mjs';
import langJson from 'shiki/langs/json.mjs';
import langJsx from 'shiki/langs/jsx.mjs';
import langKotlin from 'shiki/langs/kotlin.mjs';
import langMarkdown from 'shiki/langs/markdown.mjs';
import langObjectiveC from 'shiki/langs/objective-c.mjs';
import langPython from 'shiki/langs/python.mjs';
import langRust from 'shiki/langs/rust.mjs';
import langSql from 'shiki/langs/sql.mjs';
import langSwift from 'shiki/langs/swift.mjs';
import langTsx from 'shiki/langs/tsx.mjs';
import langTypescript from 'shiki/langs/typescript.mjs';
import langYaml from 'shiki/langs/yaml.mjs';
import themeDark from 'shiki/themes/github-dark-default.mjs';
import themeLight from 'shiki/themes/github-light-default.mjs';
import { resolveShikiLanguage, SHIKI_THEMES } from './shiki-languages.ts';

// 공유 파이프라인이 받는 하이라이터 (markdown.ts의 rehype-shiki가 부른다)
export interface CodeHighlighter {
  // 코드 → <pre> hast 요소. 모르는 언어와 언어 없음은 민무늬(text)다
  toPre(code: string, lang: string | null): Element;
}

// 언어 20종 (code-languages.ts의 CODE_LANGUAGES와 같다. objectivec·nasm은 별칭으로 맞춘다)
const LANGUAGES = [
  langJavascript,
  langJsx,
  langTypescript,
  langTsx,
  langC,
  langPython,
  langJava,
  langObjectiveC,
  langCss,
  langHtml,
  langMarkdown,
  langAsm,
  langBash,
  langJson,
  langYaml,
  langSql,
  langGo,
  langRust,
  langSwift,
  langKotlin,
];

// Shiki 하이라이터를 만든다 (동기. 언어·테마는 위에서 이미 가져왔다)
function createShikiCore(): HighlighterCore {
  return createHighlighterCoreSync({
    themes: [themeLight, themeDark],
    langs: LANGUAGES,
    engine: createJavaScriptRegexEngine(),
  });
}

// 사이트 하이라이터를 만든다
// - 펜스 코드 값의 끝 줄바꿈 하나는 뗀다(mdast → hast가 붙인 것. 남기면 빈 줄이 하나 더 생긴다).
export function createSiteHighlighter(): CodeHighlighter {
  const core = createShikiCore();
  const loaded = new Set(core.getLoadedLanguages());
  return {
    toPre(code, lang) {
      const value = code.endsWith('\n') ? code.slice(0, -1) : code;
      const resolved = resolveShikiLanguage(lang, loaded);
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

// 서버 공용 하이라이터 (처음 부를 때 한 번 만든다)
let shared: CodeHighlighter | null = null;

export function getSiteHighlighter(): CodeHighlighter {
  shared ??= createSiteHighlighter();
  return shared;
}
