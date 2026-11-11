// 블록 이동 테스트 (재건 5단계 D6)
// - 커서가 있는 블록을 같은 부모 안에서 한 칸 옮긴다. 목록 항목은 항목 단위, 표는 표 전체.
// - 못 옮기면 감싼 블록을 옮긴다. 선택은 블록과 함께 간다. 되돌리기 한 번에 한 칸.
// - 키(Mod-Shift-ArrowUp/Down)는 레지스트리 단축키로 돈다.
import type { Editor, JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { describe, expect, it, vi } from 'vitest';
import { moveBlockTransaction } from '@/editor/commands/move-block';
import { commandById, createCommands, type CommandActions } from '@/editor/commands/registry';
import { RegistryShortcuts, stripCommandKeys } from '@/editor/commands/shortcuts';
import { createEditorExtensions } from '@/editor/extensions';
import { docToMarkdown, markdownToDoc } from '@/editor/markdown';
import { makeHeadlessEditor, pressKey, typeText } from './helpers/headless-editor';

const PLATFORM =
  typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform)
    ? 'mac'
    : 'other';

function spyActions(): CommandActions {
  return {
    pickImage: vi.fn(),
    editLink: vi.fn(),
    editMath: vi.fn(),
    setMode: vi.fn(),
    cycleMode: vi.fn(),
    saveNow: vi.fn(),
    publish: vi.fn(),
    togglePanel: vi.fn(),
    openPalette: vi.fn(),
    openRevisions: vi.fn(),
    openFind: vi.fn(() => true),
  };
}

function editorOf(markdown: string): Editor {
  const commands = createCommands(spyActions());
  return makeHeadlessEditor(
    [
      ...createEditorExtensions().map(stripCommandKeys),
      RegistryShortcuts.configure({ getCommands: () => commands, platform: PLATFORM }),
    ],
    markdownToDoc(markdown).doc as JSONContent,
  );
}

const markdownOf = (editor: Editor) => docToMarkdown(editor.getJSON()).trim();

// 글자가 처음 나오는 자리 바로 뒤에 커서를 둔다
function caretAfter(editor: Editor, text: string) {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.isText && node.text?.includes(text)) {
      found = pos + node.text.indexOf(text) + text.length;
      return false;
    }
    return true;
  });
  if (found === null) throw new Error(`글자 없음: ${text}`);
  editor.commands.setTextSelection(found);
}

function move(editor: Editor, direction: 'up' | 'down'): boolean {
  const tr = moveBlockTransaction(editor.state, direction);
  if (!tr) return false;
  editor.view.dispatch(tr);
  return true;
}

describe('moveBlockTransaction', () => {
  it('단락·제목을 위아래로 한 칸 옮긴다. 커서는 같은 글자 뒤에 남는다', () => {
    const editor = editorOf('# 제목\n\n첫째\n\n둘째');
    caretAfter(editor, '둘');
    expect(move(editor, 'up')).toBe(true);
    expect(markdownOf(editor)).toBe('# 제목\n\n둘째\n\n첫째');
    expect(
      editor.state.doc.textBetween(editor.state.selection.from - 1, editor.state.selection.from),
    ).toBe('둘');
    expect(move(editor, 'up')).toBe(true);
    expect(markdownOf(editor)).toBe('둘째\n\n# 제목\n\n첫째');
    // 맨 위다: 옮길 것이 없다
    expect(move(editor, 'up')).toBe(false);
    expect(move(editor, 'down')).toBe(true);
    expect(markdownOf(editor)).toBe('# 제목\n\n둘째\n\n첫째');
  });

  it('목록 항목은 항목 단위로 옮긴다. 하위 목록도 함께 간다', () => {
    const editor = editorOf('- 가\n- 나\n  - 나1\n- 다');
    caretAfter(editor, '나');
    expect(move(editor, 'down')).toBe(true);
    expect(markdownOf(editor)).toBe('- 가\n- 다\n- 나\n  - 나1');
  });

  it('첫 항목을 위로 옮기면 목록 전체가 위 블록과 자리를 바꾼다(감싼 블록)', () => {
    const editor = editorOf('앞 단락\n\n- 가\n- 나');
    caretAfter(editor, '가');
    expect(move(editor, 'up')).toBe(true);
    expect(markdownOf(editor)).toBe('- 가\n- 나\n\n앞 단락');
  });

  it('인용 안 단락은 인용 안에서 옮기고, 하나뿐이면 인용을 옮긴다', () => {
    const inner = editorOf('> 하나\n>\n> 둘\n\n끝');
    caretAfter(inner, '둘');
    expect(move(inner, 'up')).toBe(true);
    expect(markdownOf(inner)).toBe('> 둘\n>\n> 하나\n\n끝');

    const single = editorOf('> 인용\n\n끝');
    caretAfter(single, '인용');
    expect(move(single, 'down')).toBe(true);
    expect(markdownOf(single)).toBe('끝\n\n> 인용');
  });

  it('콜아웃과 코드 블록도 블록 하나로 옮긴다', () => {
    const editor = editorOf('> [!tip]\n> 팁\n\n```js\nconst a = 1;\n```');
    caretAfter(editor, 'const');
    expect(move(editor, 'up')).toBe(true);
    expect(markdownOf(editor)).toBe('```js\nconst a = 1;\n```\n\n> [!tip]\n> 팁');
  });

  it('표 셀 안이면 표 전체를 옮긴다', () => {
    const editor = editorOf('앞\n\n| a | b |\n| - | - |\n| 1 | 2 |');
    caretAfter(editor, '1');
    expect(move(editor, 'up')).toBe(true);
    expect(markdownOf(editor).startsWith('| a | b |')).toBe(true);
    expect(markdownOf(editor).endsWith('앞')).toBe(true);
  });

  it('고른 블록 노드(구분선)를 옮기고 선택을 유지한다', () => {
    const editor = editorOf('가\n\n---\n\n나');
    let rulePos = -1;
    editor.state.doc.forEach((node, offset) => {
      if (node.type.name === 'horizontalRule') rulePos = offset;
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, rulePos)),
    );
    expect(move(editor, 'down')).toBe(true);
    expect(markdownOf(editor)).toBe('가\n\n나\n\n---');
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('horizontalRule');
  });
});

describe('블록 이동 명령과 키 (Mod-Shift-ArrowUp/Down)', () => {
  it('키로 옮기고, 되돌리기 한 번에 한 칸 돌아간다(앞의 입력과 묶이지 않는다)', () => {
    const editor = editorOf('첫째\n\n둘째');
    caretAfter(editor, '둘째');
    typeText(editor, '!');
    expect(pressKey(editor, { key: 'ArrowUp', keyCode: 38, mod: true, shift: true })).toBe(true);
    expect(markdownOf(editor)).toBe('둘째!\n\n첫째');
    expect(pressKey(editor, { key: 'z', keyCode: 90, mod: true })).toBe(true);
    // 옮기기만 되돌아가고 입력한 '!'는 남는다
    expect(markdownOf(editor)).toBe('첫째\n\n둘째!');
  });

  it('맨 아래에서 아래로: 문서는 그대로이고 키는 받는다(브라우저 기본 선택을 막는다)', () => {
    const editor = editorOf('첫째\n\n둘째');
    caretAfter(editor, '둘째');
    const before = markdownOf(editor);
    expect(pressKey(editor, { key: 'ArrowDown', keyCode: 40, mod: true, shift: true })).toBe(true);
    expect(markdownOf(editor)).toBe(before);
  });

  it('레지스트리 명령으로도 옮긴다(팔레트·모바일 바)', () => {
    const editor = editorOf('첫째\n\n둘째');
    caretAfter(editor, '첫째');
    const command = commandById(createCommands(spyActions()), 'block-move-down')!;
    expect(command.run(editor)).toBe(true);
    expect(markdownOf(editor)).toBe('둘째\n\n첫째');
  });
});

describe('리뷰 지적', () => {
  it('B5: 옮긴 직후의 입력은 옮기기와 다른 되돌리기 단계다', () => {
    const editor = editorOf('첫째\n\n둘째');
    caretAfter(editor, '둘째');
    expect(pressKey(editor, { key: 'ArrowUp', keyCode: 38, mod: true, shift: true })).toBe(true);
    typeText(editor, '!');
    expect(markdownOf(editor)).toBe('둘째!\n\n첫째');
    pressKey(editor, { key: 'z', keyCode: 90, mod: true });
    expect(markdownOf(editor)).toBe('둘째\n\n첫째');
    pressKey(editor, { key: 'z', keyCode: 90, mod: true });
    expect(markdownOf(editor)).toBe('첫째\n\n둘째');
  });

  it('S7: 표 칸 여러 개를 고른 상태에서도 표를 옮기고 선택이 올바르다', async () => {
    const { CellSelection } = await import('@tiptap/pm/tables');
    const editor = editorOf('앞\n\n| a | b |\n| - | - |\n| 1 | 2 |');
    let cells: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableHeader') cells.push(pos);
      return true;
    });
    cells = cells.slice(0, 2);
    editor.view.dispatch(
      editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[1])),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(move(editor, 'up')).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(markdownOf(editor).endsWith('앞')).toBe(true);
    expect(editor.state.selection.$from.parent.inlineContent).toBe(true);
  });
});
