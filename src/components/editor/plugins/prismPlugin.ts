/**
 * Prism 코드 하이라이팅 플러그인
 *
 * Milkdown 에디터에서 코드 블록 구문 강조를 제공합니다.
 * - 주요 프로그래밍 언어 지원
 * - 다크 모드 대응 테마
 * - 자동 언어 감지
 */

import { prism, prismConfig } from '@milkdown/plugin-prism';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';

// Prism 코어 및 언어 import
import 'prismjs/components/prism-core';

// 주요 언어 지원
import 'prismjs/components/prism-markup'; // HTML
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-clike'; // C-like 기반 (의존성)
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-shell-session';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-git';
import 'prismjs/components/prism-regex';

// 추가 인기 언어
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-php';

// Prism 인스턴스 가져오기
import Prism from 'prismjs';

/**
 * 지원 언어 별칭 매핑
 * 일반적으로 사용되는 별칭을 Prism 언어 ID로 매핑
 */
export const languageAliases: Record<string, string> = {
  // JavaScript 계열
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
  node: 'javascript',

  // Python
  py: 'python',
  python3: 'python',

  // Shell
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  terminal: 'shell-session',

  // Markup
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  htm: 'markup',

  // Styles
  scss: 'css',
  sass: 'css',
  less: 'css',

  // Data
  yml: 'yaml',
  jsonc: 'json',
  json5: 'json',

  // Database
  mysql: 'sql',
  pgsql: 'sql',
  postgresql: 'sql',
  sqlite: 'sql',

  // C 계열
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  dotnet: 'csharp',

  // 기타
  dockerfile: 'docker',
  makefile: 'makefile',
  rs: 'rust',
  rb: 'ruby',
  kt: 'kotlin',
  kts: 'kotlin',
  gql: 'graphql',
};

/**
 * 언어 이름 정규화
 * 별칭을 실제 Prism 언어 ID로 변환
 */
export function normalizeLanguage(lang: string): string {
  const normalized = lang.toLowerCase().trim();
  return languageAliases[normalized] || normalized;
}

/**
 * 언어 지원 여부 확인
 */
export function isLanguageSupported(lang: string): boolean {
  const normalized = normalizeLanguage(lang);
  return normalized in Prism.languages;
}

/**
 * 지원되는 언어 목록 반환
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(Prism.languages).filter(
    (lang) => typeof Prism.languages[lang] === 'object'
  );
}

/**
 * Prism 설정 함수
 * Milkdown 에디터에 Prism 플러그인을 설정합니다.
 */
export function configurePrism() {
  return (ctx: any) => {
    ctx.update(prismConfig.key, (prev: any) => ({
      ...prev,
      // 커스텀 하이라이터 설정 (필요시)
      configureRefractor: () => {
        // refractor 설정 (옵션)
      },
    }));
  };
}

/**
 * Prism 코드 하이라이팅 플러그인
 */
export const prismHighlightPlugin: MilkdownPlugin[] = prism;

export default prismHighlightPlugin;
