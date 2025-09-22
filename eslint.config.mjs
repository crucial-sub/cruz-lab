// eslint.config.mjs
import js from '@eslint/js';
import astroParser from 'astro-eslint-parser';
import astroPlugin from 'eslint-plugin-astro';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import tailwind from 'eslint-plugin-tailwindcss';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  // 무시 경로
  { ignores: ['dist', 'node_modules', '.astro', 'coverage'] },

  // JS/TS 기본
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Astro 파일(.astro)
  {
    files: ['**/*.astro'],
    languageOptions: {
      parser: astroParser,
      parserOptions: {
        // <script> 안의 TS/JS 파싱을 typescript-eslint에 위임
        parser: tseslint.parser,
        extraFileExtensions: ['.astro'],
      },
      globals: {
        ...globals.browser, // URL, window 등
        ...globals.node, // process 등
      },
    },
    plugins: { astro: astroPlugin },
    rules: {
      // Astro 권장 규칙
      ...astroPlugin.configs.recommended.rules,
    },
  },

  // React/TSX
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { react: reactPlugin, 'jsx-a11y': jsxA11y, tailwindcss: tailwind },
    settings: { react: { version: 'detect' } },
    rules: {
      // React 권장 + 접근성 권장
      ...reactPlugin.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      // Next/Astro에선 불필요
      'react/react-in-jsx-scope': 'off',

      // Tailwind 클래스 검사(오타/존재 여부 등)
      'tailwindcss/no-custom-classname': 'off', // 필요시 on
      'tailwindcss/classnames-order': 'off', // 정렬은 Prettier 플러그인이 담당
    },
  },
];
