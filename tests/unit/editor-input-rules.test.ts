// 입력 규칙·임베드 붙여넣기 테스트 (재건 3단계 2.1 "입력 규칙으로 구조를 만든다", D3 임베드·수식, 부록 B)
// - StarterKit 기본 규칙(## , > , - , 1. , ```, ---)이 그대로 돈다.
// - 더한 규칙: 인용 첫 줄 [!note] → 콜아웃, 글머리 항목 첫머리 [ ] → 체크 목록, 빈 단락 $$ → 수식 블록 입력 창.
// - 임베드: 빈 단락에 지원 주소 붙여넣기, 지원 주소만 있는 단락에서 Enter → 임베드 노드. 다른 주소는 그대로.
import type { JSONContent } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { createEditorExtensions } from '@/editor/extensions';
import {
  EditorInputRules,
  embedOfTextblock,
  embedPasteTransaction,
} from '@/editor/extensions/input-rules';
import {
  blockTypes,
  docJson,
  makeHeadlessEditor,
  pressEnter,
  typeText,
} from './helpers/headless-editor';

function makeEditor(onMathBlockRequest: (() => void) | null = null, content?: JSONContent) {
  return makeHeadlessEditor(
    [...createEditorExtensions(), EditorInputRules.configure({ onMathBlockRequest })],
    content,
  );
}

describe('StarterKit 기본 입력 규칙', () => {
  it.each([
    ['## ', 'heading'],
    ['> ', 'blockquote'],
    ['- ', 'bulletList'],
    ['1. ', 'orderedList'],
    ['```js ', 'codeBlock'],
    ['---', 'horizontalRule'],
    ['[ ] ', 'taskList'],
  ])('%j → %s', (input, type) => {
    const editor = makeEditor();
    typeText(editor, input);
    expect(blockTypes(editor)[0]).toBe(type);
  });

  it('한글 제목: "### 한글"은 제목 3 안의 한글이다', () => {
    const editor = makeEditor();
    typeText(editor, '### 한글');
    expect(docJson(editor).content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: '한글' }],
    });
  });
});

describe('콜아웃 입력 규칙 (> [!note] )', () => {
  it.each(['note', 'tip', 'warning'] as const)('인용 첫 줄의 [!%s] 다음 공백 → 콜아웃', (type) => {
    const editor = makeEditor();
    typeText(editor, `> [!${type}] `);
    const first = docJson(editor).content?.[0];
    expect(first).toMatchObject({ type: 'callout', attrs: { type } });
    expect(first?.content).toEqual([{ type: 'paragraph' }]);
  });

  it('인용 밖이나 모르는 종류면 글자 그대로다', () => {
    const outside = makeEditor();
    typeText(outside, '[!note] ');
    expect(blockTypes(outside)[0]).toBe('paragraph');

    const unknown = makeEditor();
    typeText(unknown, '> [!danger] ');
    expect(blockTypes(unknown)[0]).toBe('blockquote');
  });
});

describe('체크 목록 입력 규칙 (- [ ] )', () => {
  it('글머리 항목 첫머리의 [ ] → 체크 목록', () => {
    const editor = makeEditor();
    typeText(editor, '- [ ] ');
    const first = docJson(editor).content?.[0];
    expect(first?.type).toBe('taskList');
    expect(first?.content?.[0]).toMatchObject({ type: 'taskItem', attrs: { checked: false } });
  });

  it('[x]는 체크된 항목이다', () => {
    const editor = makeEditor();
    typeText(editor, '- [x] ');
    expect(docJson(editor).content?.[0]?.content?.[0]).toMatchObject({
      type: 'taskItem',
      attrs: { checked: true },
    });
  });
});

describe('수식 블록 입력 규칙 ($$)', () => {
  it('빈 단락의 $$ 다음 공백 → 글자를 지우고 수식 입력 창을 연다', async () => {
    const request = vi.fn();
    const editor = makeEditor(request);
    typeText(editor, '$$ ');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request).toHaveBeenCalledTimes(1);
    expect(docJson(editor).content?.[0]).toEqual({ type: 'paragraph' });
  });

  it('$$ 다음 Enter도 같다', async () => {
    const request = vi.fn();
    const editor = makeEditor(request);
    typeText(editor, '$$');
    pressEnter(editor);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request).toHaveBeenCalledTimes(1);
    expect(docJson(editor).content?.[0]).toEqual({ type: 'paragraph' });
  });

  it('입력 창이 없으면(콜백 없음) 글자 그대로다. 글 중간의 $$는 건드리지 않는다', () => {
    const editor = makeEditor(null);
    typeText(editor, '$$ ');
    expect(docJson(editor).content?.[0]?.content?.[0]?.text).toBe('$$ ');

    const request = vi.fn();
    const middle = makeEditor(request);
    typeText(middle, '가격 $$ ');
    expect(request).not.toHaveBeenCalled();
  });

  it('Tiptap 기본 규칙: $$x$$ → 인라인 수식', () => {
    const editor = makeEditor();
    typeText(editor, '$$x^2$$');
    expect(docJson(editor).content?.[0]?.content?.[0]).toMatchObject({
      type: 'inlineMath',
      attrs: { latex: 'x^2' },
    });
  });
});

const YOUTUBE = 'https://youtu.be/dQw4w9WgXcQ';

describe('embedOfTextblock', () => {
  it('지원 주소 하나만 있는 단락이면 임베드 정보다(링크 마크가 있어도 주소와 같으면)', () => {
    const editor = makeHeadlessEditor(createEditorExtensions(), {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: ` ${YOUTUBE} ` }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: YOUTUBE, marks: [{ type: 'link', attrs: { href: YOUTUBE } }] },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: `보기 ${YOUTUBE}` }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: YOUTUBE, marks: [{ type: 'bold' }] }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'https://example.com/a' }] },
      ],
    });
    const blocks = editor.state.doc.content.content;
    expect(embedOfTextblock(blocks[0])?.provider).toBe('youtube');
    expect(embedOfTextblock(blocks[1])?.provider).toBe('youtube');
    expect(embedOfTextblock(blocks[2])).toBeNull();
    expect(embedOfTextblock(blocks[3])).toBeNull();
    expect(embedOfTextblock(blocks[4])).toBeNull();
  });
});

describe('임베드 붙여넣기', () => {
  it('빈 단락에 YouTube 주소 → 임베드 노드, 커서는 다음 단락', () => {
    const editor = makeEditor();
    const tr = embedPasteTransaction(editor.state, `  ${YOUTUBE}\n`);
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);
    expect(docJson(editor).content?.[0]).toEqual({
      type: 'embed',
      attrs: { provider: 'youtube', url: YOUTUBE },
    });
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('다른 사이트 주소, 글이 있는 단락, 여러 줄은 받지 않는다(링크 붙여넣기에 맡긴다)', () => {
    const editor = makeEditor();
    expect(embedPasteTransaction(editor.state, 'https://example.com/x')).toBeNull();
    expect(embedPasteTransaction(editor.state, `${YOUTUBE}\n${YOUTUBE}`)).toBeNull();
    typeText(editor, '글');
    expect(embedPasteTransaction(editor.state, YOUTUBE)).toBeNull();
  });
});

describe('임베드 Enter', () => {
  it('지원 주소만 있는 단락 끝에서 Enter → 임베드 노드와 새 단락', () => {
    const editor = makeEditor();
    typeText(editor, 'https://codesandbox.io/s/abc123');
    expect(pressEnter(editor)).toBe(true);
    expect(blockTypes(editor).slice(0, 2)).toEqual(['embed', 'paragraph']);
    expect(docJson(editor).content?.[0]?.attrs).toEqual({
      provider: 'codesandbox',
      url: 'https://codesandbox.io/s/abc123',
    });
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('다른 주소면 보통 Enter다(단락 나누기)', () => {
    const editor = makeEditor();
    typeText(editor, 'https://example.com');
    pressEnter(editor);
    expect(blockTypes(editor).slice(0, 2)).toEqual(['paragraph', 'paragraph']);
    expect(docJson(editor).content?.[0]?.content?.[0]?.text).toBe('https://example.com');
  });
});

describe('리뷰 6.3 중요 2: 체크 규칙은 지금 항목만 바꾼다', () => {
  function listEditor(items: string[]) {
    return makeEditor(null, {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: items.map((text) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
          })),
        },
      ],
    });
  }

  it('항목 셋 중 셋째(빈 항목)에서 [ ] → 앞 두 항목은 글머리 그대로, 셋째만 체크 항목', () => {
    const editor = listEditor(['a', 'b', '']);
    // 셋째 항목의 빈 단락 안으로
    editor.commands.setTextSelection(editor.state.doc.content.size - 3);
    typeText(editor, '[ ] ');
    // 끝의 빈 단락은 trailingNode가 더한 것이다
    const blocks = (docJson(editor).content ?? []).filter((block) => block.type !== 'paragraph');
    expect(blocks.map((block) => block.type)).toEqual(['bulletList', 'taskList']);
    expect(blocks[0]?.content?.map((item) => item.content?.[0]?.content?.[0]?.text)).toEqual([
      'a',
      'b',
    ]);
    expect(blocks[1]?.content?.[0]).toMatchObject({ type: 'taskItem', attrs: { checked: false } });
  });

  it('첫 항목에서 [x] → 첫 항목만 체크 항목, 나머지는 글머리 목록', () => {
    const editor = listEditor(['', '둘째']);
    editor.commands.setTextSelection(3);
    typeText(editor, '[x] ');
    const blocks = (docJson(editor).content ?? []).filter((block) => block.type !== 'paragraph');
    expect(blocks.map((block) => block.type)).toEqual(['taskList', 'bulletList']);
    expect(blocks[0]?.content?.[0]).toMatchObject({ type: 'taskItem', attrs: { checked: true } });
    expect(blocks[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('둘째');
  });
});

describe('리뷰 6.3 중요 3: 표 셀 안에서는 $$ 규칙이 돌지 않는다', () => {
  it('셀의 빈 단락에서 $$ 다음 공백은 글자 그대로다', async () => {
    const request = vi.fn();
    const editor = makeEditor(request, {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }],
            },
          ],
        },
      ],
    });
    editor.commands.setTextSelection(4);
    typeText(editor, '$$ ');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request).not.toHaveBeenCalled();
    expect(editor.state.doc.textContent).toBe('$$ ');
  });
});
