// 코드 블록 하이라이트 (재건 3단계 D10)
// - 등록 언어는 lowlight의 common 묶음 + x86asm(별칭 nasm)이다. common은 공개 페이지의 rehype-highlight 기본값과 같다.
//   common에는 기존 글의 언어(javascript·jsx, c, python, css, typescript, html(xml), markdown, java, objectivec)와
//   bash, json, yaml, sql, go, rust, swift, kotlin이 모두 있다. nasm만 없어 따로 등록한다(공개 페이지는 4단계 파이프라인이 같은 등록을 쓴다).
// - Tiptap code-block-lowlight는 등록되지 않은 언어를 자동 추측으로 색칠한다. 드롭다운의 언어는 모두 등록돼 있어야 한다.
// - CODE_LANGUAGES는 언어 선택 드롭다운이 보이는 목록이다(T5).

import x86asm from 'highlight.js/lib/languages/x86asm';
import { common, createLowlight } from 'lowlight';

export const lowlight = createLowlight(common);
lowlight.register({ x86asm });
lowlight.registerAlias({ x86asm: ['nasm'] });

// 드롭다운 항목: { 값(마크다운 lang), 표시 이름 }
export const CODE_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'tsx', label: 'TSX' },
  { value: 'c', label: 'C' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'objectivec', label: 'Objective-C' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'nasm', label: 'NASM' },
  { value: 'bash', label: 'Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
];
