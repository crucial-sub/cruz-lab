// 데스크톱 툴바 (재건 3단계 D9: "상단 한 줄. 레지스트리의 group별로 그린다")
// - 블록·마크·넣기 묶음의 에디터 범위 명령을 그린다. 표 명령은 표 안에서만 보인다(isAvailable).
// - 활성 표시는 useEditorState로 읽는다. 값이 바뀔 때만 다시 그린다(키 입력마다 EditorApp 전체를 그리지 않는다, 2.2 #5).
// - 버튼을 눌러도 에디터 선택을 잃지 않게 mousedown 기본 동작을 막는다.

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Fragment } from 'react';
import { formatKey, keyFor, type Platform } from '@/editor/commands/keymap';
import { isCommandAvailable, type EditorCommand } from '@/editor/commands/registry';
import { classNames } from './class-names';

const TOOLBAR_GROUPS: ReadonlyArray<EditorCommand['group']> = ['block', 'mark', 'insert'];

// 툴바에 그리는 명령(순서는 레지스트리 순서)
export function toolbarCommands(commands: readonly EditorCommand[]): EditorCommand[] {
  return commands.filter(
    (command) =>
      TOOLBAR_GROUPS.includes(command.group) &&
      command.scope === 'editor' &&
      command.inToolbar !== false,
  );
}

export function Toolbar({
  editor,
  commands,
  platform,
  onRun,
}: {
  editor: Editor;
  commands: readonly EditorCommand[];
  platform: Platform;
  onRun: (command: EditorCommand) => void;
}) {
  const visible = toolbarCommands(commands);
  // 명령마다 "쓸 수 있음·활성" 두 글자로 줄인 문자열. 같으면 다시 그리지 않는다
  const flags =
    useEditorState({
      editor,
      selector: ({ editor: instance }) =>
        visible
          .map(
            (command) =>
              `${isCommandAvailable(command, instance) ? 1 : 0}${command.isActive?.(instance) ? 1 : 0}`,
          )
          .join(''),
    }) ?? '';

  return (
    <div
      className="hidden h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-bg-surface px-3 md:flex"
      role="toolbar"
      aria-label="서식"
    >
      {visible.map((command, index) => {
        const available = flags[index * 2] === '1';
        const active = flags[index * 2 + 1] === '1';
        if (!available) return null;
        const previous = visible[index - 1];
        const key = keyFor(command, platform);
        const Icon = command.icon;
        return (
          <Fragment key={command.id}>
            {previous && previous.group !== command.group && (
              <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            )}
            <button
              type="button"
              className={classNames(
                'rounded shrink-0 p-1.5 hover:bg-bg-card hover:text-text-primary',
                active ? 'bg-bg-card text-brand' : 'text-text-secondary',
              )}
              aria-pressed={command.isActive ? active : undefined}
              aria-label={command.title}
              title={key ? `${command.title} (${formatKey(key, platform)})` : command.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onRun(command)}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
