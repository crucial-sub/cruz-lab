// 명령 레지스트리 테스트 (재건 3단계 D9, Plan 부록 B)
// - 기본 키가 부록 B와 같고, Mod+Alt를 쓰지 않으며, 충돌이 없다.
// - 슬래시 이름(부록 B)이 레지스트리의 같은 명령을 찾는다.
// - 편집 명령은 헤드리스 에디터에서 실제로 문서를 바꾼다. 화면 동작은 주입한 함수를 부른다.
import { getSchema, type Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { filterCommands } from '@/editor/commands/filter';
import { findKeyConflicts, usesModAlt } from '@/editor/commands/keymap';
import {
  createCommands,
  type CommandActions,
  type EditorCommand,
} from '@/editor/commands/registry';
import { createEditorExtensions } from '@/editor/extensions';
import { blockTypes, docJson, makeHeadlessEditor } from './helpers/headless-editor';

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
  };
}

const commands = createCommands(spyActions());
const byId = (list: EditorCommand[], id: string) => {
  const found = list.find((command) => command.id === id);
  if (!found) throw new Error(`명령 없음: ${id}`);
  return found;
};

function paragraphEditor(text = '본문') {
  return makeHeadlessEditor(createEditorExtensions(), {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
}

// 커서를 첫 단락 안에 둔다
function caretInFirstBlock(editor: Editor) {
  editor.commands.setTextSelection(2);
}

describe('레지스트리 형태', () => {
  it('id가 겹치지 않는다', () => {
    const ids = commands.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Mod+Alt 조합을 쓰지 않는다(계획 문서 2.2 #2)', () => {
    const keys = commands.flatMap((command) =>
      command.keys ? [command.keys.mac, command.keys.other] : [],
    );
    expect(keys.filter(usesModAlt)).toEqual([]);
  });

  it('기본 키끼리 충돌하지 않는다', () => {
    expect(findKeyConflicts(commands)).toEqual([]);
  });

  it('부록 B의 기본 키와 같다. 제목·단락은 맥에서만 ⌃⇧숫자다(사용자 결정 2026-11-09)', () => {
    for (const [id, digit] of [
      ['heading-2', 2],
      ['heading-3', 3],
      ['heading-4', 4],
      ['paragraph', 0],
    ] as const) {
      expect(byId(commands, id).keys, id).toEqual({
        mac: `Ctrl-Shift-${digit}`,
        other: `Mod-Shift-${digit}`,
      });
    }
    const expected: Record<string, string> = {
      bold: 'Mod-b',
      italic: 'Mod-i',
      strike: 'Mod-Shift-x',
      code: 'Mod-e',
      link: 'Mod-Shift-k',
      'bullet-list': 'Mod-Shift-8',
      'ordered-list': 'Mod-Shift-7',
      'task-list': 'Mod-Shift-9',
      blockquote: 'Mod-Shift-.',
      'code-block': 'Mod-Shift-c',
      image: 'Mod-Shift-i',
      undo: 'Mod-z',
      redo: 'Mod-Shift-z',
      'command-palette': 'Mod-k',
      'mode-cycle': 'Mod-Shift-m',
      'save-now': 'Mod-s',
      publish: 'Mod-Shift-Enter',
      'toggle-panel': 'Mod-Shift-,',
      // 사용 피드백 2026-11-09(부록 B 밖, 작업 문서 2.11)
      'select-word': 'Mod-d',
      'collapse-selection': 'Escape',
    };
    for (const [id, key] of Object.entries(expected)) {
      expect(byId(commands, id).keys, id).toEqual({ mac: key, other: key });
    }
    const keyed = commands.filter((command) => command.keys).map((command) => command.id);
    expect(keyed.sort()).toEqual(
      [...Object.keys(expected), 'heading-2', 'heading-3', 'heading-4', 'paragraph'].sort(),
    );
  });

  it('보기·문서 명령 중 되돌리기·다시 실행만 에디터 범위다. 나머지는 페이지 범위다', () => {
    const pageScoped = commands.filter((command) => command.scope === 'page').map((c) => c.id);
    expect(pageScoped.sort()).toEqual(
      [
        'command-palette',
        'mode-cycle',
        'mode-edit',
        'mode-preview',
        'mode-source',
        'publish',
        'revisions',
        'save-now',
        'toggle-panel',
      ].sort(),
    );
  });
});

describe('슬래시 이름(부록 B)', () => {
  const slash = commands.filter((command) => command.inSlash);
  const cases: Array<[string, string]> = [
    ['제목2', 'heading-2'],
    ['제목3', 'heading-3'],
    ['단락', 'paragraph'],
    ['링크', 'link'],
    ['목록', 'bullet-list'],
    ['번호', 'ordered-list'],
    ['체크', 'task-list'],
    ['인용', 'blockquote'],
    ['콜아웃', 'callout-note'],
    ['코드', 'code-block'],
    ['표', 'table'],
    ['이미지', 'image'],
    ['구분선', 'horizontal-rule'],
    ['수식', 'math-block'],
    ['소스', 'mode-source'],
    ['미리보기', 'mode-preview'],
  ];
  it.each(cases)('/%s → %s가 첫 번째다', (query, id) => {
    expect(filterCommands(slash, query, [])[0]?.id).toBe(id);
  });

  it('굵게 같은 마크 명령은 슬래시에 없다(입력 규칙과 단축키가 맡는다)', () => {
    expect(slash.map((command) => command.id)).not.toContain('bold');
  });
});

describe('편집 명령 실행', () => {
  it('제목 2 → 다시 누르면 단락', () => {
    const editor = paragraphEditor();
    caretInFirstBlock(editor);
    expect(byId(commands, 'heading-2').run(editor)).toBe(true);
    expect(docJson(editor).content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(byId(commands, 'heading-2').isActive?.(editor)).toBe(true);
    byId(commands, 'heading-2').run(editor);
    expect(blockTypes(editor)[0]).toBe('paragraph');
  });

  it('제목 순환(모바일): 단락 → 2 → 3 → 단락', () => {
    const editor = paragraphEditor();
    caretInFirstBlock(editor);
    const cycle = byId(commands, 'heading-cycle');
    cycle.run(editor);
    expect(docJson(editor).content?.[0]?.attrs?.level).toBe(2);
    cycle.run(editor);
    expect(docJson(editor).content?.[0]?.attrs?.level).toBe(3);
    cycle.run(editor);
    expect(blockTypes(editor)[0]).toBe('paragraph');
  });

  it('콜아웃(팁)으로 감싸고, 같은 명령을 다시 하면 푼다', () => {
    const editor = paragraphEditor();
    caretInFirstBlock(editor);
    byId(commands, 'callout-tip').run(editor);
    expect(docJson(editor).content?.[0]).toMatchObject({ type: 'callout', attrs: { type: 'tip' } });
    byId(commands, 'callout-tip').run(editor);
    expect(blockTypes(editor)[0]).toBe('paragraph');
  });

  it('표는 머리 행이 있는 3×3이다. 표 명령은 표 안에서만 쓸 수 있다', () => {
    const editor = paragraphEditor();
    caretInFirstBlock(editor);
    expect(byId(commands, 'table-add-row').isAvailable?.(editor)).toBe(false);
    byId(commands, 'table').run(editor);
    const table = docJson(editor).content?.find((node) => node.type === 'table');
    expect(table?.content).toHaveLength(3);
    expect(table?.content?.[0]?.content?.map((cell) => cell.type)).toEqual([
      'tableHeader',
      'tableHeader',
      'tableHeader',
    ]);
    expect(byId(commands, 'table-add-row').isAvailable?.(editor)).toBe(true);
    byId(commands, 'table-add-row').run(editor);
    const grown = docJson(editor).content?.find((node) => node.type === 'table');
    expect(grown?.content).toHaveLength(4);
  });

  it('굵게는 선택 범위에 마크를 건다', () => {
    const editor = paragraphEditor('굵게 할 글');
    editor.commands.setTextSelection({ from: 1, to: 3 });
    byId(commands, 'bold').run(editor);
    expect(docJson(editor).content?.[0]?.content?.[0]).toMatchObject({
      text: '굵게',
      marks: [{ type: 'bold' }],
    });
  });
});

describe('화면 동작 명령', () => {
  it('주입한 함수를 부르고 true를 돌려준다', () => {
    const actions = spyActions();
    const list = createCommands(actions);
    const editor = paragraphEditor();
    expect(byId(list, 'image').run(editor)).toBe(true);
    byId(list, 'link').run(editor);
    byId(list, 'math-block').run(editor);
    byId(list, 'math-inline').run(editor);
    byId(list, 'mode-source').run(editor);
    byId(list, 'mode-cycle').run(editor);
    byId(list, 'save-now').run(editor);
    byId(list, 'publish').run(editor);
    byId(list, 'toggle-panel').run(editor);
    byId(list, 'command-palette').run(editor);
    expect(actions.pickImage).toHaveBeenCalledTimes(1);
    expect(actions.editLink).toHaveBeenCalledTimes(1);
    expect(actions.editMath).toHaveBeenCalledWith({ kind: 'block', pos: null, latex: '' });
    expect(actions.editMath).toHaveBeenCalledWith({ kind: 'inline', pos: null, latex: '' });
    expect(actions.setMode).toHaveBeenCalledWith('source');
    expect(actions.cycleMode).toHaveBeenCalledTimes(1);
    expect(actions.saveNow).toHaveBeenCalledTimes(1);
    expect(actions.publish).toHaveBeenCalledTimes(1);
    expect(actions.togglePanel).toHaveBeenCalledTimes(1);
    expect(actions.openPalette).toHaveBeenCalledTimes(1);
  });
});

describe('리뷰 6.3 중요 3: 넣기 명령은 코드 블록·표 셀 안에서 쓸 수 없다', () => {
  const codeEditor = () =>
    makeHeadlessEditor(createEditorExtensions(), {
      type: 'doc',
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'ab' }] }],
    });
  const cellEditor = () =>
    makeHeadlessEditor(createEditorExtensions(), {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c1' }] }],
                },
              ],
            },
          ],
        },
      ],
    });

  it.each(['image', 'table', 'horizontal-rule', 'math-block', 'math-inline'])(
    '코드 블록 안: %s 사용 불가',
    (id) => {
      const editor = codeEditor();
      editor.commands.setTextSelection(2);
      expect(byId(commands, id).isAvailable?.(editor)).toBe(false);
    },
  );

  it.each(['table', 'horizontal-rule', 'math-block'])('표 셀 안: %s 사용 불가', (id) => {
    const editor = cellEditor();
    editor.commands.setTextSelection(4);
    expect(byId(commands, id).isAvailable?.(editor)).toBe(false);
  });

  it('표 셀 안: 이미지·인라인 수식은 쓸 수 있다(단락 안 인라인 노드)', () => {
    const editor = cellEditor();
    editor.commands.setTextSelection(4);
    expect(byId(commands, 'image').isAvailable?.(editor)).toBe(true);
    expect(byId(commands, 'math-inline').isAvailable?.(editor)).toBe(true);
  });

  it('단락에서는 모두 쓸 수 있다', () => {
    const editor = paragraphEditor();
    caretInFirstBlock(editor);
    for (const id of ['image', 'table', 'horizontal-rule', 'math-block', 'math-inline']) {
      expect(byId(commands, id).isAvailable?.(editor), id).toBe(true);
    }
  });
});

describe('리뷰 6.3 경미 13: 임베드 renderHTML은 판정 실패 주소를 글자로 그린다', () => {
  it('지원하지 않는 주소(JSON이 바뀐 경우)는 a 요소가 아니라 글자다', () => {
    const schema = getSchema(createEditorExtensions());
    const node = schema.nodes.embed.create({ provider: 'youtube', url: 'javascript:alert(1)' });
    const spec = schema.nodes.embed.spec.toDOM?.(node) as unknown;
    expect(JSON.stringify(spec)).not.toContain('"a"');
    expect(JSON.stringify(spec)).toContain('javascript:alert(1)');
  });
});
