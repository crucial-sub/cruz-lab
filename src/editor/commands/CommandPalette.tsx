// 명령 팔레트 (재건 3단계 D9: Mod+K. 슬래시 메뉴와 같은 목록 컴포넌트, 다른 트리거)
// - 부르는 쪽이 지금 쓸 수 있는 명령만 넘긴다(편집 모드가 아니면 페이지 범위 명령만).
// - 입력 칸에 글자를 치면 거른다. 방향키·Enter로 고르고 Esc나 바깥을 누르면 닫는다.
// - 한글 조합 중 Enter는 고르지 않는다(조합을 끝내는 Enter다).

import { useMemo, useState } from 'react';
import { CommandList, moveSelection } from './CommandList';
import { filterCommands } from './filter';
import type { Platform } from './keymap';
import type { EditorCommand } from './registry';

export interface CommandPaletteProps {
  commands: readonly EditorCommand[];
  recent: readonly string[];
  platform: Platform;
  onRun: (command: EditorCommand) => void;
  onClose: () => void;
}

const LIST_ID = 'command-palette-list';

export function CommandPalette(props: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const items = useMemo(
    () => filterCommands(props.commands, query, props.recent),
    [props.commands, props.recent, query],
  );

  const choose = (command: EditorCommand | undefined) => {
    if (!command) return;
    props.onClose();
    props.onRun(command);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
      {/* 바깥(어두운 덮개)을 누르면 닫는다 */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="명령 팔레트 닫기"
        tabIndex={-1}
        onClick={props.onClose}
      />
      <div
        className="relative w-full max-w-md overflow-hidden rounded-lg border border-border bg-bg-surface shadow-popover"
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트"
      >
        <input
          // 열자마자 입력한다
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="placeholder:text-text-secondary/60 w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text-primary focus:outline-none"
          placeholder="명령 찾기"
          value={query}
          role="combobox"
          aria-expanded="true"
          aria-controls={LIST_ID}
          aria-activedescendant={items.length > 0 ? `${LIST_ID}-${selected}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              props.onClose();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelected((current) => moveSelection(current, 1, items.length));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((current) => moveSelection(current, -1, items.length));
            } else if (
              event.key === 'Enter' &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey
            ) {
              event.preventDefault();
              choose(items[selected]);
            }
          }}
        />
        <CommandList
          listId={LIST_ID}
          commands={items}
          selected={selected}
          platform={props.platform}
          onSelect={choose}
          onHover={setSelected}
          emptyText="맞는 명령이 없습니다"
        />
      </div>
    </div>
  );
}
