// 임베드 노드 (재건 3단계 D3·D10)
// - 속성 provider·url. atom 블록이다. 마크다운은 지원 주소 한 줄(remark-embed.ts와 같은 규칙).
// - 주소 판정은 lib/content/embed-url.ts의 detectEmbed 하나다. 허용 호스트 밖은 노드를 만들지 않는다.
// - 노드 뷰(React iframe)는 ui/EmbedNodeView.tsx, 붙여넣기·Enter 규칙은 extensions/input-rules.ts다. 여기는 스키마와 renderHTML(복사·getHTML용)이다.

import { mergeAttributes, Node } from '@tiptap/core';
import {
  detectEmbed,
  EMBED_IFRAME_REFERRER_POLICY,
  EMBED_IFRAME_SANDBOX,
  type EmbedProvider,
} from '../../lib/content/embed-url.ts';

export interface EmbedAttributes {
  provider: EmbedProvider;
  url: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      // 지원 주소면 임베드 노드를 넣는다. 아니면 false
      setEmbed: (url: string) => ReturnType;
    };
  }
}

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: { default: 'youtube' as EmbedProvider },
      url: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-embed-url]',
        getAttrs: (element) => {
          const url = element.getAttribute('data-embed-url') ?? '';
          const info = detectEmbed(url);
          return info ? { provider: info.provider, url: info.url } : false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as EmbedAttributes;
    const info = detectEmbed(attrs.url);
    const wrapper = mergeAttributes(HTMLAttributes, {
      'data-embed-url': attrs.url,
      class: `embed embed-${attrs.provider}`,
    });
    // 판정에 실패한 주소(JSON이 바뀐 경우)는 링크가 아니라 글자다(작업 문서 5절 22)
    if (!info) return ['div', wrapper, ['span', {}, attrs.url]];
    return [
      'div',
      wrapper,
      [
        'iframe',
        {
          src: info.embedUrl,
          title: `${info.provider} 임베드`,
          loading: 'lazy',
          sandbox: EMBED_IFRAME_SANDBOX,
          referrerpolicy: EMBED_IFRAME_REFERRER_POLICY,
          allowfullscreen: 'true',
        },
      ],
    ];
  },

  addCommands() {
    return {
      setEmbed:
        (url) =>
        ({ commands }) => {
          const info = detectEmbed(url);
          if (!info) return false;
          return commands.insertContent({
            type: this.name,
            attrs: { provider: info.provider, url: info.url },
          });
        },
    };
  },
});
