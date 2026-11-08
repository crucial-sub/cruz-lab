// 대화상자와 알림 (재건 3단계 D6·D13)
// - Dialog: 공통 틀. ConflictDialog(409), OfflineRestoreDialog(보관함), DeleteDialog(삭제 2회 확인), DeviceDialog(기기 이름).
// - Toast: 아래 가운데 알림. WarningsBanner: 지원하지 않는 HTML 경고 목록.

import { useEffect, useState } from 'react';
import type { ConversionWarning } from '@/editor/markdown';
import type { ConflictInfo } from '@/editor/state/autosave';

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-surface p-5 shadow-popover">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <div className="mt-3 space-y-3 text-sm text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

const buttonBase = 'rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50';
export const primaryButton = `${buttonBase} bg-brand text-white hover:bg-brand-hover`;
export const secondaryButton = `${buttonBase} border border-border text-text-primary hover:bg-bg-card`;
export const dangerButton = `${buttonBase} bg-red-600 text-white hover:bg-red-700`;

function formatWhen(iso: string | null): string {
  if (!iso) return '시각 모름';
  return new Date(iso).toLocaleString('ko-KR');
}

// 409 충돌 (D6): 서버 것 열기 / 내 것으로 덮기. 내 변경은 클립보드로 복사할 수 있다
export function ConflictDialog({
  conflict,
  localMarkdown,
  onTakeServer,
  onKeepLocal,
}: {
  conflict: ConflictInfo;
  localMarkdown: () => string;
  onTakeServer: () => void;
  onKeepLocal: () => void;
}) {
  // 복사 결과: 성공·실패를 버튼 글자로 알린다(리뷰 6.2 지적 22)
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(localMarkdown());
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <Dialog title="다른 곳에서 먼저 저장했습니다">
      <p>
        서버 초안: 버전 {conflict.version} · {conflict.device ?? '기기 모름'} ·{' '}
        {formatWhen(conflict.updatedAt)}
      </p>
      <p>어느 쪽을 남길지 고르세요. 자동으로 덮지 않습니다.</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className={secondaryButton} onClick={copy}>
          {copied === 'done'
            ? '복사됨'
            : copied === 'failed'
              ? '복사 실패'
              : '내 변경 복사(마크다운)'}
        </button>
        <button type="button" className={secondaryButton} onClick={onTakeServer}>
          서버 것 열기
        </button>
        <button type="button" className={primaryButton} onClick={onKeepLocal}>
          내 것으로 덮기
        </button>
      </div>
    </Dialog>
  );
}

// 보관함 복원 (D6): 이어 쓰기 / 버리기
export function OfflineRestoreDialog({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog title="이 기기에 보관한 초안이 있습니다">
      <p>{formatWhen(savedAt)}에 오프라인으로 보관했습니다.</p>
      <div className="flex gap-2 pt-1">
        <button type="button" className={secondaryButton} onClick={onDiscard}>
          버리기
        </button>
        <button type="button" className={primaryButton} onClick={onRestore}>
          보관한 것 이어 쓰기
        </button>
      </div>
    </Dialog>
  );
}

// 삭제 (D13): 제목을 보이고 "삭제"를 두 번 누른다. 두 번째는 빨간색이다
export function DeleteDialog({
  title,
  onCancel,
  onConfirm,
  busy,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <Dialog title="글 삭제" onClose={onCancel}>
      <p>
        <strong className="text-text-primary">{title || '(제목 없음)'}</strong> 글을 지웁니다.
        되돌릴 수 없습니다.
      </p>
      <div className="flex gap-2 pt-1">
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={busy}>
          취소
        </button>
        {armed ? (
          <button type="button" className={dangerButton} onClick={onConfirm} disabled={busy}>
            {busy ? '삭제 중…' : '정말 삭제'}
          </button>
        ) : (
          <button type="button" className={secondaryButton} onClick={() => setArmed(true)}>
            삭제
          </button>
        )}
      </div>
    </Dialog>
  );
}

// 기기 이름 (D6): 저장 요청의 device 값
export function DeviceDialog({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(value);
  return (
    <Dialog title="기기 이름" onClose={onCancel}>
      <p>초안을 저장한 기기를 구별하는 이름입니다. 60자까지입니다.</p>
      <input
        className="w-full rounded-md border border-border bg-bg-app px-2.5 py-1.5 text-sm text-text-primary"
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && onSave(name)}
      />
      <div className="flex gap-2 pt-1">
        <button type="button" className={secondaryButton} onClick={onCancel}>
          취소
        </button>
        <button type="button" className={primaryButton} onClick={() => onSave(name)}>
          저장
        </button>
      </div>
    </Dialog>
  );
}

export interface ToastState {
  tone: 'info' | 'success' | 'error';
  message: string;
  link?: { href: string; label: string } | null;
}

// 알림: 링크가 없으면 6초 뒤 사라진다
export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (toast.link) return;
    const timer = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  const tone =
    toast.tone === 'error'
      ? 'border-red-500/60'
      : toast.tone === 'success'
        ? 'border-brand/60'
        : 'border-border';
  return (
    <div
      className={`fixed bottom-4 left-1/2 z-40 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-md border ${tone} bg-bg-surface px-4 py-2 text-sm text-text-primary shadow-popover`}
      role="status"
    >
      <span>{toast.message}</span>
      {toast.link && (
        <a
          href={toast.link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand"
        >
          {toast.link.label}
        </a>
      )}
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

// 지원하지 않는 HTML 등 변환 경고 (D8·D10)
export function WarningsBanner({
  warnings,
  onClose,
}: {
  warnings: ConversionWarning[];
  onClose: () => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <div
      className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
      role="alert"
    >
      <div className="flex items-start justify-between gap-2">
        <strong>지원하지 않는 내용 {warnings.length}개는 텍스트로 남습니다.</strong>
        <button type="button" onClick={onClose} aria-label="경고 닫기">
          ×
        </button>
      </div>
      <ul className="mt-1 list-disc pl-4">
        {warnings.slice(0, 8).map((warning, index) => (
          <li key={index}>
            {warning.message}: <code className="break-all">{warning.detail.slice(0, 80)}</code>
          </li>
        ))}
        {warnings.length > 8 && <li>… 그 밖 {warnings.length - 8}개</li>}
      </ul>
    </div>
  );
}
