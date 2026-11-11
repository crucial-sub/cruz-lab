// 터치 기기의 이미지 선택과 메뉴 단추 (main 병합 준비 작업 문서 6.5)
// - iPhone에서 이미지를 누르면 ProseMirror가 에디터에 포커스를 두고 이미지·메뉴를 감싼 DOM 선택 범위를 만들었다.
//   iOS는 그 범위를 칠하고(caret-color가 투명이어도 회색), 범위 안의 첫 탭을 페이지에 보내지 않았다.
//   그래서 이미지를 누르면 선택 표시가 보였고, 메뉴 단추는 두 번 눌러야 됐다.
// - 터치로 이미지를 누르면 ProseMirror에 넘기지 않고 이 파일의 함수로 노드 선택만 둔다. 에디터 포커스가 없고
//   DOM 선택이 비어 있으면 ProseMirror는 DOM 범위를 만들지 않는다(editorOwnsSelection이 거짓).
//   노드 뷰의 selected는 상태의 노드 선택을 따르므로 메뉴는 뜬다.
// - 메뉴 단추는 mousedown 기본 동작을 막아 포커스를 옮기지 않는다(iOS는 단추를 누르면 편집 루트에 포커스를 줬다).
//   그래서 입력 칸의 blur가 단추보다 먼저 오지 않는다. commitFocusedInputIn이 단추 처리 전에 입력 칸을 반영한다.
// - DOM·ProseMirror 뷰를 최소 모양으로 받는다(단위 테스트는 node 환경이다).

import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';

// selectNodeWithoutFocus가 쓰는 에디터 뷰의 부분
export interface FocusableView {
  dom: { contains(node: unknown): boolean; blur(): void };
  state: EditorState;
  dispatch(tr: Transaction): void;
}

// 문서 쪽 값(테스트가 바꿔 넣는다)
export interface FocusEnvironment {
  activeElement: unknown;
  selection: { removeAllRanges(): void } | null;
}

// pos의 노드를 노드 선택으로 둔다. 에디터 포커스를 먼저 풀고 DOM 선택을 비운다
// - 순서: blur → DOM 선택 비우기 → 노드 선택. 포커스가 남은 채 노드 선택을 두면 ProseMirror가 DOM 범위를 다시 만든다.
// - pos에 노드가 없거나 고를 수 없는 노드면 아무것도 하지 않고 false다.
export function selectNodeWithoutFocus(view: FocusableView, pos: number, env: FocusEnvironment): boolean {
  const { doc } = view.state;
  const node = pos >= 0 && pos < doc.content.size ? doc.nodeAt(pos) : null;
  if (!node || !NodeSelection.isSelectable(node)) return false;
  if (env.activeElement && view.dom.contains(env.activeElement)) view.dom.blur();
  env.selection?.removeAllRanges();
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  return true;
}

// 메뉴 안의 입력 칸에 포커스가 있으면 blur해서 값을 반영한다(입력 칸의 onBlur가 반영한다)
// - markMenu: blur 전에 "메뉴 안으로 옮김" 표시를 켠다. 그래야 반영이 이미지 선택을 지킨다(메뉴가 닫히지 않는다).
// - 반영했으면 true다. 메뉴 밖이거나 입력 칸이 아니면 false다.
export function commitFocusedInputIn(
  menu: { contains(node: unknown): boolean } | null,
  active: unknown,
  markMenu: () => void,
): boolean {
  if (!menu || !active || !menu.contains(active)) return false;
  const element = active as { tagName?: unknown; blur?: unknown };
  if (element.tagName !== 'INPUT' || typeof element.blur !== 'function') return false;
  markMenu();
  (element as { blur(): void }).blur();
  return true;
}
