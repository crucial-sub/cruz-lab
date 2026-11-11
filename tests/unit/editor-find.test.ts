// 찾기·바꾸기 테스트 (재건 5단계 D7)
// - 찾은 수 "2 / 5", 대소문자·정규식, 정규식 오류, 다음·이전, 바꾸기, 모두 바꾸기(Mod+Z 한 번에 원래대로).
// - 막대를 열 때 미리 넣을 글자, 닫으면 강조를 지움.
// - 찾기 명령은 페이지 범위 Mod+F이고, 편집 모드가 아니면 false라 브라우저 찾기에 맡긴다.
import type { Editor, JSONContent } from '@tiptap/core';
import { getMatchHighlights, getSearchState } from 'prosemirror-search';
import { describe, expect, it, vi } from 'vitest';
import { commandById, createCommands, type CommandActions } from '@/editor/commands/registry';
import {
  createPageKeyHandler,
  RegistryShortcuts,
  stripCommandKeys,
} from '@/editor/commands/shortcuts';
import { createEditorExtensions } from '@/editor/extensions';
import { docToMarkdown, markdownToDoc } from '@/editor/markdown';
import {
  applyQuery,
  buildQuery,
  clearQuery,
  describeMatches,
  EditorSearch,
  EMPTY_FIND_OPTIONS,
  goToMatch,
  matchStats,
  MAX_COUNTED_MATCHES,
  replaceEvery,
  replaceOne,
  selectionIsMatch,
  selectionSearchText,
  type FindOptions,
} from '@/editor/ui/find';
import { fakeKeyEvent, makeHeadlessEditor, pressKey } from './helpers/headless-editor';

const PLATFORM =
  typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform)
    ? 'mac'
    : 'other';

function spyActions(openFind = vi.fn(() => true)): CommandActions {
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
    openFind,
  };
}

function editorOf(markdown: string): Editor {
  const commands = createCommands(spyActions());
  return makeHeadlessEditor(
    [
      ...createEditorExtensions().map(stripCommandKeys),
      RegistryShortcuts.configure({ getCommands: () => commands, platform: PLATFORM }),
      EditorSearch,
    ],
    markdownToDoc(markdown).doc as JSONContent,
  );
}

const options = (patch: Partial<FindOptions>): FindOptions => ({ ...EMPTY_FIND_OPTIONS, ...patch });
const markdownOf = (editor: Editor) => docToMarkdown(editor.getJSON()).trim();
const selectedText = (editor: Editor) =>
  editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);

describe('찾은 수', () => {
  it('대소문자를 가리지 않고 센다. 고른 결과의 순번을 보인다', () => {
    const editor = editorOf('Cat cat\n\n- CAT\n- dog');
    const find = options({ search: 'cat' });
    applyQuery(editor, find, true);
    const stats = matchStats(editor.state, buildQuery(find));
    expect(stats).toEqual({ total: 3, current: 1, capped: false });
    expect(describeMatches(find, stats)).toBe('1 / 3');
    goToMatch(editor, 'next');
    expect(describeMatches(find, matchStats(editor.state, buildQuery(find)))).toBe('2 / 3');
    goToMatch(editor, 'prev');
    goToMatch(editor, 'prev');
    // 처음에서 이전이면 끝으로 돈다
    expect(describeMatches(find, matchStats(editor.state, buildQuery(find)))).toBe('3 / 3');
  });

  it('대소문자 구분과 정규식', () => {
    const editor = editorOf('Cat cat CAT c4t');
    expect(
      matchStats(editor.state, buildQuery(options({ search: 'cat', caseSensitive: true }))).total,
    ).toBe(1);
    expect(
      matchStats(editor.state, buildQuery(options({ search: 'c\\wt', regexp: true }))).total,
    ).toBe(4);
    // 정규식이 아니면 글자 그대로 찾는다
    expect(matchStats(editor.state, buildQuery(options({ search: 'c\\wt' }))).total).toBe(0);
  });

  it('없으면 "없음", 정규식 오류면 "정규식 오류", 찾을 글자가 없으면 빈 글자', () => {
    const editor = editorOf('본문');
    const none = options({ search: '없는' });
    expect(describeMatches(none, matchStats(editor.state, buildQuery(none)))).toBe('없음');
    const broken = options({ search: '(', regexp: true });
    expect(describeMatches(broken, matchStats(editor.state, buildQuery(broken)))).toBe(
      '정규식 오류',
    );
    expect(describeMatches(EMPTY_FIND_OPTIONS, { total: 0, current: null, capped: false })).toBe(
      '',
    );
  });

  it('빈 결과를 내는 정규식에서 멈추지 않는다. 한도를 넘으면 capped', () => {
    const editor = editorOf('a'.repeat(MAX_COUNTED_MATCHES + 5));
    expect(
      matchStats(editor.state, buildQuery(options({ search: 'x*', regexp: true }))).total,
    ).toBeGreaterThan(0);
    const many = options({ search: 'a' });
    const stats = matchStats(editor.state, buildQuery(many));
    expect(stats.capped).toBe(true);
    expect(describeMatches(many, stats)).toBe(`– / ${MAX_COUNTED_MATCHES}+`);
  });
});

describe('바꾸기', () => {
  it('바꾸기는 지금 결과를 바꾸고 다음으로 간다', () => {
    const editor = editorOf('하나 둘 하나 셋 하나');
    applyQuery(editor, options({ search: '하나', replace: '1' }), true);
    expect(selectedText(editor)).toBe('하나');
    replaceOne(editor);
    expect(markdownOf(editor)).toBe('1 둘 하나 셋 하나');
    expect(selectedText(editor)).toBe('하나');
  });

  it('모두 바꾸기는 한 번이고 Mod+Z 한 번에 모두 원래대로다(8.4 시나리오 15)', () => {
    const editor = editorOf('하나 둘 하나\n\n- 하나');
    applyQuery(editor, options({ search: '하나', replace: 'ONE' }), true);
    expect(replaceEvery(editor)).toBe(true);
    expect(markdownOf(editor)).toBe('ONE 둘 ONE\n\n- ONE');
    expect(pressKey(editor, { key: 'z', keyCode: 90, mod: true })).toBe(true);
    expect(markdownOf(editor)).toBe('하나 둘 하나\n\n- 하나');
  });

  it('정규식 바꾸기는 $1을 쓴다. 마크(굵게)는 남는다', () => {
    const editor = editorOf('**v1.2** 판');
    applyQuery(
      editor,
      options({ search: 'v(\\d)\\.(\\d)', replace: 'v$1-$2', regexp: true }),
      true,
    );
    replaceEvery(editor);
    expect(markdownOf(editor)).toBe('**v1-2** 판');
  });
});

describe('막대 열기·닫기', () => {
  it('한 블록 안의 짧은 선택을 찾을 글자로 미리 넣는다', () => {
    const editor = editorOf('첫 단락 글자\n\n둘째');
    editor.commands.setTextSelection({ from: 3, to: 5 });
    expect(selectionSearchText(editor.state)).toBe('단락');
    editor.commands.setTextSelection(3);
    expect(selectionSearchText(editor.state)).toBeNull();
    // 블록 둘에 걸친 선택은 넣지 않는다
    editor.commands.setTextSelection({ from: 2, to: editor.state.doc.content.size - 1 });
    expect(selectionSearchText(editor.state)).toBeNull();
  });

  it('질의를 넣으면 강조가 생기고, 닫으면(clearQuery) 사라진다', () => {
    const editor = editorOf('가 나 가');
    applyQuery(editor, options({ search: '가' }), false);
    expect(getSearchState(editor.state)?.query.search).toBe('가');
    expect(getMatchHighlights(editor.state).find()).toHaveLength(2);
    clearQuery(editor);
    expect(getSearchState(editor.state)?.query.search).toBe('');
    expect(getMatchHighlights(editor.state).find()).toHaveLength(0);
  });

  it('Mod+F는 페이지 범위 찾기 명령이다. openFind가 false면(편집 모드 아님) 키를 받지 않는다', () => {
    const editor = editorOf('본문');
    const opened = vi.fn(() => true);
    const handle = createPageKeyHandler(createCommands(spyActions(opened)), PLATFORM, () => editor);
    expect(handle(fakeKeyEvent({ key: 'f', keyCode: 70, mod: true }))).toBe(true);
    expect(opened).toHaveBeenCalledTimes(1);

    const notEdit = vi.fn(() => false);
    const browserFind = createPageKeyHandler(
      createCommands(spyActions(notEdit)),
      PLATFORM,
      () => editor,
    );
    expect(browserFind(fakeKeyEvent({ key: 'f', keyCode: 70, mod: true }))).toBe(false);
    expect(commandById(createCommands(spyActions()), 'find')?.scope).toBe('page');
  });
});

describe('리뷰 지적', () => {
  it('S5: 정규식이 이미지·인라인 수식(원자)을 걸치면 결과에서 뺀다. 모두 바꾸기가 이미지를 지우지 않는다', () => {
    const editor = editorOf('a![x](https://e.com/x.png)b 그리고 acb');
    const regex = options({ search: 'a.b', replace: 'ZZ', regexp: true });
    expect(matchStats(editor.state, buildQuery(regex)).total).toBe(1);
    applyQuery(editor, regex, true);
    replaceEvery(editor);
    expect(markdownOf(editor)).toBe('a![x](https://e.com/x.png)b 그리고 ZZ');
  });

  it('B5: 바꾸기 직후의 입력은 바꾸기와 다른 되돌리기 단계다', () => {
    const editor = editorOf('하나 둘');
    applyQuery(editor, options({ search: '하나', replace: '1' }), true);
    replaceEvery(editor);
    const end = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection(end);
    editor.view.dispatch(editor.state.tr.insertText('!'));
    expect(markdownOf(editor)).toBe('1 둘!');
    pressKey(editor, { key: 'z', keyCode: 90, mod: true });
    expect(markdownOf(editor)).toBe('1 둘');
    pressKey(editor, { key: 'z', keyCode: 90, mod: true });
    expect(markdownOf(editor)).toBe('하나 둘');
  });

  it('B6: 지금 선택이 결과면 selectionIsMatch가 참이다(다시 Mod+F에서 찾을 글자를 바꾸지 않는다)', () => {
    const editor = editorOf('값 123 과 456');
    applyQuery(editor, options({ search: '\\d+', regexp: true }), true);
    expect(selectedText(editor)).toBe('123');
    expect(selectionIsMatch(editor.state)).toBe(true);
    editor.commands.setTextSelection({ from: 1, to: 2 });
    expect(selectionIsMatch(editor.state)).toBe(false);
  });
});
