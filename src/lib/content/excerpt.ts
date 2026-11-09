// 본문 첫 줄 발췌 (재건 4단계 D12)
// - 홈의 최신 노트 줄, 노트 RSS 설명, 제목 없는 노트의 설명에 쓴다.
// - 공유 파서(parseMarkdown)로 읽고, 문서 순서로 처음 나오는 단락·제목·표 칸의 첫 줄을 평문으로 꺼낸다.
//   목록·인용·콜아웃·표 안으로도 내려간다. 그래서 목록 항목이나 표 칸의 글자가 서로 붙지 않는다(4단계 PR-B 리뷰 경미 8).
// - 코드·수식·원시 HTML·구분선은 글자를 꺼내지 않는다. 길면 max 글자(코드 포인트)에서 자르고 "…"를 붙인다.
// - Node 스크립트도 가져올 수 있게 상대 경로 import에 .ts를 붙인다.

import type { Nodes } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';
import { parseMarkdown } from './markdown.ts';

// 글자를 꺼내는 블록
const TEXT_BLOCKS = new Set<Nodes['type']>(['paragraph', 'heading', 'tableCell']);

// 문서 순서로 첫 줄을 찾는다
function findFirstLine(node: Nodes): string {
  if (TEXT_BLOCKS.has(node.type)) {
    return (
      mdastToString(node)
        .split('\n')
        .map((part) => part.replace(/\s+/g, ' ').trim())
        .find(Boolean) ?? ''
    );
  }
  if ('children' in node) {
    for (const child of node.children as Nodes[]) {
      const line = findFirstLine(child);
      if (line) return line;
    }
  }
  return '';
}

export function firstLineExcerpt(markdown: string, max = 120): string {
  const line = findFirstLine(parseMarkdown(markdown));
  if (!line) return '';
  const chars = Array.from(line);
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : line;
}
