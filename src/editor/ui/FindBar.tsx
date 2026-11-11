// 찾기·바꾸기 막대 (재건 5단계 D7)
// - 편집 모드에서 Mod+F(명령 'find')가 연다. 소스·미리보기 모드는 브라우저 찾기 그대로다(명령이 false를 돌려준다).
// - 찾기 칸: 입력하는 대로 커서 뒤의 첫 결과를 고른다. Enter 다음, Shift+Enter 이전. 찾은 수 "2 / 5".
// - 선택: 대소문자 구분(Aa), 정규식(.*). 바꾸기 칸: Enter·"바꾸기"는 지금 결과를 바꾸고 다음으로, "모두 바꾸기"는 한 번에.
// - Esc(막대 안 어디에 포커스가 있어도)·닫기 단추로 닫는다. 닫으면 강조를 지우고 에디터에 포커스를 돌려준다.
// - 결과를 고르면 그 자리로 스크롤한다(포커스가 막대에 있으면 ProseMirror가 스크롤하지 않는다).
// - 막대의 단추에 포커스가 있을 때 Mod+Z·Mod+Shift+Z(Mod+Y)는 에디터를 되돌린다("모두 바꾸기" 직후, 리뷰 B3).
//   글자 칸 안에서는 브라우저가 그 칸의 글자를 되돌린다(지금처럼).
// - 열려 있을 때 Mod+F를 다시 누르면 찾기 칸에 포커스를 둔다(focusToken).

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { classNames } from './class-names';
import {
  applyQuery,
  buildQuery,
  clearQuery,
  describeMatches,
  EMPTY_FIND_OPTIONS,
  goToMatch,
  matchStats,
  replaceEvery,
  replaceOne,
  revealSelection,
  selectionIsMatch,
  selectionSearchText,
  type FindOptions,
} from './find';

const inputClass =
  'min-w-0 flex-1 rounded-md border border-border bg-bg-app px-2 py-1 text-sm text-text-primary focus:border-brand focus:outline-none';
const iconButton =
  'shrink-0 rounded p-1.5 text-text-secondary hover:bg-bg-card hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40';
const textButton =
  'shrink-0 rounded-md border border-border px-2 py-1 text-xs text-text-primary hover:bg-bg-card disabled:cursor-not-allowed disabled:opacity-40';

export function FindBar({
  editor,
  focusToken,
  onClose,
}: {
  editor: Editor;
  // 값이 바뀌면 찾기 칸에 포커스를 두고 글자를 고른다(열 때, 다시 Mod+F)
  focusToken: number;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<FindOptions>(() => ({
    ...EMPTY_FIND_OPTIONS,
    search: selectionSearchText(editor.state) ?? '',
  }));
  const searchRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // 열 때·다시 Mod+F: 찾기 칸에 포커스. 에디터에 짧은 선택이 있으면 그 글자로 바꾼다
  const firstFocus = useRef(true);
  useEffect(() => {
    // 지금 선택이 방금 찾은 결과면 찾을 글자를 바꾸지 않는다(정규식이 찾은 글자로 바뀌지 않게, 리뷰 B6)
    if (!firstFocus.current && !selectionIsMatch(editor.state)) {
      const picked = selectionSearchText(editor.state);
      if (picked) setOptions((current) => ({ ...current, search: picked }));
    }
    firstFocus.current = false;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [focusToken, editor]);

  // 찾을 글자·선택이 바뀌면 질의를 넣는다. 찾을 글자가 바뀐 때만 결과로 옮긴다
  const lastSearch = useRef<string | null>(null);
  useEffect(() => {
    const moved =
      lastSearch.current !==
      `${options.search}\u0000${options.caseSensitive}\u0000${options.regexp}`;
    lastSearch.current = `${options.search}\u0000${options.caseSensitive}\u0000${options.regexp}`;
    const move = moved && options.search !== '';
    applyQuery(editor, options, move);
    if (move) revealSelection(editor);
  }, [editor, options]);

  // 닫으면(막대가 사라지면) 강조를 지운다
  useEffect(() => () => clearQuery(editor), [editor]);

  // 찾은 수: 문서·선택이 바뀔 때마다 다시 센다(값이 같으면 다시 그리지 않는다)
  const stats =
    useEditorState({
      editor,
      selector: ({ editor: instance }) => {
        const current = optionsRef.current;
        if (!current.search) return '';
        return describeMatches(current, matchStats(instance.state, buildQuery(current)));
      },
    }) ?? '';
  const valid = options.search !== '' && buildQuery(options).valid;

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  // 결과로 옮기고 그 자리를 보인다
  const go = (direction: 'next' | 'prev') => {
    goToMatch(editor, direction);
    revealSelection(editor);
  };
  const replaceAndGo = () => {
    replaceOne(editor);
    revealSelection(editor);
  };

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      go(event.shiftKey ? 'prev' : 'next');
    }
  };

  const onReplaceKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (valid) replaceAndGo();
    }
  };

  // 막대 안 어디서든 Esc는 닫는다(찾기 칸·단추). 막대는 대화형 요소가 아니라 리스너를 DOM에 직접 단다
  const closeRef = useRef(close);
  closeRef.current = close;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const isMac = /Mac|iP(hone|[oa]d)/.test(navigator.platform);
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      // 글자 칸 밖(단추)에서 되돌리기·다시 실행은 에디터로 넘긴다
      const inField = event.target instanceof HTMLInputElement;
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (inField || !mod || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z' || event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) editorRef.current.commands.redo();
        else editorRef.current.commands.undo();
      } else if (!isMac && (key === 'y' || event.code === 'KeyY')) {
        event.preventDefault();
        editorRef.current.commands.redo();
      }
    };
    bar.addEventListener('keydown', onKey);
    return () => bar.removeEventListener('keydown', onKey);
  }, []);

  const toggle = (key: 'caseSensitive' | 'regexp') =>
    setOptions((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 border-b border-border bg-bg-surface px-3 py-2 sm:flex-row sm:items-center"
      ref={barRef}
      role="search"
      aria-label="찾기·바꾸기"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <input
          ref={searchRef}
          className={inputClass}
          value={options.search}
          placeholder="찾기"
          aria-label="찾을 글자"
          onChange={(event) =>
            setOptions((current) => ({ ...current, search: event.target.value }))
          }
          onKeyDown={onSearchKey}
        />
        <span
          className={classNames(
            'w-16 shrink-0 text-center text-xs tabular-nums',
            stats === '정규식 오류' || stats === '없음'
              ? 'text-red-600 dark:text-red-400'
              : 'text-text-secondary',
          )}
          aria-live="polite"
        >
          {stats}
        </span>
        <button
          type="button"
          className={classNames(
            iconButton,
            'font-mono text-xs',
            options.caseSensitive && 'bg-bg-card text-brand',
          )}
          aria-pressed={options.caseSensitive}
          aria-label="대소문자 구분"
          title="대소문자 구분"
          onClick={() => toggle('caseSensitive')}
        >
          Aa
        </button>
        <button
          type="button"
          className={classNames(
            iconButton,
            'font-mono text-xs',
            options.regexp && 'bg-bg-card text-brand',
          )}
          aria-pressed={options.regexp}
          aria-label="정규식"
          title="정규식"
          onClick={() => toggle('regexp')}
        >
          .*
        </button>
        <button
          type="button"
          className={iconButton}
          disabled={!valid}
          aria-label="이전 결과"
          title="이전 결과 (Shift+Enter)"
          onClick={() => go('prev')}
        >
          <ArrowUp size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={iconButton}
          disabled={!valid}
          aria-label="다음 결과"
          title="다음 결과 (Enter)"
          onClick={() => go('next')}
        >
          <ArrowDown size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label="찾기 닫기"
          title="닫기 (Esc)"
          onClick={close}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <input
          className={inputClass}
          value={options.replace}
          placeholder="바꿀 글자"
          aria-label="바꿀 글자"
          onChange={(event) =>
            setOptions((current) => ({ ...current, replace: event.target.value }))
          }
          onKeyDown={onReplaceKey}
        />
        <button type="button" className={textButton} disabled={!valid} onClick={replaceAndGo}>
          바꾸기
        </button>
        <button
          type="button"
          className={textButton}
          disabled={!valid}
          onClick={() => replaceEvery(editor)}
        >
          모두 바꾸기
        </button>
      </div>
    </div>
  );
}
