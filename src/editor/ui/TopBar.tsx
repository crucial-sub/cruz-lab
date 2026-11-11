// 상단 바 (재건 3단계 D13, M9)
// - 왼쪽 "← 목록", 가운데 저장 상태, 오른쪽 발행 버튼과 ⋯ 메뉴.
// - 메뉴: 보기 모드(편집·소스·미리보기), 명령 팔레트, 공개 페이지 보기, 숨기기/다시 보이기, 초안 버리기, 삭제, 기기 이름, 테마, 로그아웃.
// - 640px보다 좁은 화면(모바일, D12)에서는 발행 버튼이 메타 시트 안에 있다. 상단 바에는 저장 상태만 남는다.

import { useEffect, useRef, useState } from 'react';
import type { EntryStatus } from '@/lib/entry-schema';
import { classNames } from './class-names';

export type ViewMode = 'edit' | 'source' | 'preview';

export interface TopBarProps {
  statusText: string;
  statusTone: 'muted' | 'error' | 'warn';
  onRetrySave: (() => void) | null;
  entryStatus: EntryStatus;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  onPublish: () => void;
  publishing: boolean;
  publicUrl: string | null;
  onToggleVisibility: (() => void) | null;
  onDiscardDraft: (() => void) | null;
  // 이전 발행본 대화상자(5단계 D3). 발행본이 없으면 null
  onOpenRevisions: (() => void) | null;
  onDelete: () => void;
  onDeviceName: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onOpenPalette: () => void;
}

const MODE_LABELS: Record<ViewMode, string> = { edit: '편집', source: '소스', preview: '미리보기' };

const STATUS_LABELS: Record<EntryStatus, string> = {
  draft: '초안',
  published: '발행됨',
  hidden: '숨김',
};

export function TopBar(props: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 메뉴 밖을 누르면 닫는다
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const toneClass =
    props.statusTone === 'error'
      ? 'text-red-400'
      : props.statusTone === 'warn'
        ? 'text-amber-400'
        : 'text-text-secondary';

  const item = (label: string, onClick: () => void, danger = false) => (
    <button
      key={label}
      type="button"
      role="menuitem"
      className={classNames(
        'block w-full px-3 py-2 text-left text-sm hover:bg-bg-card',
        danger ? 'text-red-400' : 'text-text-primary',
      )}
      onClick={() => {
        setMenuOpen(false);
        onClick();
      }}
    >
      {label}
    </button>
  );

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg-surface px-3">
      <a href="/admin" className="shrink-0 text-sm text-text-secondary hover:text-text-primary">
        ← 목록
      </a>
      <span className="hidden rounded-pill border border-border px-2 py-0.5 text-xs text-text-secondary sm:inline">
        {STATUS_LABELS[props.entryStatus]}
      </span>

      <div
        className={classNames('min-w-0 flex-1 truncate text-center text-sm', toneClass)}
        aria-live="polite"
      >
        {props.statusText}
        {props.onRetrySave && (
          <button type="button" className="ml-2 underline" onClick={props.onRetrySave}>
            다시 시도
          </button>
        )}
      </div>

      <div
        className="hidden items-center rounded-md border border-border text-xs md:flex"
        role="tablist"
        aria-label="보기 모드"
      >
        {(['edit', 'source', 'preview'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={props.mode === mode}
            className={classNames(
              'px-2.5 py-1',
              props.mode === mode
                ? 'bg-bg-card text-text-primary'
                : 'text-text-secondary hover:text-text-primary',
            )}
            onClick={() => props.onModeChange(mode)}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-bg-card hover:text-text-primary"
        aria-pressed={props.panelOpen}
        onClick={props.onTogglePanel}
        title="메타 패널"
      >
        메타
      </button>

      <button
        type="button"
        className="hidden rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50 sm:inline-block"
        onClick={props.onPublish}
        disabled={props.publishing}
      >
        {props.publishing ? '발행 중…' : '발행'}
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-lg leading-none text-text-secondary hover:bg-bg-card hover:text-text-primary"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="더 보기"
          onClick={() => setMenuOpen((open) => !open)}
        >
          ⋯
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-md border border-border bg-bg-surface py-1 shadow-popover"
          >
            <div className="px-3 py-1 text-xs text-text-secondary md:hidden">보기 모드</div>
            <div className="md:hidden">
              {(['edit', 'source', 'preview'] as ViewMode[]).map((mode) =>
                item(`${props.mode === mode ? '● ' : ''}${MODE_LABELS[mode]}`, () =>
                  props.onModeChange(mode),
                ),
              )}
              <hr className="my-1 border-border" />
            </div>
            {item('명령 팔레트', props.onOpenPalette)}
            {props.publicUrl &&
              item('공개 페이지 보기', () =>
                window.open(props.publicUrl ?? '', '_blank', 'noopener'),
              )}
            {props.onToggleVisibility &&
              item(
                props.entryStatus === 'hidden' ? '다시 보이기' : '숨기기',
                props.onToggleVisibility,
              )}
            {props.onOpenRevisions && item('이전 발행본', props.onOpenRevisions)}
            {props.onDiscardDraft && item('초안 버리기', props.onDiscardDraft)}
            {item('삭제', props.onDelete, true)}
            <hr className="my-1 border-border" />
            {item('기기 이름', props.onDeviceName)}
            {item('테마 전환', props.onToggleTheme)}
            {item('로그아웃', props.onLogout)}
          </div>
        )}
      </div>
    </header>
  );
}
