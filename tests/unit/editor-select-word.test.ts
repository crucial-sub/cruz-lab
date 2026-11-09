// 단어·줄 선택 명령과 인라인 코드 Enter 탈출 테스트 (사용 피드백 2026-11-09, 작업 문서 2.11)
// - Mod+D 한 번: 커서에 가장 가까운 단어를 고른다. 단어 밖이면 거리가 가까운 단어, 같으면 앞 단어.
// - 한 번 더: 그 줄(단락, 또는 줄바꿈·코드 블록 안의 한 줄) 전체. 코드 블록·줄바꿈 단락은 한 번 더 누르면 블록 전체.
// - 더 넓힐 수 없으면 그대로다. 키는 항상 받는다(브라우저 북마크 창이 뜨지 않게).
// - 인라인 코드 끝에서 Enter를 누르면 새 줄은 인라인 코드가 아니다(다른 마크는 남는다).
// - Esc: 선택이 있으면 풀고 커서를 선택이 끝난 자리(head)에 둔다. 선택이 없으면 Esc를 받지 않는다(슬래시 메뉴 닫기에 넘긴다).
import type { Editor, JSONContent } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { createCommands, type CommandActions } from '@/editor/commands/registry';
import { NodeSelection } from '@tiptap/pm/state';
import {
  collapsedSelection,
  findWordRange,
  nextSelectionRange,
} from '@/editor/commands/select-word';
import { RegistryShortcuts, stripCommandKeys } from '@/editor/commands/shortcuts';
import { createEditorExtensions } from '@/editor/extensions';
import {
  docJson,
  makeHeadlessEditor,
  pressEnter,
  pressKey,
  typeText,
} from './helpers/headless-editor';

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
  };
}

const commands = createCommands(spyActions());
const selectCommand = () => {
  const found = commands.find((command) => command.id === 'select-word');
  if (!found) throw new Error('select-word 명령이 없다');
  return found;
};

// 레지스트리 단축키를 붙인 헤드리스 에디터
function editorWith(content: JSONContent[]) {
  return makeHeadlessEditor(
    [
      ...createEditorExtensions().map(stripCommandKeys),
      RegistryShortcuts.configure({ getCommands: () => commands, platform: PLATFORM }),
    ],
    { type: 'doc', content },
  );
}

const text = (value: string, marks?: string[]): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });

// 지금 선택한 글자
const selectedText = (editor: Editor) => {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, '\n', '\n');
};
const pressModD = (editor: Editor) => pressKey(editor, { key: 'd', keyCode: 68, mod: true });

describe('findWordRange (순수 함수)', () => {
  const line = '나는 박중섭 입니다.';

  it('단어 바로 뒤, 가운데, 바로 앞의 커서는 그 단어를 고른다', () => {
    expect(findWordRange(line, 6)).toEqual({ from: 3, to: 6 });
    expect(findWordRange(line, 4)).toEqual({ from: 3, to: 6 });
    expect(findWordRange(line, 3)).toEqual({ from: 3, to: 6 });
  });

  it('문장 부호 뒤의 커서는 가까운 단어를 고른다(마침표는 단어가 아니다)', () => {
    expect(findWordRange(line, line.length)).toEqual({ from: 7, to: 10 });
  });

  it('공백 사이의 커서는 거리가 가까운 단어를, 같으면 앞 단어를 고른다', () => {
    expect(findWordRange('a   b', 2)).toEqual({ from: 0, to: 1 });
    expect(findWordRange('a   b', 3)).toEqual({ from: 4, to: 5 });
    expect(findWordRange('a  b', 2)).toEqual({ from: 0, to: 1 });
  });

  it('밑줄은 단어에 들고, 점·괄호·하이픈은 단어를 나눈다', () => {
    expect(findWordRange('handleUpdate()', 6)).toEqual({ from: 0, to: 12 });
    expect(findWordRange('foo_bar.baz', 2)).toEqual({ from: 0, to: 7 });
    expect(findWordRange('foo_bar.baz', 9)).toEqual({ from: 8, to: 11 });
    expect(findWordRange('dark-mode', 7)).toEqual({ from: 5, to: 9 });
  });

  it('서로게이트 쌍 글자도 한 글자로 센다', () => {
    expect(findWordRange('𠮷野家 dd', 1)).toEqual({ from: 0, to: 4 });
  });

  it('단어가 없으면 null이다', () => {
    expect(findWordRange('', 0)).toBeNull();
    expect(findWordRange('  ...  ', 3)).toBeNull();
  });
});

describe('단어·줄 선택 명령 (Mod+D)', () => {
  it('레지스트리 명령이다. 키는 Mod-d, 에디터 범위, 팔레트에만 있다', () => {
    const command = selectCommand();
    expect(command.keys).toEqual({ mac: 'Mod-d', other: 'Mod-d' });
    expect(command.scope).toBe('editor');
    expect(command.inPalette).toBe(true);
    expect(command.inSlash).toBe(false);
  });

  it('커서 뒤 단어를 고르고, 한 번 더 누르면 줄 전체, 그다음은 그대로다', () => {
    const editor = editorWith([paragraph(text('나는 박중섭 입니다.'))]);
    editor.commands.setTextSelection(1 + 6); // "박중섭" 바로 뒤
    expect(pressModD(editor)).toBe(true);
    expect(selectedText(editor)).toBe('박중섭');
    expect(pressModD(editor)).toBe(true);
    expect(selectedText(editor)).toBe('나는 박중섭 입니다.');
    expect(pressModD(editor)).toBe(true);
    expect(selectedText(editor)).toBe('나는 박중섭 입니다.');
  });

  it('고른 단어에 굵게를 바로 입힐 수 있다', () => {
    const editor = editorWith([paragraph(text('나는 박중섭 입니다.'))]);
    editor.commands.setTextSelection(1 + 4);
    pressModD(editor);
    pressKey(editor, { key: 'b', keyCode: 66, mod: true });
    const runs = docJson(editor).content?.[0]?.content ?? [];
    expect(runs.map((run) => [run.text, (run.marks ?? []).map((mark) => mark.type)])).toEqual([
      ['나는 ', []],
      ['박중섭', ['bold']],
      [' 입니다.', []],
    ]);
  });

  it('드래그로 일부를 고른 상태면 줄 전체로 넓힌다', () => {
    const editor = editorWith([paragraph(text('나는 박중섭 입니다.'))]);
    editor.commands.setTextSelection({ from: 1 + 3, to: 1 + 5 });
    selectCommand().run(editor);
    expect(selectedText(editor)).toBe('나는 박중섭 입니다.');
  });

  it('빈 단락에서는 아무것도 고르지 않지만 키는 받는다', () => {
    const editor = editorWith([{ type: 'paragraph' }]);
    editor.commands.setTextSelection(1);
    expect(pressModD(editor)).toBe(true);
    expect(editor.state.selection.empty).toBe(true);
  });

  it('두 단락에 걸친 선택은 그대로 둔다', () => {
    const editor = editorWith([paragraph(text('첫째')), paragraph(text('둘째'))]);
    editor.commands.setTextSelection({ from: 2, to: 6 });
    expect(nextSelectionRange(editor.state)).toBeNull();
    expect(selectCommand().run(editor)).toBe(true);
    expect(editor.state.selection.from).toBe(2);
    expect(editor.state.selection.to).toBe(6);
  });

  it('코드 블록: 단어 → 그 줄 → 블록 전체', () => {
    const editor = editorWith([
      {
        type: 'codeBlock',
        attrs: { language: 'javascript' },
        content: [text('const a = 1\nlet bb = 2')],
      },
    ]);
    editor.commands.setTextSelection(1 + 'const a = 1\nlet b'.length);
    selectCommand().run(editor);
    expect(selectedText(editor)).toBe('bb');
    selectCommand().run(editor);
    expect(selectedText(editor)).toBe('let bb = 2');
    selectCommand().run(editor);
    expect(selectedText(editor)).toBe('const a = 1\nlet bb = 2');
    selectCommand().run(editor);
    expect(selectedText(editor)).toBe('const a = 1\nlet bb = 2');
  });

  it('줄바꿈(Shift+Enter)이 있는 단락: 단어 → 그 줄 → 단락 전체', () => {
    const editor = editorWith([paragraph(text('첫 줄'), { type: 'hardBreak' }, text('둘째 줄'))]);
    editor.commands.setTextSelection(1 + '첫 줄'.length + 1 + 1); // "둘째" 가운데
    selectCommand().run(editor);
    expect(selectedText(editor)).toBe('둘째');
    selectCommand().run(editor);
    expect(selectedText(editor)).toBe('둘째 줄');
    selectCommand().run(editor);
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(1 + '첫 줄'.length + 1 + '둘째 줄'.length);
  });

  it('인라인 이미지는 단어를 나눈다', () => {
    const editor = editorWith([
      paragraph(
        text('ab'),
        { type: 'image', attrs: { src: 'https://example.com/a.png' } },
        text('cd'),
      ),
    ]);
    editor.commands.setTextSelection(1 + 2 + 1); // 이미지 바로 뒤, "cd" 앞
    selectCommand().run(editor);
    expect(selectedText(editor)).toBe('cd');
  });
});

describe('인라인 코드 끝에서 Enter', () => {
  it('새 단락에 치는 글자는 인라인 코드가 아니다', () => {
    const editor = editorWith([paragraph(text('설치: '), text('npm i', ['code']))]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    pressEnter(editor);
    typeText(editor, '다음');
    const blocks = docJson(editor).content ?? [];
    expect(blocks).toHaveLength(2);
    expect(blocks[1]?.content).toEqual([{ type: 'text', text: '다음' }]);
  });

  it('굵게 같은 다른 마크는 남고 인라인 코드만 빠진다', () => {
    const editor = editorWith([paragraph(text('x', ['bold', 'code']))]);
    editor.commands.setTextSelection(2);
    pressEnter(editor);
    typeText(editor, 'y');
    const second = docJson(editor).content?.[1]?.content?.[0];
    expect(second?.text).toBe('y');
    expect((second?.marks ?? []).map((mark) => mark.type)).toEqual(['bold']);
  });

  it('목록 항목에서도 새 항목은 인라인 코드가 아니다', () => {
    const editor = editorWith([
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [paragraph(text('코드 '), text('ls', ['code']))] }],
      },
    ]);
    editor.commands.setTextSelection(1 + 1 + 1 + '코드 ls'.length);
    pressEnter(editor);
    typeText(editor, '다음');
    const items = docJson(editor).content?.[0]?.content ?? [];
    expect(items).toHaveLength(2);
    expect(items[1]?.content?.[0]?.content).toEqual([{ type: 'text', text: '다음' }]);
  });
});

describe('Esc 선택 풀기', () => {
  const pressEscape = (editor: Editor) => pressKey(editor, { key: 'Escape', keyCode: 27 });
  const collapseCommand = () => {
    const found = commands.find((command) => command.id === 'collapse-selection');
    if (!found) throw new Error('collapse-selection 명령이 없다');
    return found;
  };

  it('레지스트리 명령이다. 키는 Escape, 에디터 범위, 팔레트·슬래시에는 없다', () => {
    const command = collapseCommand();
    expect(command.keys).toEqual({ mac: 'Escape', other: 'Escape' });
    expect(command.scope).toBe('editor');
    expect(command.inPalette).toBe(false);
    expect(command.inSlash).toBe(false);
  });

  it('Mod+D로 고른 단어를 풀고 커서를 그 단어 바로 뒤에 둔다', () => {
    const editor = editorWith([paragraph(text('나는 박중섭 입니다.'))]);
    editor.commands.setTextSelection(1 + 4);
    pressModD(editor);
    expect(selectedText(editor)).toBe('박중섭');
    expect(pressEscape(editor)).toBe(true);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(1 + 6);
  });

  it('뒤에서 앞으로 고른 선택은 커서를 앞쪽(선택이 끝난 자리)에 둔다', () => {
    const editor = editorWith([paragraph(text('나는 박중섭 입니다.'))]);
    editor.commands.setTextSelection({ from: 1 + 6, to: 1 + 3 });
    pressEscape(editor);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(1 + 3);
  });

  it('인라인 이미지를 고른 상태면 풀고 커서를 이미지 바로 뒤에 둔다', () => {
    const editor = editorWith([
      paragraph(
        text('ab'),
        { type: 'image', attrs: { src: 'https://example.com/a.png' } },
        text('cd'),
      ),
    ]);
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1 + 2)),
    );
    expect(pressEscape(editor)).toBe(true);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(1 + 2 + 1);
  });

  it('선택이 없으면 받지 않는다(false). 문서와 커서는 그대로다', () => {
    const editor = editorWith([paragraph(text('본문'))]);
    editor.commands.setTextSelection(2);
    const before = JSON.stringify(editor.getJSON());
    expect(collapsedSelection(editor.state)).toBeNull();
    expect(collapseCommand().run(editor)).toBe(false);
    expect(editor.state.selection.from).toBe(2);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it('문서는 바꾸지 않는다', () => {
    const editor = editorWith([paragraph(text('나는 박중섭 입니다.'))]);
    editor.commands.setTextSelection({ from: 1, to: 1 + 5 });
    const before = JSON.stringify(editor.getJSON());
    pressEscape(editor);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });
});
