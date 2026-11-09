// 레지스트리 → 단축키 (재건 3단계 D9)
// - RegistryShortcuts: 에디터 범위 명령의 키를 Tiptap addKeyboardShortcuts()로 만든다.
// - createPageKeyHandler: 페이지 범위 명령(저장, 발행, 팔레트, 모드, 패널)의 키를 창 keydown에서 받는다.
//   판정은 prosemirror-keymap의 keydownHandler 하나를 쓴다. 에디터 키맵과 같은 규칙이다.
// - stripCommandKeys: Tiptap 확장이 스스로 거는 명령 키(Mod-Alt-1, Mod-Shift-s 등)를 뺀다.
//   키는 레지스트리에서만 나온다. Enter·Tab·Backspace 같은 구조 키는 그대로 둔다. 스키마는 바꾸지 않는다.

import {
  Extension,
  type AnyExtension,
  type Editor,
  type KeyboardShortcutCommand,
} from '@tiptap/core';
import { keydownHandler } from '@tiptap/pm/keymap';
import { shortcutEntries, type Platform } from './keymap';
import type { EditorCommand } from './registry';

// 확장 이름 → 그 확장이 거는 명령 키. 레지스트리가 같은 명령을 맡는다(Tiptap 3.33.0 기본값)
const COMMAND_KEYS_BY_EXTENSION: Readonly<Record<string, readonly string[]>> = {
  bold: ['Mod-b', 'Mod-B'],
  italic: ['Mod-i', 'Mod-I'],
  strike: ['Mod-Shift-s'],
  code: ['Mod-e'],
  heading: ['Mod-Alt-1', 'Mod-Alt-2', 'Mod-Alt-3', 'Mod-Alt-4', 'Mod-Alt-5', 'Mod-Alt-6'],
  paragraph: ['Mod-Alt-0'],
  blockquote: ['Mod-Shift-b'],
  codeBlock: ['Mod-Alt-c'],
  bulletList: ['Mod-Shift-8'],
  orderedList: ['Mod-Shift-7'],
  taskList: ['Mod-Shift-9'],
  undoRedo: ['Mod-z', 'Shift-Mod-z', 'Mod-y', 'Mod-я', 'Shift-Mod-я'],
  // 하드 브레이크는 Shift-Enter(구조 키)만 남긴다. Mod-Enter는 레지스트리에 없다
  hardBreak: ['Mod-Enter'],
};

// 확장(과 그 안의 확장 묶음)에서 명령 키를 뺀다. 옵션·이름·우선순위는 그대로다
export function stripCommandKeys<T extends AnyExtension>(extension: T): T {
  const keys = COMMAND_KEYS_BY_EXTENSION[extension.name];
  const hasChildren = Boolean(extension.config.addExtensions);
  if (!keys && !hasChildren) return extension;
  return extension.extend({
    ...(keys
      ? {
          addKeyboardShortcuts(this: { parent?: () => Record<string, KeyboardShortcutCommand> }) {
            const parent = this.parent?.() ?? {};
            return Object.fromEntries(
              Object.entries(parent).filter(([key]) => !keys.includes(key)),
            );
          },
        }
      : {}),
    ...(hasChildren
      ? {
          addExtensions(this: { parent?: () => AnyExtension[] }) {
            return (this.parent?.() ?? []).map(stripCommandKeys);
          },
        }
      : {}),
  }) as T;
}

export interface RegistryShortcutsOptions {
  // 지금의 명령 목록(덮어쓰기 적용 뒤). 함수라서 화면 동작을 나중에 이어도 된다
  getCommands: () => readonly EditorCommand[];
  platform: Platform;
}

// 에디터 범위 명령의 키. 구조 키보다 먼저 받도록 우선순위를 높인다
export const RegistryShortcuts = Extension.create<RegistryShortcutsOptions>({
  name: 'registryShortcuts',
  priority: 200,

  addOptions() {
    return { getCommands: () => [], platform: 'other' };
  },

  addKeyboardShortcuts() {
    const commands = this.options.getCommands().filter((command) => command.scope === 'editor');
    const shortcuts: Record<string, KeyboardShortcutCommand> = {};
    for (const { key, id } of shortcutEntries(commands, this.options.platform)) {
      const command = commands.find((item) => item.id === id);
      if (command) shortcuts[key] = ({ editor }) => command.run(editor as Editor);
    }
    return shortcuts;
  },
});

// 페이지 범위 명령의 키 판정기. 받은 키면 명령을 실행하고 true. 이벤트 기본 동작은 부르는 쪽이 막는다
export function createPageKeyHandler(
  commands: readonly EditorCommand[],
  platform: Platform,
  getEditor: () => Editor | null,
): (event: KeyboardEvent) => boolean {
  const bindings: Record<string, () => boolean> = {};
  const pageCommands = commands.filter((command) => command.scope === 'page');
  for (const { key, id } of shortcutEntries(pageCommands, platform)) {
    const command = pageCommands.find((item) => item.id === id);
    if (command) {
      bindings[key] = () => {
        const editor = getEditor();
        // 화면 동작 명령은 에디터를 쓰지 않는다. 에디터가 없을 때도 돈다
        return command.run(editor as Editor);
      };
    }
  }
  const handler = keydownHandler(bindings);
  // keydownHandler는 (view, event)를 받고 바인딩에 view.state·view.dispatch를 넘긴다.
  // 바인딩이 그것을 쓰지 않으므로 빈 자리값을 넘긴다
  const placeholderView = { state: null, dispatch: () => {} } as never;
  return (event) => handler(placeholderView, event);
}

// 창 keydown 리스너. 조합 중, 이미 처리된 이벤트, 키를 누르고 있어 자동 반복되는 이벤트(발행이 두 번 돈다, 리뷰 6.3 중요 1)는 버린다.
// 받은 키는 브라우저 기본 동작(Mod-S 페이지 저장 등)을 막는다
export function createPageKeyListener(
  handle: (event: KeyboardEvent) => boolean,
): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.isComposing || event.defaultPrevented || event.repeat) return;
    if (handle(event)) event.preventDefault();
  };
}
