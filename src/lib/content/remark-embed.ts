// 임베드 (재건 3단계 D3·D10)
// - 문법: 지원 주소 하나만 있는 단락. 자동 링크(<url>)와 날 주소(remark-gfm)를 모두 받는다.
//   링크 글자가 주소와 다르거나 다른 글자가 함께 있으면 임베드가 아니다(링크 그대로).
// - embedOfParagraph: 변환기(to-doc)와 플러그인이 같이 쓴다.
// - remarkEmbed: 미리보기용 remark 플러그인. 단락을 iframe 상자로 그린다. 허용 호스트는 detectEmbed가 정한다.

import type { Paragraph, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import {
  detectEmbed,
  EMBED_IFRAME_REFERRER_POLICY,
  EMBED_IFRAME_SANDBOX,
  type EmbedInfo,
} from './embed-url.ts';

const BARE_URL_PATTERN = /^https?:\/\/\S+$/;

// 단락이 주소 하나만 담고 있으면 그 주소를 돌려준다. 아니면 null
export function embedUrlOfParagraph(node: Paragraph): string | null {
  const children = node.children.filter(
    (child) => !(child.type === 'text' && child.value.trim() === ''),
  );
  if (children.length !== 1) return null;
  const only = children[0];

  if (only.type === 'link') {
    if (only.title) return null;
    const label = only.children[0];
    if (only.children.length !== 1 || !label || label.type !== 'text') return null;
    return label.value.trim() === only.url.trim() ? only.url.trim() : null;
  }
  if (only.type === 'text') {
    const value = only.value.trim();
    return BARE_URL_PATTERN.test(value) ? value : null;
  }
  return null;
}

// 단락이 지원 임베드 주소 하나만 담고 있으면 임베드 정보를 돌려준다
export function embedOfParagraph(node: Paragraph): EmbedInfo | null {
  const url = embedUrlOfParagraph(node);
  return url ? detectEmbed(url) : null;
}

// remark 플러그인: 임베드 단락을 <div class="embed embed-<provider>"><iframe …></div>로 그린다
export default function remarkEmbed() {
  return (tree: Root) => {
    visit(tree, 'paragraph', (node: Paragraph) => {
      const embed = embedOfParagraph(node);
      if (!embed) return;
      node.data = {
        ...node.data,
        hName: 'div',
        hProperties: { className: ['embed', `embed-${embed.provider}`] },
        hChildren: [
          {
            type: 'element',
            tagName: 'iframe',
            properties: {
              src: embed.embedUrl,
              title: `${embed.provider} 임베드`,
              loading: 'lazy',
              sandbox: EMBED_IFRAME_SANDBOX.split(' '),
              referrerPolicy: EMBED_IFRAME_REFERRER_POLICY,
              allowFullScreen: true,
            },
            children: [],
          },
        ],
      };
    });
  };
}
