/**
 * 인용구 탈출 플러그인
 *
 * 빈 인용구 줄에서 Enter를 누르면 인용구에서 나갈 수 있습니다.
 * Backspace로 빈 인용구 줄을 삭제하면 인용구에서 나갑니다.
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

/**
 * 현재 커서가 빈 인용구 줄에 있는지 확인
 */
function isInEmptyBlockquoteParagraph(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { $from } = selection;

  // 현재 노드가 빈 paragraph인지 확인
  const currentNode = $from.parent;
  if (currentNode.type.name !== 'paragraph' || currentNode.content.size > 0) {
    return false;
  }

  // 부모가 blockquote인지 확인
  const depth = $from.depth;
  for (let d = depth - 1; d >= 0; d--) {
    const ancestor = $from.node(d);
    if (ancestor.type.name === 'blockquote') {
      return true;
    }
  }

  return false;
}

/**
 * 인용구 탈출 - 빈 줄에서 Enter 누를 때
 */
function exitBlockquoteOnEnter(view: EditorView): boolean {
  if (!isInEmptyBlockquoteParagraph(view)) {
    return false;
  }

  const { state, dispatch } = view;
  const { selection, schema } = state;
  const { $from } = selection;

  // blockquote 찾기
  let blockquoteDepth = -1;
  for (let d = $from.depth - 1; d >= 0; d--) {
    if ($from.node(d).type.name === 'blockquote') {
      blockquoteDepth = d;
      break;
    }
  }

  if (blockquoteDepth < 0) return false;

  const blockquoteStart = $from.before(blockquoteDepth);
  const blockquoteEnd = $from.after(blockquoteDepth);
  const blockquote = $from.node(blockquoteDepth);

  // 인용구 내 현재 paragraph 위치
  const paragraphStart = $from.before($from.depth);
  const paragraphEnd = $from.after($from.depth);

  const tr = state.tr;

  // 인용구 내 paragraph가 하나뿐이면 전체 인용구를 paragraph로 교체
  if (blockquote.childCount === 1) {
    const newParagraph = schema.nodes.paragraph.create();
    tr.replaceWith(blockquoteStart, blockquoteEnd, newParagraph);
    tr.setSelection(TextSelection.near(tr.doc.resolve(blockquoteStart)));
  } else {
    // 여러 paragraph가 있으면 현재 빈 paragraph를 삭제하고
    // 인용구 밖에 새 paragraph 삽입
    tr.delete(paragraphStart, paragraphEnd);

    // 인용구 다음 위치에 새 paragraph 삽입
    const insertPos = tr.mapping.map(blockquoteEnd);
    const newParagraph = schema.nodes.paragraph.create();
    tr.insert(insertPos, newParagraph);
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
  }

  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Backspace로 빈 인용구 줄 삭제 시 탈출
 */
function exitBlockquoteOnBackspace(view: EditorView): boolean {
  if (!isInEmptyBlockquoteParagraph(view)) {
    return false;
  }

  const { state, dispatch } = view;
  const { selection, schema } = state;
  const { $from } = selection;

  // 커서가 줄 시작에 있어야 함
  if ($from.parentOffset !== 0) {
    return false;
  }

  // blockquote 찾기
  let blockquoteDepth = -1;
  for (let d = $from.depth - 1; d >= 0; d--) {
    if ($from.node(d).type.name === 'blockquote') {
      blockquoteDepth = d;
      break;
    }
  }

  if (blockquoteDepth < 0) return false;

  const blockquoteStart = $from.before(blockquoteDepth);
  const blockquoteEnd = $from.after(blockquoteDepth);
  const blockquote = $from.node(blockquoteDepth);

  const tr = state.tr;

  // 인용구 내 paragraph가 하나뿐이면 전체 인용구를 paragraph로 교체
  if (blockquote.childCount === 1) {
    const newParagraph = schema.nodes.paragraph.create();
    tr.replaceWith(blockquoteStart, blockquoteEnd, newParagraph);
    tr.setSelection(TextSelection.near(tr.doc.resolve(blockquoteStart)));
  } else {
    // 현재 빈 paragraph의 시작/끝 위치
    const paragraphStart = $from.before($from.depth);
    const paragraphEnd = $from.after($from.depth);

    // 현재가 첫 번째 paragraph인지 확인
    const isFirst = paragraphStart === blockquoteStart + 1;

    if (isFirst) {
      // 첫 번째면 삭제 후 인용구 앞에 커서
      tr.delete(paragraphStart, paragraphEnd);
      tr.setSelection(TextSelection.near(tr.doc.resolve(blockquoteStart)));
    } else {
      // 아니면 이전 paragraph 끝으로 이동
      tr.delete(paragraphStart, paragraphEnd);
      const prevPos = tr.mapping.map(paragraphStart - 1);
      tr.setSelection(TextSelection.near(tr.doc.resolve(prevPos)));
    }
  }

  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * 인용구 탈출 플러그인
 */
export const blockquoteEscapePlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('cruz-blockquote-escape'),
    props: {
      handleKeyDown: (view, event) => {
        // Enter 키
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
          return exitBlockquoteOnEnter(view);
        }

        // Backspace 키
        if (event.key === 'Backspace' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
          return exitBlockquoteOnBackspace(view);
        }

        return false;
      },
    },
  });
});

export default blockquoteEscapePlugin;
