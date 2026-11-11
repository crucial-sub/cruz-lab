// 블록 한 칸 옮기기 (재건 5단계 D6)
// - 커서가 있는 블록(단락·제목·목록 항목·코드·표·이미지 단락·인용·콜아웃·구분선·수식·임베드)을 같은 부모 안에서
//   한 칸 위·아래로 옮긴다. 형제와 자리를 바꾸는 트랜잭션 하나다(되돌리기 한 번에 한 칸).
// - 옮길 블록: 목록 항목 안이면 그 항목. 아니면 문서·인용·콜아웃의 바로 아래 블록. 표 안이면 표 전체.
//   블록이 부모의 처음(위로)·끝(아래로)이라 못 옮기면 그 블록을 감싼 블록(인용·콜아웃·목록·항목)을 옮긴다.
// - 선택은 블록과 함께 옮긴다(블록 안의 같은 자리).
// - DOM 없이 돈다(상태만 읽는다). 되돌리기 묶음은 부르는 쪽이 closeHistory로 나눈다.

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Fragment } from '@tiptap/pm/model';
import {
  NodeSelection,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';

export type MoveDirection = 'up' | 'down';

// 자식 블록을 하나씩 옮길 수 있는 부모
const CONTAINER_TYPES = new Set(['doc', 'blockquote', 'callout']);
// 목록 항목(항목 단위로 옮긴다)
const ITEM_TYPES = new Set(['listItem', 'taskItem']);

interface Target {
  // 옮길 블록의 시작 위치
  pos: number;
  node: ProseMirrorNode;
  parent: ProseMirrorNode;
  index: number;
}

// 선택 기준으로 옮길 수 있는 블록 후보를 안쪽부터 바깥쪽 순서로 모은다
function candidates(state: EditorState): Target[] {
  const { selection } = state;
  const $from = selection.$from;
  const result: Target[] = [];

  // 블록 노드를 통째로 고른 경우(구분선·수식 블록·임베드·표 등)
  if (selection instanceof NodeSelection && selection.node.isBlock) {
    const parent = $from.parent;
    if (CONTAINER_TYPES.has(parent.type.name) || ITEM_TYPES.has(selection.node.type.name)) {
      result.push({ pos: selection.from, node: selection.node, parent, index: $from.index() });
    }
  }

  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const node = $from.node(depth);
    const parent = $from.node(depth - 1);
    if (ITEM_TYPES.has(node.type.name) || CONTAINER_TYPES.has(parent.type.name)) {
      result.push({ pos: $from.before(depth), node, parent, index: $from.index(depth - 1) });
    }
  }
  return result;
}

// 옮긴 뒤의 선택: 블록 안의 같은 자리
// - 글자 선택·노드 선택만 그대로 옮긴다. 그 밖(표 칸 여러 개를 고른 CellSelection)은 옮긴 블록 처음의 글자 자리로 둔다(리뷰 S7)
function mappedSelection(
  tr: Transaction,
  state: EditorState,
  oldStart: number,
  newStart: number,
  size: number,
) {
  const { selection } = state;
  const inside = (pos: number) => pos >= oldStart && pos <= oldStart + size;
  const shift = (pos: number) => pos - oldStart + newStart;
  if (selection instanceof NodeSelection && inside(selection.from)) {
    return NodeSelection.create(tr.doc, shift(selection.from));
  }
  if (!(selection instanceof TextSelection)) return Selection.near(tr.doc.resolve(newStart + 1));
  if (inside(selection.anchor) && inside(selection.head)) {
    return TextSelection.create(tr.doc, shift(selection.anchor), shift(selection.head));
  }
  return null;
}

// 블록을 한 칸 옮기는 트랜잭션. 옮길 것이 없으면 null
export function moveBlockTransaction(
  state: EditorState,
  direction: MoveDirection,
): Transaction | null {
  for (const target of candidates(state)) {
    const { pos, node, parent, index } = target;
    const siblingIndex = direction === 'up' ? index - 1 : index + 1;
    if (siblingIndex < 0 || siblingIndex >= parent.childCount) continue;
    const sibling = parent.child(siblingIndex);
    const tr = state.tr;
    let newStart: number;
    if (direction === 'up') {
      const from = pos - sibling.nodeSize;
      tr.replaceWith(from, pos + node.nodeSize, Fragment.fromArray([node, sibling]));
      newStart = from;
    } else {
      const to = pos + node.nodeSize + sibling.nodeSize;
      tr.replaceWith(pos, to, Fragment.fromArray([sibling, node]));
      newStart = pos + sibling.nodeSize;
    }
    const selection = mappedSelection(tr, state, pos, newStart, node.nodeSize);
    if (selection) tr.setSelection(selection);
    return tr.scrollIntoView();
  }
  return null;
}
