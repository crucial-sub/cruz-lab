// 코드 하이라이트: 에디터 미리보기용 (재건 4단계 D8, 5단계 T13)
// - Shiki 세밀 번들: createHighlighterCoreSync + JS 정규식 엔진 + 언어 20종 + 테마 2종.
//   전체 묶음(언어 200여 종)과 wasm 엔진을 쓰지 않는다. 브라우저에 wasm을 보내지 않는다.
// - 듀얼 테마(github-light-default·github-dark-default), defaultColor: false.
//   토큰 색은 CSS 변수(--shiki-light·--shiki-dark)로만 나간다. 어느 쪽을 쓸지는 src/styles/shiki.css가 정한다.
// - 에디터 미리보기는 import()로 따로 받는다(관리자만). 단위 테스트도 이 파일을 쓴다.
// - 공개 페이지(서버)는 이 파일을 쓰지 않는다(5단계 T13, D16 사용자 결정 2026-11-11).
//   server/code-highlighter.ts가 Oniguruma(wasm) 엔진으로 글에 나온 언어만 불러온다. 첫 하이라이트가 빠르다.
//   두 엔진의 결과는 같아야 한다(tests/unit/code-highlighter.test.ts가 SQL을 뺀 언어 19종과 별칭 예시로 비교한다).
//   SQL 함수 이름(`COUNT(`)은 이 JS 엔진에서 실행마다 칠해지기도 하고 아니기도 했다(원인 미확인, 작업 문서 8절).
//   그래서 미리보기의 SQL 함수 이름 색은 공개 페이지와 다를 수 있다.
// - 공유 파이프라인(markdown.ts)은 이 파일을 가져오지 않는다. CodeHighlighter를 주입받는다.
//   그래서 왕복 검사와 미리보기 첫 화면은 Shiki 없이 돈다.
// - Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙이고 '@/' 별칭을 쓰지 않는다.

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
import { codeHighlighterFromCore, type CodeHighlighter } from './shiki-languages.ts';

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

// 사이트 하이라이터를 만든다 (언어 20종을 모두 등록한다)
export function createSiteHighlighter(): CodeHighlighter {
  return codeHighlighterFromCore(createShikiCore());
}
