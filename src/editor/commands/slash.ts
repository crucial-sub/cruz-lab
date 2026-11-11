// 슬래시 메뉴 확장 (재건 3단계 D9: "@tiptap/suggestion. / 뒤 글자로 title과 id를 거른다. 방향키·Enter·Esc. 최근 사용 순")
// - 레지스트리 중 inSlash이고 그 자리에서 쓸 수 있는 명령만 보인다.
// - 코드 블록과 인라인 코드 안에서는 열지 않는다(`/`는 글자다).
// - 고르면 `/질의` 글자를 지우고 명령을 실행한다. 실행과 최근 사용 기록은 onRun(EditorApp)이 한다.

import { Extension, type Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import { Suggestion } from '@tiptap/suggestion';
import { filterCommands } from './filter';
import type { Platform } from './keymap';
import { isCommandAvailable, type EditorCommand } from './registry';
import { SlashMenu, type SlashMenuHandle, type SlashMenuProps } from './SlashMenu';

export interface SlashCommandOptions {
  getCommands: () => readonly EditorCommand[];
  getRecent: () => readonly string[];
  onRun: (command: EditorCommand, editor: Editor) => void;
  platform: Platform;
}

// 메뉴에 보이는 최대 칸 수
const SLASH_LIMIT = 12;

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',
  // Enter·방향키를 목록·기본 키맵보다 먼저 받는다
  priority: 1100,

  addOptions() {
    return { getCommands: () => [], getRecent: () => [], onRun: () => {}, platform: 'other' };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<EditorCommand, EditorCommand>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.spec.code) return false;
          return !state.doc.rangeHasMark(range.from, range.to, state.schema.marks.code);
        },
        items: ({ query, editor }) =>
          filterCommands(
            options
              .getCommands()
              .filter((command) => command.inSlash && isCommandAvailable(command, editor)),
            query,
            options.getRecent(),
          ).slice(0, SLASH_LIMIT),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          options.onRun(props, editor);
        },
        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle, SlashMenuProps> | null = null;
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, {
                editor: props.editor,
                props: {
                  items: props.items,
                  command: props.command,
                  clientRect: props.clientRect,
                  platform: options.platform,
                },
              });
              document.body.appendChild(renderer.element);
            },
            onUpdate: (props) => {
              renderer?.updateProps({
                items: props.items,
                command: props.command,
                clientRect: props.clientRect,
                platform: options.platform,
              });
            },
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') return false;
              return renderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit: () => {
              renderer?.element.remove();
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
