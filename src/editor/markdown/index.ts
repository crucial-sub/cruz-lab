// 마크다운 변환기 공개 API (재건 3단계 D4)
// - markdownToDoc: 마크다운 → 에디터 문서 JSON + 경고 목록. 열 때(D5)와 소스 모드에서 돌아올 때(D8) 쓴다.
// - docToMarkdown: 에디터 문서 JSON → 마크다운. 저장할 때 쓴다.
// - 두 함수 모두 DOM이 필요 없다. 왕복 검사 스크립트(Node)가 같은 함수를 쓴다.

import type { JSONContent } from '@tiptap/core';
import { parseMarkdown, stringifyMarkdown } from '../../lib/content/markdown.ts';
import { docToMdast } from './from-doc.ts';
import { mdastToDoc, type ConversionWarning } from './to-doc.ts';

export type { ConversionWarning } from './to-doc.ts';

export function markdownToDoc(markdown: string): {
  doc: JSONContent;
  warnings: ConversionWarning[];
} {
  return mdastToDoc(parseMarkdown(markdown));
}

export function docToMarkdown(doc: JSONContent): string {
  return stringifyMarkdown(docToMdast(doc));
}
