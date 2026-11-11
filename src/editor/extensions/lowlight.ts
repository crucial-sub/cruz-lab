// 편집 영역 코드 블록 하이라이트 (재건 3단계 D10)
// - 등록 언어는 lowlight의 common 묶음 + x86asm(별칭 nasm)이다. 3단계에서는 공개 페이지(rehype-highlight 기본값)와
//   같은 묶음이었다. 4단계부터 미리보기·공개 페이지는 Shiki라 이 등록은 편집 영역만 쓴다
//   (미리보기 src/lib/content/highlighter.ts, 공개 페이지 src/lib/server/code-highlighter.ts, 5단계 T13).
//   common에는 기존 글의 언어(javascript·jsx, c, python, css, typescript, html(xml), markdown, java, objectivec)와
//   bash, json, yaml, sql, go, rust, swift, kotlin이 모두 있다. nasm만 없어 따로 등록한다.
// - Tiptap code-block-lowlight는 등록되지 않은 언어를 자동 추측으로 색칠한다. 드롭다운의 언어는 모두 등록돼 있어야 한다.
// - CODE_LANGUAGES는 언어 선택 드롭다운이 보이는 목록이다(T5). 공개 하이라이트(Shiki)와 같은 목록이라
//   4단계에서 src/lib/content/code-languages.ts로 옮겼다. 여기서는 다시 내보낸다.

import x86asm from 'highlight.js/lib/languages/x86asm';
import { common, createLowlight } from 'lowlight';

export const lowlight = createLowlight(common);
lowlight.register({ x86asm });
lowlight.registerAlias({ x86asm: ['nasm'] });

// 드롭다운 항목: { 값(마크다운 lang), 표시 이름 }
export { CODE_LANGUAGES } from '../../lib/content/code-languages.ts';
