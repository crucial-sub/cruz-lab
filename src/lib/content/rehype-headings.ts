// 제목 id·앵커·목차 (재건 4단계 D16)
// - 본문의 모든 제목(h1~h6)에 id를 붙인다. github-slugger(GitHub과 같은 규칙, 한글 유지)이고 같은 글자는 -1, -2가 붙는다.
// - 제목 끝에 앵커 링크 <a class="heading-anchor" href="#id">#</a>를 더한다. 보이기는 prose.css(hover·focus)가 정한다.
//   앵커 앞은 줄바꿈 없는 공백이다.
// - h2·h3를 문서 순서대로 모아 file.data.toc에 둔다. 글 상세의 목차가 쓴다.
// - 페이지의 다른 요소 id(PAGE_RESERVED_IDS)와 겹치지 않게 그 id를 먼저 예약한다.
// - 각주 머리(remark-gfm의 section[data-footnotes] 안 h2)는 건드리지 않는다. 각주 링크가 그 id를 가리킨다.
// - rehype-strip-unsafe 뒤, rehype-katex 앞에 돈다. 그래서 제목 안의 수식은 TeX 원문 글자로 목차에 나온다.
// - Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙인다.

import GithubSlugger, { slug as plainSlug } from 'github-slugger';
import type { Element, ElementContent, Root } from 'hast';
import { SKIP, visit } from 'unist-util-visit';

export interface TocEntry {
  depth: 2 | 3;
  id: string;
  text: string;
}

// unified가 넘기는 VFile 중 이 플러그인이 쓰는 부분 (vfile 패키지는 직접 의존성이 아니다)
export interface FileWithData {
  data: Record<string, unknown>;
}

// 처리 결과의 목차를 꺼낸다
export function tocOf(file: FileWithData): TocEntry[] {
  return Array.isArray(file.data.toc) ? (file.data.toc as TocEntry[]) : [];
}

// 글 상세 페이지가 쓰는 요소 id. 본문 제목 id가 이것과 같으면 -1이 붙는다
// footnote-label은 remark-gfm 각주 머리의 id다(각주 참조의 aria-describedby가 가리킨다)
export const PAGE_RESERVED_IDS = [
  'main-content',
  'post-title',
  'post-body',
  'series-top',
  'series-bottom',
  'footnote-label',
];

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// 제목 글자 (앵커를 더하기 전). 각주 참조 번호(<sup><a data-footnote-ref>1</a></sup>)는 뺀다
function textOf(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') {
    if (node.properties.dataFootnoteRef !== undefined) return '';
    return node.children.map(textOf).join('');
  }
  return '';
}

// 공백을 하나로 합친 제목 글자
export function headingText(heading: Element): string {
  return heading.children.map(textOf).join('').replace(/\s+/g, ' ').trim();
}

function isFootnotesSection(node: Element): boolean {
  return node.tagName === 'section' && node.properties.dataFootnotes !== undefined;
}

function anchor(id: string, text: string): Element {
  return {
    type: 'element',
    tagName: 'a',
    properties: {
      className: ['heading-anchor'],
      href: `#${id}`,
      ariaLabel: text ? `제목 링크: ${text}` : '제목 링크',
    },
    children: [{ type: 'text', value: '#' }],
  };
}

export interface RehypeHeadingsOptions {
  reservedIds?: readonly string[];
}

export default function rehypeHeadings(options: RehypeHeadingsOptions = {}) {
  const reservedIds = options.reservedIds ?? PAGE_RESERVED_IDS;
  return (tree: Root, file: FileWithData) => {
    const slugger = new GithubSlugger();
    for (const id of reservedIds) slugger.slug(id);
    const toc: TocEntry[] = [];

    visit(tree, 'element', (node) => {
      if (isFootnotesSection(node)) return SKIP;
      if (!HEADING_TAGS.has(node.tagName)) return undefined;

      const text = headingText(node);
      // 글자가 없거나 slug가 비는 제목(이미지·이모지·문장 부호만)은 section id를 받는다
      const id = slugger.slug(plainSlug(text) ? text : 'section');
      node.properties = { ...node.properties, id };
      if (node.tagName === 'h2' || node.tagName === 'h3') {
        toc.push({ depth: node.tagName === 'h2' ? 2 : 3, id, text: text || '(제목 없음)' });
      }
      // 줄바꿈 없는 공백(U+00A0)으로 마지막 낱말과 붙인다. 앵커만 다음 줄로 떨어지지 않는다
      node.children.push({ type: 'text', value: '\u00a0' }, anchor(id, text));
      return SKIP;
    });

    file.data.toc = toc;
  };
}
