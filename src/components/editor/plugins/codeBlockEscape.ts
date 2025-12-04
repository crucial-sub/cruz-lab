/**
 * 코드블록 탈출 및 삭제 플러그인
 *
 * 다른 에디터와 유사한 코드블록 탈출 방식을 제공합니다:
 * - Backspace: 빈 코드블록에서 누르면 코드블록 삭제
 * - ArrowDown: 코드블록 마지막 줄 끝에서 누르면 아래로 탈출
 * - ArrowUp: 코드블록 첫 줄 처음에서 누르면 위로 탈출
 * - Enter 두 번: 빈 줄에서 Enter 누르면 코드블록 탈출 (마지막 줄일 때)
 * - Cmd/Ctrl+Enter: 코드블록 어디서든 아래로 탈출
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

/**
 * 현재 커서가 코드블록 내부에 있는지 확인하고 코드블록 정보 반환
 */
function getCodeBlockInfo(view: EditorView): {
  inCodeBlock: boolean;
  codeBlockPos?: number;
  codeBlockNode?: ReturnType<typeof view.state.doc.nodeAt>;
  textContent?: string;
  cursorOffset?: number;
} {
  const { state } = view;
  const { selection } = state;
  const { $from } = selection;

  // 조상 노드 중 code_block 찾기
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'code_block') {
      const pos = $from.before(d);
      const textContent = node.textContent;
      // 코드블록 시작 위치에서 커서까지의 오프셋 계산
      const cursorOffset = $from.pos - pos - 1; // -1은 코드블록 노드 자체
      return {
        inCodeBlock: true,
        codeBlockPos: pos,
        codeBlockNode: node,
        textContent,
        cursorOffset,
      };
    }
  }

  return { inCodeBlock: false };
}

/**
 * 코드블록이 비어있거나 공백만 있는지 확인
 */
function isCodeBlockEmpty(textContent: string): boolean {
  return textContent.trim() === '';
}

/**
 * 커서가 코드블록의 마지막 줄 끝에 있는지 확인
 */
function isAtEndOfCodeBlock(textContent: string, cursorOffset: number): boolean {
  return cursorOffset >= textContent.length;
}

/**
 * 커서가 코드블록의 첫 줄 처음에 있는지 확인
 */
function isAtStartOfCodeBlock(cursorOffset: number): boolean {
  return cursorOffset <= 0;
}

/**
 * 커서가 마지막 줄의 빈 줄에 있는지 확인 (Enter 두 번 탈출용)
 */
function isOnEmptyLastLine(textContent: string, cursorOffset: number): boolean {
  // 마지막 줄이 빈 줄인지 확인
  const lines = textContent.split('\n');
  if (lines.length < 2) return false;

  const lastLine = lines[lines.length - 1];
  if (lastLine.trim() !== '') return false;

  // 커서가 마지막 줄에 있는지 확인
  const contentBeforeCursor = textContent.slice(0, cursorOffset);
  const linesBeforeCursor = contentBeforeCursor.split('\n');

  return linesBeforeCursor.length === lines.length;
}

/**
 * 코드블록 삭제 (paragraph로 교체)
 */
function deleteCodeBlock(view: EditorView, codeBlockPos: number): boolean {
  const { state, dispatch } = view;
  const { schema } = state;

  // 코드블록을 paragraph로 교체
  const tr = state.tr;
  const codeBlock = state.doc.nodeAt(codeBlockPos);
  if (!codeBlock) return false;

  const codeBlockEnd = codeBlockPos + codeBlock.nodeSize;
  const newParagraph = schema.nodes.paragraph.create();

  tr.replaceWith(codeBlockPos, codeBlockEnd, newParagraph);
  tr.setSelection(TextSelection.near(tr.doc.resolve(codeBlockPos)));

  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * 코드블록 아래로 탈출
 */
function exitCodeBlockDown(view: EditorView, codeBlockPos: number): boolean {
  const { state, dispatch } = view;
  const { schema } = state;

  const codeBlock = state.doc.nodeAt(codeBlockPos);
  if (!codeBlock) return false;

  const codeBlockEnd = codeBlockPos + codeBlock.nodeSize;
  const tr = state.tr;

  // 코드블록 다음에 노드가 없으면 paragraph 생성
  const $pos = state.doc.resolve(codeBlockEnd);
  if ($pos.parent.type.name === 'doc' && $pos.nodeAfter === null) {
    const newParagraph = schema.nodes.paragraph.create();
    tr.insert(codeBlockEnd, newParagraph);
  }

  // 코드블록 다음 위치로 커서 이동
  const nextPos = tr.mapping.map(codeBlockEnd);
  tr.setSelection(TextSelection.near(tr.doc.resolve(nextPos)));

  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * 코드블록 위로 탈출
 */
function exitCodeBlockUp(view: EditorView, codeBlockPos: number): boolean {
  const { state, dispatch } = view;
  const { schema } = state;

  const tr = state.tr;

  // 코드블록 이전에 노드가 없으면 paragraph 생성
  if (codeBlockPos === 0) {
    const newParagraph = schema.nodes.paragraph.create();
    tr.insert(0, newParagraph);
    tr.setSelection(TextSelection.near(tr.doc.resolve(1)));
  } else {
    // 코드블록 이전 위치로 커서 이동
    tr.setSelection(TextSelection.near(tr.doc.resolve(codeBlockPos - 1)));
  }

  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Enter 두 번으로 코드블록 탈출 (마지막 빈 줄 삭제 후 탈출)
 */
function exitCodeBlockOnDoubleEnter(
  view: EditorView,
  codeBlockPos: number,
  textContent: string
): boolean {
  const { state, dispatch } = view;
  const { schema } = state;

  const codeBlock = state.doc.nodeAt(codeBlockPos);
  if (!codeBlock) return false;

  const codeBlockEnd = codeBlockPos + codeBlock.nodeSize;
  const tr = state.tr;

  // 마지막 빈 줄 제거한 내용으로 코드블록 업데이트
  const lines = textContent.split('\n');
  lines.pop(); // 마지막 빈 줄 제거
  const newContent = lines.join('\n');

  // 코드블록 내용 업데이트
  const newCodeBlock = schema.nodes.code_block.create(
    codeBlock.attrs,
    newContent ? schema.text(newContent) : null
  );

  tr.replaceWith(codeBlockPos, codeBlockEnd, newCodeBlock);

  // 코드블록 다음에 paragraph 삽입
  const newCodeBlockEnd = codeBlockPos + newCodeBlock.nodeSize;
  const newParagraph = schema.nodes.paragraph.create();
  tr.insert(newCodeBlockEnd, newParagraph);

  // 새 paragraph로 커서 이동
  tr.setSelection(TextSelection.near(tr.doc.resolve(newCodeBlockEnd + 1)));

  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * 코드블록 탈출 및 삭제 플러그인
 */
export const codeBlockEscapePlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('cruz-codeblock-escape'),
    props: {
      handleKeyDown: (view, event) => {
        const info = getCodeBlockInfo(view);
        if (!info.inCodeBlock || info.codeBlockPos === undefined) {
          return false;
        }

        const { codeBlockPos, textContent = '', cursorOffset = 0 } = info;

        // Backspace: 빈 코드블록 삭제
        if (
          event.key === 'Backspace' &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          if (isCodeBlockEmpty(textContent)) {
            return deleteCodeBlock(view, codeBlockPos);
          }
          return false;
        }

        // Cmd/Ctrl+Enter: 어디서든 아래로 탈출
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
          return exitCodeBlockDown(view, codeBlockPos);
        }

        // Enter: 마지막 빈 줄에서 탈출 (Enter 두 번 효과)
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          if (isOnEmptyLastLine(textContent, cursorOffset)) {
            return exitCodeBlockOnDoubleEnter(view, codeBlockPos, textContent);
          }
          return false;
        }

        // ArrowDown: 마지막 줄 끝에서 아래로 탈출
        if (
          event.key === 'ArrowDown' &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          if (isAtEndOfCodeBlock(textContent, cursorOffset)) {
            return exitCodeBlockDown(view, codeBlockPos);
          }
          return false;
        }

        // ArrowUp: 첫 줄 처음에서 위로 탈출
        if (
          event.key === 'ArrowUp' &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          if (isAtStartOfCodeBlock(cursorOffset)) {
            return exitCodeBlockUp(view, codeBlockPos);
          }
          return false;
        }

        return false;
      },
    },
  });
});

export default codeBlockEscapePlugin;
