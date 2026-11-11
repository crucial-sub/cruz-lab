// 관리자 앱 공통 화면 조각 (재건 5단계 D10)
// - 단추 클래스, 확인 대화상자, 알림, 행 메뉴(⋯).
// - 에디터의 Dialogs.tsx는 KaTeX를 가져오므로 쓰지 않는다(앱 첫 화면이 에디터 청크·KaTeX를 받지 않게, D9).

import { useEffect, useId, useRef, useState } from 'react';
import { classNames } from '@/editor/ui/class-names';

const buttonBase =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';
export const primaryButton = `${buttonBase} bg-brand text-white hover:bg-brand-hover`;
export const secondaryButton = `${buttonBase} border border-border text-text-primary hover:bg-bg-card`;
export const dangerButton = `${buttonBase} bg-red-600 text-white hover:bg-red-700`;
export const quietButton = `${buttonBase} text-text-secondary hover:bg-bg-card hover:text-text-primary`;

// 확인 대화상자. Esc·바깥 단추로 닫는다
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  // Esc 처리는 최신 값을 ref로 읽는다. 부모가 다시 그려도(새 onCancel) 효과가 다시 돌지 않게 한다
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  // 처음 열 때만 "취소"에 초점을 둔다(Tab으로 옮긴 초점을 되돌리지 않는다)
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-surface p-5 shadow-popover">
        <h2 id={titleId} className="text-lg font-semibold text-text-primary">
          {title}
        </h2>
        <div className="mt-3 space-y-2 text-sm text-text-secondary">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className={secondaryButton}
            onClick={onCancel}
            disabled={busy}
          >
            취소
          </button>
          <button
            type="button"
            className={danger ? dangerButton : primaryButton}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// 입력 대화상자 (분류·연재 화면, 5단계 PR-B). 처음 열 때 첫 입력 칸에 초점을 둔다. Esc·취소로 닫는다
// - 제출은 form submit이다(Enter로 낸다). error는 입력 칸 아래에 보인다
export function FormDialog({
  title,
  children,
  submitLabel,
  busy = false,
  error = null,
  wide = false,
  onSubmit,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  wide?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <form
        ref={formRef}
        className={classNames(
          'max-h-[90vh] w-full overflow-y-auto rounded-lg border border-border bg-bg-surface p-5 shadow-popover',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSubmit();
        }}
      >
        <h2 id={titleId} className="text-lg font-semibold text-text-primary">
          {title}
        </h2>
        <div className="mt-3 space-y-3 text-sm text-text-secondary">{children}</div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? '처리 중…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

// 입력 칸 공통 모양(관리자 앱 폼)
export const inputClass =
  'w-full rounded-md border border-border bg-bg-app px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-brand';

export interface ToastState {
  tone: 'info' | 'success' | 'error';
  message: string;
}

// 아래 가운데 알림. 6초 뒤 닫힌다
export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);
  return (
    <div
      className={classNames(
        'fixed bottom-4 left-1/2 z-40 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-md border bg-bg-surface px-4 py-2 text-sm text-text-primary shadow-popover',
        toast.tone === 'error'
          ? 'border-red-500/60'
          : toast.tone === 'success'
            ? 'border-emerald-500/60'
            : 'border-border',
      )}
      role="status"
    >
      <span>{toast.message}</span>
      <button
        type="button"
        className="text-text-secondary hover:text-text-primary"
        onClick={onClose}
        aria-label="알림 닫기"
      >
        ×
      </button>
    </div>
  );
}

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  href?: string;
  external?: boolean;
  danger?: boolean;
}

// 행 끝 ⋯ 메뉴. 바깥을 누르거나 Esc면 닫는다
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass = (danger?: boolean) =>
    classNames(
      'block w-full px-3 py-2 text-left text-sm hover:bg-bg-card',
      danger ? 'text-red-400' : 'text-text-primary',
    );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg-card hover:text-text-primary"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 min-w-40 overflow-hidden rounded-md border border-border bg-bg-surface py-1 shadow-popover"
        >
          {items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                role="menuitem"
                href={item.href}
                className={itemClass(item.danger)}
                {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={itemClass(item.danger)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// 서울 시각 짧은 표기: 오늘이면 "14:05", 올해면 "11월 9일", 그 밖은 "2025. 3. 31."
export function formatShortDate(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const zone = 'Asia/Seoul';
  const dayOf = (value: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' }).format(value);
  if (dayOf(date) === dayOf(now)) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }
  const yearOf = (value: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric' }).format(value);
  if (yearOf(date) === yearOf(now)) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: zone,
      month: 'long',
      day: 'numeric',
    }).format(date);
  }
  return new Intl.DateTimeFormat('ko-KR', { timeZone: zone, dateStyle: 'medium' }).format(date);
}

// 서울 시각 전체 표기(마우스를 올리면 보이는 title)
export function formatFullDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
