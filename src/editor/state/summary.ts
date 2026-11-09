// 패널 요약: 개요·글자 수·읽기 시간 (재건 3단계 D13, 2.1 "개요 패널, 글자 수, 읽기 시간(공식 하나)")
// - 문서 JSON을 받는 순수 함수다. 에디터는 입력을 300ms 디바운스한 뒤 한 번 부른다(2.2 #5).
// - 읽기 시간은 서버 발행(entry-rules.ts)과 같은 calculateReadingTime을 마크다운에 적용한다.

import type { JSONContent } from '@tiptap/core';
import { calculateReadingTime } from '@/utils/readingTime';

export interface OutlineItem {
  // 문서 안 제목의 순번(0부터). 누르면 이 순번의 제목으로 간다
  index: number;
  level: number;
  text: string;
}

export interface CharacterCount {
  withSpaces: number;
  withoutSpaces: number;
}

export interface DocSummary {
  outline: OutlineItem[];
  characters: CharacterCount;
  readingMinutes: number;
}

// 노드 안 글자 노드의 글자를 이어 붙인다
function textOf(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join('');
}

// 문서 순서대로 모든 제목(인용·콜아웃 안 포함)을 모은다
export function extractOutline(doc: JSONContent): OutlineItem[] {
  const items: OutlineItem[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === 'heading') {
      const level = Number(node.attrs?.level ?? 1);
      items.push({ index: items.length, level, text: textOf(node).trim() });
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return items;
}

// 글자 노드의 글자 수. 코드 포인트 단위로 센다(이모지 하나 = 1자)
export function countCharacters(doc: JSONContent): CharacterCount {
  let withSpaces = 0;
  let withoutSpaces = 0;
  const visit = (node: JSONContent) => {
    if (node.type === 'text') {
      for (const char of node.text ?? '') {
        withSpaces += 1;
        if (!/\s/.test(char)) withoutSpaces += 1;
      }
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return { withSpaces, withoutSpaces };
}

// 패널에 보이는 요약 한 묶음
export function summarizeDoc(doc: JSONContent, markdown: string): DocSummary {
  return {
    outline: extractOutline(doc),
    characters: countCharacters(doc),
    readingMinutes: calculateReadingTime(markdown),
  };
}
