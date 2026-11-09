// 명령 목록 (재건 3단계 D9: "슬래시 메뉴와 같은 목록 컴포넌트, 다른 트리거")
// - 슬래시 메뉴와 명령 팔레트가 같이 쓴다. 고른 칸(selected)과 키 조작은 부르는 쪽이 정한다.
// - 칸마다 아이콘, 이름, 단축키 표기를 보인다. 고른 칸이 보이도록 스크롤한다.

import { useEffect, useRef } from 'react';
import { classNames } from '@/editor/ui/class-names';
import { formatKey, keyFor, type Platform } from './keymap';
import type { EditorCommand } from './registry';

export interface CommandListProps {
  commands: readonly EditorCommand[];
  selected: number;
  platform: Platform;
  onSelect: (command: EditorCommand) => void;
  onHover: (index: number) => void;
  emptyText: string;
  // 목록 요소 id(입력 칸의 aria-controls가 가리킨다)
  listId?: string;
}

// 방향키로 고른 칸을 옮긴다. 끝에서 반대쪽 끝으로 돈다
export function moveSelection(current: number, delta: number, length: number): number {
  if (length === 0) return 0;
  return (current + delta + length) % length;
}

export function CommandList(props: CommandListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // 고른 칸이 목록 밖이면 보이게 한다
  useEffect(() => {
    const item = listRef.current?.children[props.selected] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [props.selected]);

  if (props.commands.length === 0) {
    return <p className="px-3 py-2 text-sm text-text-secondary">{props.emptyText}</p>;
  }

  return (
    <ul ref={listRef} id={props.listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
      {props.commands.map((command, index) => {
        const Icon = command.icon;
        const key = keyFor(command, props.platform);
        const active = index === props.selected;
        return (
          <li
            key={command.id}
            id={props.listId ? `${props.listId}-${index}` : undefined}
            role="option"
            aria-selected={active}
          >
            <button
              type="button"
              // 누를 때 에디터 포커스를 빼앗지 않는다(슬래시 메뉴)
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => props.onHover(index)}
              onClick={() => props.onSelect(command)}
              className={classNames(
                'flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm',
                active ? 'bg-bg-card text-text-primary' : 'text-text-secondary',
              )}
            >
              <Icon size={16} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{command.title}</span>
              {key && (
                <kbd className="shrink-0 font-mono text-xs text-text-secondary">
                  {formatKey(key, props.platform)}
                </kbd>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
