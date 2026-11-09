// 슬래시 메뉴 화면 (재건 3단계 D9)
// - `/` 뒤 글자로 거른 명령 목록을 커서 아래에 띄운다. 위치는 suggestion의 clientRect다.
// - 방향키·Enter·Tab·Esc는 slash.ts가 이 컴포넌트의 onKeyDown으로 넘긴다. 한글 조합 중 Enter는 받지 않는다.

import { forwardRef, useImperativeHandle, useLayoutEffect, useState } from 'react';
import { CommandList, moveSelection } from './CommandList';
import type { Platform } from './keymap';
import type { EditorCommand } from './registry';

export interface SlashMenuProps {
  items: EditorCommand[];
  command: (item: EditorCommand) => void;
  clientRect: (() => DOMRect | null) | null | undefined;
  platform: Platform;
}

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const MENU_WIDTH = 288;
const MENU_MAX_HEIGHT = 300;

// 커서 아래(자리가 없으면 위)에 메뉴를 둔다. 화면 밖으로 나가지 않게 자른다
function menuPosition(rect: DOMRect | null): { left: number; top: number } {
  if (!rect) return { left: 16, top: 64 };
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
  const below = rect.bottom + 6;
  const top =
    below + MENU_MAX_HEIGHT > window.innerHeight
      ? Math.max(8, rect.top - MENU_MAX_HEIGHT - 6)
      : below;
  return { left, top };
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  function SlashMenu(props, ref) {
    const [selected, setSelected] = useState(0);
    const [position, setPosition] = useState(() => menuPosition(props.clientRect?.() ?? null));

    // 질의가 바뀌면 첫 칸을 고른다. 위치도 다시 잡는다
    useLayoutEffect(() => {
      setSelected(0);
      setPosition(menuPosition(props.clientRect?.() ?? null));
    }, [props.items, props.clientRect]);

    useImperativeHandle(ref, () => ({
      onKeyDown(event) {
        if (event.isComposing || props.items.length === 0) return false;
        if (event.key === 'ArrowDown') {
          setSelected((current) => moveSelection(current, 1, props.items.length));
          return true;
        }
        if (event.key === 'ArrowUp') {
          setSelected((current) => moveSelection(current, -1, props.items.length));
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = props.items[selected];
          if (!item) return false;
          props.command(item);
          return true;
        }
        return false;
      },
    }));

    return (
      <div
        className="fixed z-40 overflow-hidden rounded-md border border-border bg-bg-surface shadow-popover"
        style={{ left: position.left, top: position.top, width: MENU_WIDTH }}
        aria-label="슬래시 명령"
      >
        <CommandList
          commands={props.items}
          selected={selected}
          platform={props.platform}
          onSelect={props.command}
          onHover={setSelected}
          emptyText="맞는 명령이 없습니다"
        />
      </div>
    );
  },
);
