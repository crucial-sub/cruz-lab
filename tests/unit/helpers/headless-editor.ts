// 헤드리스 Tiptap 에디터 도우미 (재건 3단계 T5 테스트)
// - DOM 없이(element: null) 에디터를 만들고, 상태 플러그인(history, appendTransaction, 입력 규칙)을 붙인다.
// - 글자 입력은 입력 규칙 플러그인의 handleTextInput을 직접 부른다. 규칙이 받지 않으면 글자를 그대로 넣는다.
//   브라우저의 한 글자 입력과 같은 경로다.
// - 키(Enter, Mod-Shift-2 등)는 가짜 keydown 이벤트를 플러그인 순서대로 handleKeyDown에 넘긴다(뷰의 someProp과 같은 순서).

import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import type { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

// DOM 없는 에디터를 만든다. 내용은 JSON만 받는다(문자열은 HTML 파서가 window를 요구한다)
export function makeHeadlessEditor(extensions: Extensions, content: JSONContent = EMPTY_DOC) {
  const editor = new Editor({ element: null, extensions, content });
  (editor as unknown as { editorState: unknown }).editorState = editor.state.reconfigure({
    plugins: editor.extensionManager.plugins,
  });
  return editor;
}

type TextInputHandler = (view: EditorView, from: number, to: number, text: string) => boolean;
type KeyDownHandler = (view: EditorView, event: KeyboardEvent) => boolean;

// 입력 규칙 플러그인들(확장마다 따로 있을 수 있다)
function inputRulePlugins(editor: Editor): Plugin[] {
  return editor.state.plugins.filter(
    (plugin) => (plugin.spec as { isInputRules?: boolean }).isInputRules,
  );
}

// 커서 자리에 글자를 한 자씩 친다
export function typeText(editor: Editor, text: string) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = inputRulePlugins(editor).some((plugin) => {
      const handler = plugin.props.handleTextInput as TextInputHandler | undefined;
      return handler ? handler.call(plugin, editor.view, from, to, char) : false;
    });
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
  }
}

// Enter를 누른다(입력 규칙과 키맵이 플러그인 순서대로 받는다)
export function pressEnter(editor: Editor): boolean {
  return pressKey(editor, { key: 'Enter', keyCode: 13 });
}

// prosemirror-keymap과 같은 규칙으로 Mod가 Meta인지 정한다(Node의 navigator.platform)
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform);

export interface KeySpec {
  key: string;
  keyCode: number;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  // 맥에서 ⌃(Mod가 아닌 Ctrl)
  ctrl?: boolean;
}

// 가짜 keydown 이벤트(prosemirror-keymap이 읽는 칸만 채운다)
export function fakeKeyEvent(spec: KeySpec): KeyboardEvent {
  return {
    key: spec.key,
    keyCode: spec.keyCode,
    code: '',
    shiftKey: Boolean(spec.shift),
    altKey: Boolean(spec.alt),
    metaKey: Boolean(spec.mod) && IS_MAC,
    ctrlKey: (Boolean(spec.mod) && !IS_MAC) || Boolean(spec.ctrl),
    isComposing: false,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as KeyboardEvent;
}

// 키를 누른다. 뷰가 플러그인 순서대로 handleKeyDown을 부르는 것과 같다. 받은 곳이 있으면 true
export function pressKey(editor: Editor, spec: KeySpec): boolean {
  const event = fakeKeyEvent(spec);
  return editor.state.plugins.some((plugin) => {
    const handler = plugin.props.handleKeyDown as KeyDownHandler | undefined;
    return handler ? handler.call(plugin, editor.view, event) : false;
  });
}

// 본문 블록의 노드 이름 목록(구조 확인용)
export function blockTypes(editor: Editor): string[] {
  return (editor.getJSON().content ?? []).map((node) => node.type ?? '');
}

// 테스트에서 읽기 쉬운 문서 JSON 모양(Tiptap 3의 JSONContent는 글자·노드 합집합이라 칸을 바로 읽지 못한다)
export interface DocJson {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: DocJson[];
}

// 문서 JSON
export function docJson(editor: Editor): DocJson {
  return editor.getJSON() as DocJson;
}
