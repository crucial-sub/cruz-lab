// 더한 입력 규칙과 임베드 붙여넣기 (재건 3단계 T5, 부록 B, D3)
// - StarterKit·목록·수식 확장의 기본 규칙(## , > , - , 1. , ```, ---, [ ] , $$x$$, $$$x$$$)은 그대로 쓴다.
// - 여기서 더하는 것:
//   1. 인용 첫 줄의 `[!note] `(tip, warning) → 그 인용을 콜아웃으로 바꾼다(`> [!note] `를 치는 흐름).
//   2. 글머리 항목 첫머리의 `[ ] `·`[x] ` → 그 항목만 체크 목록(`- [ ] `를 치는 흐름. 기본 규칙은 글머리 항목 안에서 돌지 않는다).
//   3. 빈 단락의 `$$` 다음 공백·Enter → 글자를 지우고 수식 입력 창을 연다(onMathBlockRequest).
//   4. 빈 단락에 지원 임베드 주소 하나를 붙여넣으면 임베드 노드로 바꾼다. 다른 주소는 링크 붙여넣기에 맡긴다.
//   5. 지원 주소만 있는 단락 끝에서 Enter → 임베드 노드 + 새 단락.
// - DOM 없이 돈다(헤드리스 테스트). 입력 규칙의 트리거는 ASCII와 공백뿐이다(위험 표 "한글 IME").

import { Extension, InputRule } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { detectEmbed, type EmbedInfo } from '../../lib/content/embed-url.ts';
import { isCalloutType } from '../../lib/content/remark-callout.ts';

export interface EditorInputRulesOptions {
  // 빈 단락에서 `$$`를 치면 부른다. 없으면 규칙이 돌지 않는다(글자 그대로)
  onMathBlockRequest: (() => void) | null;
}

const BARE_URL_PATTERN = /^https?:\/\/\S+$/;

// 단락(글자 블록)이 지원 임베드 주소 하나만 담고 있으면 그 정보. remark-embed의 embedUrlOfParagraph와 같은 규칙:
// 글자 노드만 있고, 링크 말고 다른 마크가 없고, 링크가 있으면 주소가 글자와 같아야 한다
export function embedOfTextblock(node: PmNode): EmbedInfo | null {
  if (node.type.name !== 'paragraph' || node.childCount === 0) return null;
  let onlyPlainOrLink = true;
  const hrefs = new Set<string>();
  node.forEach((child) => {
    if (!child.isText) {
      onlyPlainOrLink = false;
      return;
    }
    for (const mark of child.marks) {
      if (mark.type.name === 'link') hrefs.add(String(mark.attrs.href ?? '').trim());
      else onlyPlainOrLink = false;
    }
  });
  if (!onlyPlainOrLink) return null;
  const text = node.textContent.trim();
  if (!BARE_URL_PATTERN.test(text)) return null;
  if (hrefs.size > 1 || (hrefs.size === 1 && !hrefs.has(text))) return null;
  return detectEmbed(text);
}

// 위치 pos의 블록(단락)을 임베드 노드로 바꾸고 커서를 다음 글자 블록에 둔다(없으면 새 단락을 만든다)
function replaceWithEmbed(
  state: EditorState,
  tr: Transaction,
  blockPos: number,
  block: PmNode,
  info: EmbedInfo,
): Transaction | null {
  const embedType = state.schema.nodes.embed;
  const paragraphType = state.schema.nodes.paragraph;
  if (!embedType || !paragraphType) return null;
  const $pos = tr.doc.resolve(blockPos);
  const parent = $pos.parent;
  const index = $pos.index();
  if (!parent.canReplaceWith(index, index + 1, embedType)) return null;

  const embed = embedType.create({ provider: info.provider, url: info.url });
  tr.replaceWith(blockPos, blockPos + block.nodeSize, embed);
  const after = blockPos + embed.nodeSize;
  const next = tr.doc.resolve(after).nodeAfter;
  if (!next || !next.isTextblock) tr.insert(after, paragraphType.create());
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  return tr.scrollIntoView();
}

// 붙여넣은 글자가 지원 주소 하나이고 커서가 빈 단락에 있으면, 그 단락을 임베드로 바꾸는 트랜잭션
export function embedPasteTransaction(state: EditorState, text: string): Transaction | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const info = detectEmbed(trimmed);
  if (!info) return null;
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size > 0) return null;
  return replaceWithEmbed(state, state.tr, $from.before(), $from.parent, info);
}

// Enter: 커서가 지원 주소만 있는 단락의 끝에 있으면 임베드로 바꾼다
function embedEnterTransaction(state: EditorState): Transaction | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.parentOffset !== $from.parent.content.size) return null;
  const info = embedOfTextblock($from.parent);
  if (!info) return null;
  return replaceWithEmbed(state, state.tr, $from.before(), $from.parent, info);
}

// 입력 규칙의 범위가 단락 처음부터인지
function startsAtParagraph(state: EditorState, from: number): boolean {
  const $from = state.doc.resolve(from);
  return $from.parent.type.name === 'paragraph' && from === $from.start();
}

export const EditorInputRules = Extension.create<EditorInputRulesOptions>({
  name: 'editorInputRules',
  // 목록·기본 키맵의 Enter보다 먼저 임베드 Enter를 본다
  priority: 1000,

  addOptions() {
    return { onMathBlockRequest: null };
  },

  addInputRules() {
    const calloutRule = new InputRule({
      find: /^\[!([a-z]+)\]\s$/,
      handler: ({ state, range, match }) => {
        const type = match[1];
        if (!isCalloutType(type) || !startsAtParagraph(state, range.from)) return null;
        const $from = state.doc.resolve(range.from);
        // 인용의 첫 단락일 때만 바꾼다
        if ($from.depth < 2 || $from.node(-1).type.name !== 'blockquote' || $from.index(-1) !== 0) {
          return null;
        }
        const calloutType = state.schema.nodes.callout;
        if (!calloutType) return null;
        const { tr } = state;
        tr.delete(range.from, range.to);
        tr.setNodeMarkup($from.before(-1), calloutType, { type });
      },
    });

    const taskInBulletRule = new InputRule({
      find: /^\[( |x)\]\s$/,
      handler: ({ state, range, match, chain }) => {
        if (!startsAtParagraph(state, range.from)) return null;
        const $from = state.doc.resolve(range.from);
        if (
          $from.depth < 3 ||
          $from.node(-1).type.name !== 'listItem' ||
          $from.index(-1) !== 0 ||
          $from.node(-2).type.name !== 'bulletList'
        ) {
          return null;
        }
        const checked = match[1] === 'x';
        // 이 항목만 목록에서 떼어 낸 뒤 체크 목록으로 감싼다. 다른 항목은 글머리 그대로다(리뷰 6.3 중요 2).
        // 떼어 낸 뒤 앞뒤 목록은 마크다운에서 다른 글머리 문자로 쓰여 다시 열어도 둘로 남는다.
        // 떼어 내기를 먼저 한다. prosemirror의 liftOutOfList는 tr.mapping으로 위치를 검사해, 앞선 단계가 있으면 실패한다
        if (!chain().liftListItem('listItem').run()) return null;
        const { tr } = state;
        tr.delete(tr.mapping.map(range.from), tr.mapping.map(range.to));
        chain().toggleTaskList().updateAttributes('taskItem', { checked }).run();
      },
    });

    const mathBlockRule = new InputRule({
      find: /^\$\$\s$/,
      handler: ({ state, range }) => {
        const request = this.options.onMathBlockRequest;
        if (!request || !startsAtParagraph(state, range.from)) return null;
        const $from = state.doc.resolve(range.from);
        // 표 셀 안에는 수식 블록이 들어갈 수 없다(리뷰 6.3 중요 3)
        if ($from.depth >= 2 && /^table(Cell|Header)$/.test($from.node(-1).type.name)) return null;
        // 단락 전체가 `$$`일 때만(글 중간의 $$는 건드리지 않는다).
        // 글자 입력 경로에서는 규칙의 문서에 친 공백이 이미 들어 있고, Enter 경로에서는 없다(Tiptap 3.33 applyRule)
        if ($from.parent.textContent.trim() !== '$$') return null;
        state.tr.delete(range.from, range.to);
        // 문서가 바뀐 뒤 입력 창을 연다
        setTimeout(request, 0);
      },
    });

    return [calloutRule, taskInBulletRule, mathBlockRule];
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const tr = embedEnterTransaction(editor.state);
        if (!tr) return false;
        editor.view.dispatch(tr);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('embedPaste'),
        props: {
          handlePaste: (view, event) => {
            // 파일이 있으면 이미지 업로드가 맡는다
            if (event.clipboardData?.files.length) return false;
            const text = event.clipboardData?.getData('text/plain') ?? '';
            const tr = embedPasteTransaction(view.state, text);
            if (!tr) return false;
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});
