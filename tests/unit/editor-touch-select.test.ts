// 터치 기기의 이미지 선택과 메뉴 단추 (main 병합 준비 작업 문서 6.5)
// - iPhone에서 이미지를 누르면 에디터가 포커스를 잡고 이미지·메뉴를 감싼 DOM 선택 범위를 만들었다.
//   iOS는 그 범위를 회색(전에는 초록)으로 칠하고, 범위 안의 첫 탭을 페이지에 보내지 않았다(메뉴 단추가 두 번 눌러야 됐다).
// - selectNodeWithoutFocus: 포커스를 풀고 DOM 선택을 비운 뒤 노드 선택만 둔다. 순서가 중요하다(포커스가 남은 채
//   노드 선택을 두면 ProseMirror가 DOM 범위를 다시 만든다).
// - commitFocusedInputIn: 메뉴 단추가 포커스를 옮기지 않게 바꿨으므로, 입력 중인 칸은 단추 처리 전에 직접 반영한다.
import { getSchema, type JSONContent } from '@tiptap/core';
import { EditorState, NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '@/editor/extensions';
import { commitFocusedInputIn, selectNodeWithoutFocus } from '@/editor/ui/touch-select';

const schema = getSchema(createEditorExtensions());
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });

function stateWithImage() {
  const node = schema.nodeFromJSON(
    doc(p({ type: 'text', text: '앞' }, { type: 'image', attrs: { src: 'https://e.com/a.png' } })),
  );
  let imagePos = -1;
  node.descendants((child, pos) => {
    if (child.type.name === 'image') imagePos = pos;
  });
  const state = EditorState.create({ schema, doc: node, selection: TextSelection.create(node, 1) });
  return { state, imagePos };
}

describe('selectNodeWithoutFocus', () => {
  it('에디터에 포커스가 있으면 먼저 풀고, DOM 선택을 비우고, 노드 선택을 둔다', () => {
    const { state, imagePos } = stateWithImage();
    const calls: string[] = [];
    const active = { id: 'editor-child' };
    let dispatched: Transaction | null = null;
    const view = {
      dom: {
        contains: (node: unknown) => node === active,
        blur: () => calls.push('blur'),
      },
      state,
      dispatch: (tr: Transaction) => {
        calls.push('dispatch');
        dispatched = tr;
      },
    };
    const selection = { removeAllRanges: () => calls.push('removeAllRanges') };
    expect(selectNodeWithoutFocus(view, imagePos, { activeElement: active, selection })).toBe(true);
    expect(calls).toEqual(['blur', 'removeAllRanges', 'dispatch']);
    const next = state.apply(dispatched as unknown as Transaction);
    expect(next.selection).toBeInstanceOf(NodeSelection);
    expect(next.selection.from).toBe(imagePos);
  });

  it('포커스가 에디터 밖이면 blur하지 않는다', () => {
    const { state, imagePos } = stateWithImage();
    const calls: string[] = [];
    const view = {
      dom: { contains: () => false, blur: () => calls.push('blur') },
      state,
      dispatch: () => calls.push('dispatch'),
    };
    const selection = { removeAllRanges: () => calls.push('removeAllRanges') };
    selectNodeWithoutFocus(view, imagePos, { activeElement: { id: 'body' }, selection });
    expect(calls).toEqual(['removeAllRanges', 'dispatch']);
  });

  it('그 자리가 노드가 아니면 아무것도 하지 않는다', () => {
    const { state } = stateWithImage();
    const calls: string[] = [];
    const view = {
      dom: { contains: () => true, blur: () => calls.push('blur') },
      state,
      dispatch: () => calls.push('dispatch'),
    };
    expect(
      selectNodeWithoutFocus(view, state.doc.content.size + 3, {
        activeElement: null,
        selection: { removeAllRanges: () => calls.push('removeAllRanges') },
      }),
    ).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('commitFocusedInputIn', () => {
  it('메뉴 안의 입력 칸에 포커스가 있으면 메뉴 표시를 켜고 blur한다(blur가 값을 반영한다)', () => {
    const calls: string[] = [];
    const input = { tagName: 'INPUT', blur: () => calls.push('blur') };
    const menu = { contains: (node: unknown) => node === input };
    expect(commitFocusedInputIn(menu, input, () => calls.push('mark'))).toBe(true);
    expect(calls).toEqual(['mark', 'blur']);
  });

  it('메뉴 밖이거나 입력 칸이 아니면 아무것도 하지 않는다', () => {
    const calls: string[] = [];
    const outside = { tagName: 'INPUT', blur: () => calls.push('blur') };
    const button = { tagName: 'BUTTON', blur: () => calls.push('blur') };
    const menu = { contains: (node: unknown) => node === button };
    expect(commitFocusedInputIn(menu, outside, () => calls.push('mark'))).toBe(false);
    expect(commitFocusedInputIn(menu, button, () => calls.push('mark'))).toBe(false);
    expect(commitFocusedInputIn(null, outside, () => calls.push('mark'))).toBe(false);
    expect(calls).toEqual([]);
  });
});
