// 모바일 툴바 (재건 3단계 D12)
// - 768px보다 좁은 화면에서 에디터에 포커스가 있을 때 키보드 바로 위에 붙는다.
// - 버튼: 굵게, 제목(2·3 순환), 목록, 인용, 이미지, 되돌리기, 메타 열기. 모두 레지스트리 명령이다.
// - 위치는 window.visualViewport의 height·offsetTop으로 맞춘다. visualViewport가 없으면 화면 아래에 붙는다.
// - 버튼을 눌러도 에디터 포커스(와 화면 키보드)를 잃지 않게 pointerdown·mousedown 기본 동작을 막는다.

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { commandById, type EditorCommand } from '@/editor/commands/registry';
import { classNames } from './class-names';

// D12의 버튼 순서
export const MOBILE_COMMAND_IDS = [
  'bold',
  'heading-cycle',
  'bullet-list',
  'blockquote',
  'image',
  'undo',
  'toggle-panel',
] as const;

// 화면 아래에서 키보드 윗변까지의 거리(px). 키보드가 없으면 0
export function keyboardInset(
  innerHeight: number,
  viewport: { height: number; offsetTop: number } | null,
): number {
  if (!viewport) return 0;
  return Math.max(0, Math.round(innerHeight - viewport.height - viewport.offsetTop));
}

export function MobileBar({
  editor,
  commands,
  onRun,
}: {
  editor: Editor;
  commands: readonly EditorCommand[];
  onRun: (command: EditorCommand) => void;
}) {
  const [focused, setFocused] = useState(() => editor.isFocused);
  const [bottom, setBottom] = useState(0);

  // 에디터 포커스를 따라 보이고 숨는다
  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    editor.on('focus', onFocus);
    editor.on('blur', onBlur);
    return () => {
      editor.off('focus', onFocus);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  // 키보드 높이를 따라 위치를 옮긴다
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setBottom(keyboardInset(window.innerHeight, viewport));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  const items = MOBILE_COMMAND_IDS.map((id) => commandById(commands, id)).filter(
    (command): command is EditorCommand => Boolean(command),
  );
  const active =
    useEditorState({
      editor,
      selector: ({ editor: instance }) =>
        items.map((command) => (command.isActive?.(instance) ? 1 : 0)).join(''),
    }) ?? '';

  if (!focused) return null;

  return (
    <div
      className="fixed inset-x-0 z-30 flex items-center justify-around border-t border-border bg-bg-surface px-1 py-1 md:hidden"
      style={{ bottom }}
      role="toolbar"
      aria-label="모바일 서식"
    >
      {items.map((command, index) => {
        const Icon = command.icon;
        return (
          <button
            key={command.id}
            type="button"
            className={classNames(
              'rounded-md p-2.5',
              active[index] === '1' ? 'bg-bg-card text-brand' : 'text-text-secondary',
            )}
            aria-label={command.title}
            onPointerDown={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onRun(command)}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
