// 콜아웃 노드 (재건 3단계 D10)
// - 속성 type: note | tip | warning. 마크다운은 `> [!type]` 첫 줄 + 인용 본문(remark-callout.ts와 같은 규칙).
// - DOM: <div class="callout" data-callout="type">. 미리보기(공유 파이프라인)와 같은 클래스를 쓴다.

import { mergeAttributes, Node } from '@tiptap/core';
import { isCalloutType, type CalloutType } from '../../lib/content/remark-callout.ts';

export interface CalloutOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      // 선택 범위를 콜아웃으로 감싼다. 이미 콜아웃이면 종류만 바꾼다
      setCallout: (type: CalloutType) => ReturnType;
      // 콜아웃을 풀어 본문만 남긴다
      unsetCallout: () => ReturnType;
    };
  }
}

export const Callout = Node.create<CalloutOptions>({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      type: {
        default: 'note' as CalloutType,
        parseHTML: (element) => {
          const value = element.getAttribute('data-callout') ?? '';
          return isCalloutType(value) ? value : 'note';
        },
        renderHTML: (attributes) => ({ 'data-callout': attributes.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'callout' }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (type) =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name)) return commands.updateAttributes(this.name, { type });
          return commands.wrapIn(this.name, { type });
        },
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
