// 이미지 라이브러리 상세 (재건 5단계 D12)
// - 1024px 이상: 격자 오른쪽 패널(variant 'panel'). 좁은 화면: 어두운 배경 위 시트(variant 'sheet').
//   폰은 아래 시트, 640px 이상은 오른쪽 시트다. Esc와 배경 누르기로 닫는다.
// - 보이는 것: 큰 미리보기, 형식·크기·폭×높이·올린 때, 변형 목록, 쓰는 글(에디터 링크), 주소 복사(마크다운 `![](…)` 한 줄).
// - 지우기: 쓰지 않는 새 자산만. 정리 API를 먼저 시험 실행하고 결과를 대화상자로 보인다. 확인하면 실제로 지운다.
//   정리 API는 지우기 직전에 모든 글을 다시 훑는다. legacy는 "main 병합 뒤 정리" 문구만 보인다(PURGE_LEGACY_ASSETS = false).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AdminAssetItem } from '@/lib/server/admin-assets';
import { errorMessage, redirectIfUnauthorized, useAdmin } from '../app-context';
import { editPath } from '../router';
import { ConfirmDialog, dangerButton, formatFullDate, secondaryButton } from '../ui';
import { formatBytes, isDeletableAsset, markdownImageLine } from './asset-filter';
import { assetsApi } from './assets-api';

// 시험 실행 결과에 따라 여는 대화상자
type DeleteDialog =
  | { kind: 'confirm'; storagePath: string }
  | { kind: 'kept' }
  | { kind: 'not-target' }
  | null;

// 확인 단추가 없는 알림 대화상자. ConfirmDialog와 모양이 같다. "닫기" 하나만 둔다
function NoticeDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current();
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
        <div className="mt-5 flex justify-end">
          <button ref={closeRef} type="button" className={secondaryButton} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// 미리보기 주소. 패널 폭에는 w960이면 충분하다. 없으면 w1600, 그다음 원본
function previewUrlOf(item: AdminAssetItem): string {
  const byName = new Map(item.variants.map((variant) => [variant.name, variant.url]));
  return byName.get('w960') ?? byName.get('w1600') ?? item.url;
}

function sizeText(width: number | null, height: number | null): string {
  return width !== null && height !== null ? `${width}×${height}` : '—';
}

export function AssetDetail({
  item,
  variant,
  onClose,
  onDeleted,
}: {
  item: AdminAssetItem;
  variant: 'panel' | 'sheet';
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const { list, showToast } = useAdmin();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialog, setDialog] = useState<DeleteDialog>(null);

  const isVideo = item.kind === 'video';
  const line = markdownImageLine(item.url);
  const deletable = isDeletableAsset(item);

  // Esc로 닫는다. 대화상자가 열려 있거나 지우는 중이면 듣지 않는다(대화상자가 Esc를 받는다)
  const latest = useRef({ onClose, blocked: false });
  latest.current = { onClose, blocked: dialog !== null || deleting };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.blocked) latest.current.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // 시트는 열 때 닫기 단추에 초점을 둔다. 패널은 격자의 초점을 그대로 둔다
  useEffect(() => {
    if (variant === 'sheet') closeRef.current?.focus();
  }, [variant]);

  // 복사에 실패하면 글자 칸을 골라 둔다. 사용자가 직접 복사한다
  useEffect(() => {
    if (!copyFailed) return;
    fallbackRef.current?.focus();
    fallbackRef.current?.select();
  }, [copyFailed]);

  // 글 ID → 지금 제목 (목록을 받기 전이거나 목록에 없으면 ID를 보인다)
  const users = useMemo(() => {
    const titles = new Map<string, string>();
    if (list.phase === 'ready')
      for (const entry of list.items) titles.set(entry.id, entry.title || '(제목 없음)');
    return item.usedBy.map((id) => ({ id, title: titles.get(id) ?? null }));
  }, [item.usedBy, list]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line);
      setCopyFailed(false);
      showToast('success', '마크다운 한 줄을 복사했습니다.');
    } catch {
      setCopyFailed(true);
    }
  };

  // 1단계: 시험 실행. 결과에 따라 대화상자를 연다
  const startDelete = async () => {
    setChecking(true);
    try {
      const result = await assetsApi.purge([item.id], true);
      const candidate = result.candidates.find((entry) => entry.id === item.id);
      if (candidate) setDialog({ kind: 'confirm', storagePath: candidate.storagePath });
      else if (result.kept.some((entry) => entry.id === item.id)) setDialog({ kind: 'kept' });
      else setDialog({ kind: 'not-target' });
    } catch (error) {
      if (!redirectIfUnauthorized(error)) showToast('error', errorMessage(error));
    } finally {
      setChecking(false);
    }
  };

  // 2단계: 실제로 지운다. 서버가 지우기 직전에 다시 훑으므로 그사이 쓰인 자산은 남는다
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const result = await assetsApi.purge([item.id], false);
      if (result.deleted.includes(item.id)) {
        setDialog(null);
        onDeleted(item.id);
        showToast('success', isVideo ? '영상을 지웠습니다.' : '이미지를 지웠습니다.');
        return;
      }
      setDialog(null);
      if (result.kept.some((entry) => entry.id === item.id)) {
        showToast('info', '그사이 글이 이 파일을 써서 지우지 않았습니다.');
      } else {
        showToast('error', '정리 대상이 아니어서 지우지 않았습니다.');
      }
    } catch (error) {
      if (!redirectIfUnauthorized(error)) showToast('error', errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  const body = (
    <>
      <div className="flex items-center gap-2">
        <h2 id={titleId} className="mr-auto text-base font-semibold">
          {isVideo ? '영상 정보' : '이미지 정보'}
        </h2>
        <button
          ref={closeRef}
          type="button"
          className="flex size-8 items-center justify-center rounded-md text-lg text-text-secondary hover:bg-bg-card hover:text-text-primary"
          aria-label="상세 닫기"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {/* 큰 미리보기 */}
      <div className="mt-3 overflow-hidden rounded-md border border-border bg-bg-card">
        {!item.url ? (
          <p className="px-3 py-10 text-center text-sm text-text-secondary">
            업로드를 끝내지 않은 파일입니다.
          </p>
        ) : isVideo ? (
          // 블로그 영상은 화면 녹화라 자막 파일이 없다
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={item.url}
            controls
            preload="metadata"
            className="max-h-[50vh] w-full bg-black"
          />
        ) : (
          <img
            src={previewUrlOf(item)}
            alt=""
            decoding="async"
            className="max-h-[50vh] w-full object-contain"
          />
        )}
      </div>

      {/* 형식·크기 */}
      <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-text-secondary">형식</dt>
        <dd className="break-all">{item.contentType}</dd>
        <dt className="text-text-secondary">크기</dt>
        <dd className="tabular-nums">{formatBytes(item.bytes)}</dd>
        <dt className="text-text-secondary">폭×높이</dt>
        <dd className="tabular-nums">{sizeText(item.width, item.height)}</dd>
        <dt className="text-text-secondary">올린 때</dt>
        <dd>{formatFullDate(item.uploadedAt) || '—'}</dd>
        <dt className="text-text-secondary">구분</dt>
        <dd>
          {item.legacy ? 'legacy(옛 원본)' : '새 자산'}
          {item.status === 'pending' ? ' · 업로드 미완료' : ''}
        </dd>
        <dt className="text-text-secondary">ID</dt>
        <dd className="break-all font-mono text-xs leading-5 text-text-secondary">{item.id}</dd>
      </dl>

      {/* 변형 목록 */}
      <section aria-labelledby={`${titleId}-variants`} className="mt-4">
        <h3 id={`${titleId}-variants`} className="text-sm font-semibold">
          변형
        </h3>
        {item.variants.length === 0 ? (
          <p className="mt-1 text-sm text-text-secondary">변형이 없습니다. 원본만 있습니다.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm tabular-nums">
            {item.variants.map((entry) => (
              <li key={entry.name}>
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  <span className="font-medium">{entry.name}</span>
                  <span className="text-text-secondary">
                    {' '}
                    · {entry.width}×{entry.height} · {formatBytes(entry.bytes)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 쓰는 글 */}
      <section aria-labelledby={`${titleId}-users`} className="mt-4">
        <h3 id={`${titleId}-users`} className="text-sm font-semibold">
          쓰는 글 <span className="font-normal text-text-secondary">{users.length}</span>
        </h3>
        {users.length === 0 ? (
          <p className="mt-1 text-sm text-text-secondary">쓰는 글이 없습니다.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {users.map((user) => (
              <li key={user.id} className="min-w-0 truncate">
                {user.title !== null ? (
                  <a href={editPath(user.id)} className="text-text-primary hover:underline">
                    {user.title}
                  </a>
                ) : (
                  <span className="font-mono text-xs text-text-secondary">{user.id}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 주소 복사 */}
      <section className="mt-4">
        <button
          type="button"
          className={secondaryButton}
          disabled={!item.url}
          onClick={() => void copy()}
        >
          주소 복사
        </button>
        {copyFailed && (
          <label className="mt-2 block text-xs text-text-secondary">
            복사하지 못했습니다. 아래 칸에서 직접 복사하세요.
            <input
              ref={fallbackRef}
              type="text"
              readOnly
              value={line}
              onFocus={(event) => event.target.select()}
              className="mt-1 h-9 w-full rounded-md border border-border bg-bg-app px-2 font-mono text-xs text-text-primary focus:border-brand focus:outline-none"
            />
          </label>
        )}
      </section>

      {/* 지우기 */}
      <section className="mt-5 border-t border-border pt-4 text-sm">
        {deletable ? (
          <button
            type="button"
            className={dangerButton}
            disabled={checking || deleting}
            onClick={() => void startDelete()}
          >
            {checking ? '확인 중…' : '지우기'}
          </button>
        ) : item.legacy && item.usedBy.length === 0 ? (
          <p className="text-text-secondary">legacy 자산은 main 병합 뒤에 정리합니다.</p>
        ) : item.status === 'pending' ? (
          <p className="text-text-secondary">
            업로드를 끝내지 않은 파일입니다. 정리 작업이 24시간 뒤에 지웁니다.
          </p>
        ) : (
          <p className="text-text-secondary">글이 쓰는 동안은 지울 수 없습니다.</p>
        )}
      </section>
    </>
  );

  // 대화상자는 body에 그린다. 패널(sticky)·시트 안의 겹침 순서에 갇히지 않게 한다
  const dialogNode =
    dialog?.kind === 'confirm' ? (
      <ConfirmDialog
        title={isVideo ? '영상 지우기' : '이미지 지우기'}
        confirmLabel="지우기"
        danger
        busy={deleting}
        onCancel={() => setDialog(null)}
        onConfirm={() => void confirmDelete()}
      >
        <p>{isVideo ? '이 영상을 지웁니다.' : '이 이미지를 지웁니다.'} 되돌릴 수 없습니다.</p>
        <p className="break-all font-mono text-xs">{dialog.storagePath}</p>
      </ConfirmDialog>
    ) : dialog?.kind === 'kept' ? (
      <NoticeDialog title="지우지 않습니다" onClose={() => setDialog(null)}>
        <p>지금 이 파일을 쓰는 글이 있습니다. 글에서 빼고 저장한 뒤 다시 하세요.</p>
      </NoticeDialog>
    ) : dialog?.kind === 'not-target' ? (
      <NoticeDialog title="아직 정리 대상이 아닙니다" onClose={() => setDialog(null)}>
        <p>
          정리 API가 이 파일을 지울 대상으로 고르지 않았습니다. 쓰지 않게 된 기록이 아직 없습니다.
        </p>
      </NoticeDialog>
    ) : null;

  return (
    <>
      {variant === 'panel' ? (
        <aside
          aria-labelledby={titleId}
          className="sticky top-8 max-h-[calc(100vh-4rem)] w-[340px] shrink-0 overflow-y-auto rounded-lg border border-border bg-bg-surface p-4"
        >
          {body}
        </aside>
      ) : (
        <div
          className="fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="상세 닫기"
            tabIndex={-1}
            onClick={onClose}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-lg border-t border-border bg-bg-surface p-4 shadow-popover sm:inset-y-0 sm:left-auto sm:max-h-none sm:w-[400px] sm:rounded-none sm:border-l sm:border-t-0">
            {body}
          </div>
        </div>
      )}
      {dialogNode && createPortal(dialogNode, document.body)}
    </>
  );
}
