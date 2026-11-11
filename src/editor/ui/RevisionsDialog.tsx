// 이전 발행본 대화상자 (재건 5단계 D3)
// - 리비전 목록(판 번호 · 발행 시각 · 제목) → 하나를 고르면 미리보기(공개 렌더와 같은 미리보기 모드) →
//   "초안으로 가져오기". 가져오기는 EditorApp이 한다(저장을 비우고, 충돌 검사, 다시 열기).
// - 지금 발행본과 같은 판은 "지금 발행본" 표시를 붙이고 가져오기 단추를 끈다(초안 버리기와 같다).
// - 넓은 화면은 왼쪽 목록 + 오른쪽 미리보기, 좁은 화면은 목록 → 미리보기 한 화면씩.

import { useEffect, useId, useRef, useState } from 'react';
import { apiRequest, ApiClientError, redirectToLogin } from '@/editor/state/api';
import type { EntryContent } from '@/lib/entry-schema';
import { classNames } from './class-names';
import { PreviewMode } from './PreviewMode';

interface RevisionSummary {
  revision: number;
  title: string;
  slug: string;
  publishedAt: string | null;
  wordCount: number | null;
  current: boolean;
}

interface RevisionDetail {
  revision: number;
  current: boolean;
  publishedAt: string | null;
  content: EntryContent;
}

export const revisionsApi = {
  list: (id: string) =>
    apiRequest<{ items: RevisionSummary[]; currentRevision: number | null }>(
      'GET',
      `/api/admin/posts/${encodeURIComponent(id)}/revisions`,
    ),
  get: (id: string, revision: number) =>
    apiRequest<RevisionDetail>('GET', `/api/admin/posts/${encodeURIComponent(id)}/revisions/${revision}`),
  restore: (id: string, revision: number, baseVersion: number) =>
    apiRequest<{ version: number; revision: number; updatedAt: string }>(
      'POST',
      `/api/admin/posts/${encodeURIComponent(id)}/revisions/${revision}/restore`,
      { baseVersion },
    ),
};

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 났습니다.';
}

export function RevisionsDialog({
  entryId,
  busy,
  onRestore,
  onClose,
}: {
  entryId: string;
  busy: boolean;
  onRestore: (revision: number) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<RevisionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    revisionsApi
      .list(entryId)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        // 지금 발행본이 아닌 가장 최근 판을 먼저 고른다(없으면 첫 판)
        const first = result.items.find((item) => !item.current) ?? result.items[0];
        if (first) setSelected(first.revision);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        if (loadError instanceof ApiClientError && loadError.status === 401) redirectToLogin();
        else setError(messageOf(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    revisionsApi
      .get(entryId, selected)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setDetailError(messageOf(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [entryId, selected]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-bg-surface shadow-popover">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-text-primary">
            이전 발행본
          </h2>
          <button ref={closeRef} type="button" className="min-h-9 px-2 text-sm text-text-secondary hover:text-text-primary" onClick={onClose} disabled={busy}>
            닫기
          </button>
        </div>

        {error && <p className="p-4 text-sm text-red-400">판 목록을 받지 못했습니다. {error}</p>}
        {!error && items === null && <p className="p-4 text-sm text-text-secondary">불러오는 중…</p>}
        {!error && items?.length === 0 && <p className="p-4 text-sm text-text-secondary">발행한 판이 없습니다.</p>}

        {!error && items && items.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <ul className="max-h-40 shrink-0 overflow-y-auto border-b border-border md:max-h-none md:w-64 md:border-b-0 md:border-r" aria-label="판 목록">
              {items.map((item) => (
                <li key={item.revision}>
                  <button
                    type="button"
                    className={classNames(
                      'block w-full px-4 py-2 text-left text-sm hover:bg-bg-card',
                      selected === item.revision ? 'bg-bg-card' : '',
                    )}
                    aria-current={selected === item.revision ? 'true' : undefined}
                    onClick={() => setSelected(item.revision)}
                  >
                    <span className="font-semibold text-text-primary">{item.revision}판</span>
                    {item.current && <span className="ml-2 text-xs text-emerald-500">지금 발행본</span>}
                    <span className="block text-xs text-text-secondary">{formatTime(item.publishedAt)}</span>
                    <span className="block truncate text-xs text-text-secondary">{item.title || '(제목 없음)'}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {detailError && <p className="text-sm text-red-400">이 판을 받지 못했습니다. {detailError}</p>}
                {!detailError && !detail && <p className="text-sm text-text-secondary">불러오는 중…</p>}
                {detail && (
                  <>
                    <h3 className="text-2xl font-extrabold text-text-primary">{detail.content.title || '(제목 없음)'}</h3>
                    <p className="mt-1 text-xs text-text-secondary">
                      {detail.revision}판 · {formatTime(detail.publishedAt)} · /{detail.content.slug}
                      {detail.content.category ? ` · ${detail.content.category}` : ''}
                      {detail.content.tags.length > 0 ? ` · #${detail.content.tags.join(' #')}` : ''}
                    </p>
                    {detail.content.description && <p className="mt-2 text-sm text-text-secondary">{detail.content.description}</p>}
                    <div className="mt-4 border-t border-border pt-4">
                      <PreviewMode markdown={detail.content.markdown} />
                    </div>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
                <p className="mr-auto text-xs text-text-secondary">
                  가져오면 지금 초안이 이 판의 내용으로 바뀝니다. 발행본은 그대로입니다. 되돌리려면 초안 버리기를 쓰세요.
                </p>
                <button
                  type="button"
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                  disabled={busy || !detail || detail.current}
                  onClick={() => detail && onRestore(detail.revision)}
                >
                  {busy ? '가져오는 중…' : detail?.current ? '지금 발행본입니다' : '초안으로 가져오기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
