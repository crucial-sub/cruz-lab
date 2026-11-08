// 콜아웃 (재건 3단계 D10)
// - 문법: 인용의 첫 단락이 `[!note]`, `[!tip]`, `[!warning]` 한 줄로 시작한다(GitHub 알림 문법). 대소문자를 가리지 않는다.
// - detectCallout: 인용 노드에서 종류와, 표시 줄을 뺀 자식을 돌려준다. 입력을 바꾸지 않는다. 변환기와 플러그인이 같이 쓴다.
// - remarkCallout: 미리보기용 remark 플러그인. 인용을 div.callout으로 그린다.
// - Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙이고 '@/' 별칭을 쓰지 않는다.

import type {
  Blockquote,
  BlockContent,
  DefinitionContent,
  Paragraph,
  PhrasingContent,
  Root,
} from 'mdast';
import { visit } from 'unist-util-visit';

export const CALLOUT_TYPES = ['note', 'tip', 'warning'] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

// 첫 줄: [!type] 뒤에 공백만 있고 줄이 끝난다
const MARKER_PATTERN = /^\[!([a-z]+)\][ \t]*(?:\n|$)/i;

export function isCalloutType(value: string): value is CalloutType {
  return (CALLOUT_TYPES as readonly string[]).includes(value);
}

export interface DetectedCallout {
  type: CalloutType;
  // 표시 줄을 뺀 인용 본문
  children: Array<BlockContent | DefinitionContent>;
}

// 인용이 콜아웃이면 종류와 본문을 돌려준다. 아니면 null
export function detectCallout(node: Blockquote): DetectedCallout | null {
  const firstBlock = node.children[0];
  if (!firstBlock || firstBlock.type !== 'paragraph') return null;
  const firstInline = firstBlock.children[0];
  if (!firstInline || firstInline.type !== 'text') return null;

  const match = MARKER_PATTERN.exec(firstInline.value);
  if (!match) return null;
  const type = match[1].toLowerCase();
  if (!isCalloutType(type)) return null;

  const rest = firstInline.value.slice(match[0].length);
  const inlines: PhrasingContent[] = rest
    ? [{ ...firstInline, value: rest }, ...firstBlock.children.slice(1)]
    : firstBlock.children.slice(1);
  const firstParagraph: Paragraph = { ...firstBlock, children: inlines };
  const children =
    inlines.length > 0 ? [firstParagraph, ...node.children.slice(1)] : node.children.slice(1);
  return { type, children };
}

// remark 플러그인: 콜아웃 인용을 <div class="callout callout-<type>" data-callout="<type>">로 그린다
export default function remarkCallout() {
  return (tree: Root) => {
    visit(tree, 'blockquote', (node: Blockquote) => {
      const callout = detectCallout(node);
      if (!callout) return;
      node.children = callout.children;
      node.data = {
        ...node.data,
        hName: 'div',
        hProperties: {
          className: ['callout', `callout-${callout.type}`],
          dataCallout: callout.type,
        },
      };
    });
  };
}
