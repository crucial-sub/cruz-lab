// 단축키 확장 테스트 (재건 3단계 D9: "레지스트리에서 addKeyboardShortcuts()를 만든다", 2.2 #2 Mod+Alt 금지)
// - Tiptap 확장의 기본 명령 키(Mod-Alt-1 등)를 뺀다. 구조 키(Enter, Tab, Backspace)는 남긴다.
// - 키를 빼도 스키마는 같다.
// - 페이지 범위 명령(저장, 발행, 팔레트 등)은 에디터 밖에서도 같은 판정으로 돈다.
import { getSchema } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { createCommands, type CommandActions } from '@/editor/commands/registry';
import {
  createPageKeyHandler,
  createPageKeyListener,
  RegistryShortcuts,
  stripCommandKeys,
} from '@/editor/commands/shortcuts';
import { createEditorExtensions } from '@/editor/extensions';
import {
  blockTypes,
  docJson,
  fakeKeyEvent,
  makeHeadlessEditor,
  pressKey,
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
    openRevisions: vi.fn(),
  };
}

function registryEditor(actions = spyActions()) {
  const commands = createCommands(actions);
  return makeHeadlessEditor(
    [
      ...createEditorExtensions().map(stripCommandKeys),
      RegistryShortcuts.configure({ getCommands: () => commands, platform: PLATFORM }),
    ],
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '본문' }] }],
    },
  );
}

describe('stripCommandKeys', () => {
  it('스키마(노드·마크 이름과 순서, 속성)를 바꾸지 않는다', () => {
    const plain = getSchema(createEditorExtensions());
    const stripped = getSchema(createEditorExtensions().map(stripCommandKeys));
    const shape = (schema: typeof plain) => ({
      nodes: Object.entries(schema.nodes).map(([name, type]) => [
        name,
        Object.keys(type.spec.attrs ?? {}),
        type.spec.content ?? null,
        type.spec.group ?? null,
      ]),
      marks: Object.entries(schema.marks).map(([name, type]) => [
        name,
        Object.keys(type.spec.attrs ?? {}),
        type.spec.excludes ?? null,
      ]),
    });
    expect(shape(stripped)).toEqual(shape(plain));
  });

  it('Mod-Alt-1(제목 1)·Mod-Alt-0·Mod-Alt-c가 아무것도 하지 않는다', () => {
    const editor = registryEditor();
    editor.commands.setTextSelection(2);
    for (const [key, keyCode] of [
      ['1', 49],
      ['0', 48],
      ['c', 67],
    ] as const) {
      expect(pressKey(editor, { key, keyCode, mod: true, alt: true })).toBe(false);
    }
    expect(blockTypes(editor)[0]).toBe('paragraph');
  });

  it('Tiptap 기본 키 Mod-Shift-s(취소선)·Mod-Shift-b(인용)는 빠진다', () => {
    const editor = registryEditor();
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(pressKey(editor, { key: 'S', keyCode: 83, mod: true, shift: true })).toBe(false);
    expect(pressKey(editor, { key: 'B', keyCode: 66, mod: true, shift: true })).toBe(false);
    expect(docJson(editor).content?.[0]?.content?.[0]?.marks).toBeUndefined();
    expect(blockTypes(editor)[0]).toBe('paragraph');
  });

  it('구조 키는 남는다: 목록 안 Enter는 항목을 나눈다', () => {
    const editor = makeHeadlessEditor(createEditorExtensions().map(stripCommandKeys), {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
            },
          ],
        },
      ],
    });
    editor.commands.setTextSelection(4);
    expect(pressKey(editor, { key: 'Enter', keyCode: 13 })).toBe(true);
    expect(docJson(editor).content?.[0]?.content).toHaveLength(2);
  });
});

describe('RegistryShortcuts', () => {
  it('제목 2 키(맥 ⌃⇧2, 그 밖 Mod-Shift-2)는 레지스트리의 heading-2 명령을 실행한다', () => {
    const editor = registryEditor();
    editor.commands.setTextSelection(2);
    const spec =
      PLATFORM === 'mac'
        ? { key: '@', keyCode: 50, ctrl: true, shift: true }
        : { key: '@', keyCode: 50, mod: true, shift: true };
    expect(pressKey(editor, spec)).toBe(true);
    expect(docJson(editor).content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
  });

  it('Mod-b는 레지스트리의 굵게다', () => {
    const editor = registryEditor();
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(pressKey(editor, { key: 'b', keyCode: 66, mod: true })).toBe(true);
    expect(docJson(editor).content?.[0]?.content?.[0]?.marks).toEqual([{ type: 'bold' }]);
  });

  it('Mod-z는 되돌리기다(Tiptap 기본 키를 뺀 뒤에도 레지스트리가 맡는다)', () => {
    const editor = registryEditor();
    editor.commands.setTextSelection(3);
    editor.commands.insertContent({ type: 'text', text: '추가' });
    expect(pressKey(editor, { key: 'z', keyCode: 90, mod: true })).toBe(true);
    expect(docJson(editor).content?.[0]?.content?.[0]?.text).toBe('본문');
  });

  it('페이지 범위 명령(Mod-s 저장)은 에디터 키맵에 없다', () => {
    const actions = spyActions();
    const editor = registryEditor(actions);
    expect(pressKey(editor, { key: 's', keyCode: 83, mod: true })).toBe(false);
    expect(actions.saveNow).not.toHaveBeenCalled();
  });
});

describe('createPageKeyHandler', () => {
  it('페이지 범위 명령의 키를 받아 실행한다', () => {
    const actions = spyActions();
    const handle = createPageKeyHandler(createCommands(actions), PLATFORM, () => null);
    expect(handle(fakeKeyEvent({ key: 's', keyCode: 83, mod: true }))).toBe(true);
    expect(handle(fakeKeyEvent({ key: 'k', keyCode: 75, mod: true }))).toBe(true);
    expect(handle(fakeKeyEvent({ key: 'Enter', keyCode: 13, mod: true, shift: true }))).toBe(true);
    expect(handle(fakeKeyEvent({ key: '<', keyCode: 188, mod: true, shift: true }))).toBe(true);
    expect(handle(fakeKeyEvent({ key: 'M', keyCode: 77, mod: true, shift: true }))).toBe(true);
    expect(actions.saveNow).toHaveBeenCalledTimes(1);
    expect(actions.openPalette).toHaveBeenCalledTimes(1);
    expect(actions.publish).toHaveBeenCalledTimes(1);
    expect(actions.togglePanel).toHaveBeenCalledTimes(1);
    expect(actions.cycleMode).toHaveBeenCalledTimes(1);
  });

  it('에디터 범위 명령의 키(Mod-b)와 수식 키 없는 글자는 받지 않는다', () => {
    const handle = createPageKeyHandler(createCommands(spyActions()), PLATFORM, () => null);
    expect(handle(fakeKeyEvent({ key: 'b', keyCode: 66, mod: true }))).toBe(false);
    expect(handle(fakeKeyEvent({ key: 's', keyCode: 83 }))).toBe(false);
  });
});

describe('리뷰 6.3: 페이지 키 창 리스너와 Mod-Enter', () => {
  it('createPageKeyListener는 조합 중·이미 처리됨·자동 반복 이벤트를 버리고, 받은 키는 기본 동작을 막는다', () => {
    const actions = spyActions();
    const listener = createPageKeyListener(
      createPageKeyHandler(createCommands(actions), PLATFORM, () => null),
    );
    const event = (extra: Partial<KeyboardEvent>) => {
      const base = fakeKeyEvent({ key: 's', keyCode: 83, mod: true });
      const prevented = { value: false };
      return Object.assign(base, {
        ...extra,
        preventDefault: () => {
          prevented.value = true;
        },
        prevented,
      }) as KeyboardEvent & { prevented: { value: boolean } };
    };
    listener(event({ isComposing: true }));
    listener(event({ defaultPrevented: true }));
    listener(event({ repeat: true }));
    expect(actions.saveNow).not.toHaveBeenCalled();
    const ok = event({});
    listener(ok);
    expect(actions.saveNow).toHaveBeenCalledTimes(1);
    expect(ok.prevented.value).toBe(true);
    const other = event({ key: 'b', keyCode: 66 });
    listener(other);
    expect(other.prevented.value).toBe(false);
  });

  it('HardBreak의 Mod-Enter는 빠진다(레지스트리에 없는 명령 키). Shift-Enter는 남는다', () => {
    const editor = registryEditor();
    editor.commands.setTextSelection(3);
    expect(pressKey(editor, { key: 'Enter', keyCode: 13, mod: true })).toBe(false);
    expect(pressKey(editor, { key: 'Enter', keyCode: 13, shift: true })).toBe(true);
    expect(docJson(editor).content?.[0]?.content?.map((node) => node.type)).toEqual([
      'text',
      'hardBreak',
    ]);
  });
});

describe('리뷰 6.3 경미 15-1: 화면용 확장 묶음의 스키마는 기본 스키마와 같다', () => {
  it('노드·마크 이름 순서와 spec의 주요 칸이 같다', async () => {
    // React 노드 뷰 모듈은 DOM 없이도 import된다(렌더하지 않는다)
    const { createUiExtensions } = await import('@/editor/ui/editor-extensions');
    const ui = createUiExtensions({
      upload: { transport: null, onReject: () => {} },
      getCommands: () => [],
      getRecent: () => [],
      onSlashRun: () => {},
      platform: PLATFORM,
      onMathBlockRequest: () => {},
      onMathClick: () => {},
    });
    const shape = (schema: ReturnType<typeof getSchema>) => ({
      nodes: Object.entries(schema.nodes).map(([name, type]) => [
        name,
        Object.fromEntries(
          Object.entries(type.spec.attrs ?? {}).map(([key, attr]) => [key, attr.default]),
        ),
        type.spec.content ?? null,
        type.spec.group ?? null,
        type.spec.inline ?? null,
        type.spec.atom ?? null,
      ]),
      marks: Object.entries(schema.marks).map(([name, type]) => [
        name,
        Object.keys(type.spec.attrs ?? {}),
        type.spec.excludes ?? null,
        type.spec.inclusive ?? null,
      ]),
    });
    expect(shape(getSchema(ui))).toEqual(shape(getSchema(createEditorExtensions())));
  });
});
