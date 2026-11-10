// 첫 화면: 새 글 · 오늘 기록 · 이어 쓰기 · 목록 (재건 5단계 D10, 계획 문서 5.3·5.4)
// - 맨 위: 알림 띠(문제가 있을 때만, D11). 그 아래 "새 글"·"오늘 기록"(노트를 만들고 바로 에디터).
// - "이어 쓰기": 최근에 고친 초안과 "발행 뒤 변경 있음" 글 최대 3편(제목 · 고친 때 · 기기). 빈 초안은 넣지 않는다.
//   한 번 누르면 에디터가 열리고 본문에 커서가 간다. 마우스를 올리면 에디터 청크를 미리 받는다.
// - 목록: GET /api/admin/posts 한 번(앱이 받아 둔다). 거르기·검색·정렬은 브라우저에서 즉시(list-filter.ts).
// - 빈 초안 칩: 그것만 보이고 "모두 지우기"(개수와 확인). 지우기 직전에 목록을 다시 받아 아직 빈 초안인 것만 지운다.
// - 키: Shift+N 새 글, / 검색 칸. 입력 칸 안에서는 듣지 않는다. 공개 페이지에는 전역 키를 두지 않는다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteOfflineDraft, listOfflineDraftIds } from '@/editor/state/offline-store';
import type { AdminListItem } from '@/lib/server/admin-entries';
import { getCategoryLabel } from '@/lib/taxonomy';
import { appApi } from '../api';
import { errorMessage, redirectIfUnauthorized, useAdmin } from '../app-context';
import { preloadEditor } from '../editor-loader';
import { AlertBar } from '../layout/AlertBar';
import { editPath } from '../router';
import { ConfirmDialog, formatShortDate, primaryButton, secondaryButton } from '../ui';
import { EntryFilters } from './EntryFilters';
import { EntryTable, KIND_LABELS } from './EntryTable';
import {
  filterEntries,
  parseListState,
  pickContinueItems,
  serializeListState,
  type ListState,
} from './list-filter';

type PendingDialog =
  | { kind: 'delete'; item: AdminListItem }
  | { kind: 'clear-empty'; ids: string[] }
  | null;

// 열린 모달(메뉴 시트·확인 창)이 있는지. 있으면 첫 화면 키를 듣지 않는다
function hasOpenModal(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

// 키 입력이 글자 입력 칸 안인지
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

export function HomeScreen({ onCreate }: { onCreate: (kind: 'post' | 'note') => void }) {
  const { route, list, loadList, replaceSearch, patchItem, removeItem, showToast } = useAdmin();
  const search = route.name === 'home' ? route.search : '';
  const state = useMemo(() => parseListState(search), [search]);
  // 검색 칸 글자는 화면이 가진다(주소에는 앞뒤 공백을 뗀 값을 쓴다)
  const [query, setQuery] = useState(state.q);
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [dialog, setDialog] = useState<PendingDialog>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // 알림 띠를 다시 받게 하는 값(숨김·삭제 뒤 캐시 비우기 결과가 새로 생긴다)
  const [alertsKey, setAlertsKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // 주소의 검색어가 화면 밖에서 바뀌면(메뉴 "글", 뒤로 가기) 검색 칸을 맞춘다.
  // 입력 중인 끝 공백은 주소에 쓰지 않으므로, 앞뒤 공백을 뗀 값이 같으면 그대로 둔다
  useEffect(() => {
    setQuery((current) => (current.trim() === state.q ? current : state.q));
  }, [state.q]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // "14:05 · 11월 9일" 표시를 1분마다 다시 계산한다
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const applyState = useCallback(
    (patch: Partial<ListState>) => {
      replaceSearch(serializeListState({ ...state, q: query, ...patch }));
    },
    [query, replaceSearch, state],
  );

  const changeQuery = (value: string) => {
    setQuery(value);
    replaceSearch(serializeListState({ ...state, q: value }));
  };

  const items = list.phase === 'ready' ? list.items : [];
  const filtered = useMemo(
    () => filterEntries(items, { ...state, q: query }, getCategoryLabel, emptyOnly),
    [items, state, query, emptyOnly],
  );
  const continueItems = useMemo(() => pickContinueItems(items), [items]);

  // 빈 초안이 없어지면 칩 보기를 끈다
  useEffect(() => {
    if (emptyOnly && filtered.emptyCount === 0) setEmptyOnly(false);
  }, [emptyOnly, filtered.emptyCount]);

  // Shift+N 새 글, / 검색 칸
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (dialog || event.isComposing || isTypingTarget(event.target) || hasOpenModal()) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // 한글 입력 상태에서도 같은 자리의 키로 듣는다(Shift+N은 'ㅜ'가 된다)
      if (event.shiftKey && (event.code === 'KeyN' || event.key.toLowerCase() === 'n')) {
        event.preventDefault();
        onCreate('post');
      } else if (!event.shiftKey && (event.key === '/' || event.code === 'Slash')) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, onCreate]);

  const toggleVisibility = useCallback(
    async (item: AdminListItem) => {
      const visible = item.status === 'hidden';
      // 응답이 늦을 수 있다. 누른 것을 먼저 알린다
      showToast('info', visible ? '다시 보이게 하는 중…' : '숨기는 중…');
      try {
        const result = await appApi.setVisibility(item.id, visible);
        patchItem(item.id, { status: result.status });
        if (result.purge === 'failed') {
          // 캐시 비우기가 실패하면 공개 주소가 한동안 이전 응답을 보인다. 알림 띠에도 생긴다
          showToast(
            'error',
            visible
              ? '다시 보이게 했지만 캐시 비우기가 실패해 잠시 404가 보일 수 있습니다.'
              : '숨겼지만 캐시 비우기가 실패해 잠시 이전 본문이 보일 수 있습니다.',
          );
        } else {
          showToast('success', visible ? '다시 보입니다.' : '숨겼습니다. 공개 주소는 404입니다.');
        }
        setAlertsKey((key) => key + 1);
      } catch (error) {
        if (!redirectIfUnauthorized(error)) showToast('error', errorMessage(error));
      }
    },
    [patchItem, showToast],
  );

  const confirmDelete = async (item: AdminListItem) => {
    setBusy(true);
    try {
      await appApi.deleteEntry(item.id);
      removeItem(item.id);
      // 지운 글의 이 기기 보관 초안은 열 곳이 없다. 함께 지운다(에디터의 삭제와 같다)
      await deleteOfflineDraft(item.id).catch(() => {});
      showToast('success', `「${item.title || '(제목 없음)'}」을 지웠습니다.`);
      setDialog(null);
      setAlertsKey((key) => key + 1);
    } catch (error) {
      if (!redirectIfUnauthorized(error)) showToast('error', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  // 빈 초안 모두 지우기: 목록을 다시 받아 아직 빈 초안인 것만 지운다(그사이 쓴 글을 지우지 않게)
  // - 이 기기의 오프라인 보관함에 있는 글은 지우지 않는다. 서버에는 비어 있어도 보내지 못한 내용이 있다
  const clearEmpty = async (ids: string[]) => {
    setBusy(true);
    let deleted = 0;
    try {
      const fresh = await loadList(true);
      if (!fresh) throw new Error('목록을 다시 받지 못해 지우지 않았습니다.');
      const stillEmpty = new Set(fresh.filter((item) => item.isEmptyDraft).map((item) => item.id));
      const offline = new Set(await listOfflineDraftIds().catch(() => [] as string[]));
      let kept = 0;
      for (const id of ids) {
        if (!stillEmpty.has(id)) continue;
        if (offline.has(id)) {
          kept += 1;
          continue;
        }
        await appApi.deleteEntry(id);
        removeItem(id);
        deleted += 1;
      }
      const changed = ids.length - deleted - kept;
      showToast(
        'success',
        `빈 초안 ${deleted}편을 지웠습니다.${changed > 0 ? ` ${changed}편은 그사이 내용이 생겨 남겼습니다.` : ''}${
          kept > 0 ? ` ${kept}편은 이 기기에 보내지 않은 내용이 있어 남겼습니다.` : ''
        }`,
      );
      setDialog(null);
      setEmptyOnly(false);
    } catch (error) {
      if (redirectIfUnauthorized(error)) return;
      showToast(
        'error',
        `${deleted > 0 ? `${deleted}편을 지운 뒤 ` : ''}멈췄습니다 · ${errorMessage(error)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <AlertBar refreshKey={alertsKey} />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">글</h1>
        <button
          type="button"
          className={`${primaryButton} hidden lg:inline-flex`}
          onClick={() => onCreate('post')}
          title="Shift+N"
          onMouseEnter={preloadEditor}
        >
          새 글
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => onCreate('note')}
          onMouseEnter={preloadEditor}
        >
          오늘 기록
        </button>
      </div>

      {continueItems.length > 0 && (
        <section aria-labelledby="continue-heading" className="mt-5">
          <h2 id="continue-heading" className="mb-2 text-sm font-semibold text-text-secondary">
            이어 쓰기
          </h2>
          <ul className="grid gap-2 sm:grid-cols-3">
            {continueItems.map((item) => (
              <li key={item.id}>
                <a
                  href={editPath(item.id)}
                  onMouseEnter={preloadEditor}
                  onFocus={preloadEditor}
                  className="block h-full rounded-md border border-border bg-bg-surface px-3 py-2.5 text-text-primary hover:border-emerald-500/60"
                >
                  <span className="block truncate font-medium">{item.title || '(제목 없음)'}</span>
                  <span className="mt-1 block truncate text-xs text-text-secondary">
                    {KIND_LABELS[item.kind]} · {item.status === 'draft' ? '초안' : '발행 뒤 변경'} ·{' '}
                    {formatShortDate(item.updatedAt, now)}
                    {item.draftDevice ? ` · ${item.draftDevice}` : ''}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="글 목록" className="mt-6">
        <EntryFilters
          ref={searchRef}
          state={state}
          query={query}
          counts={filtered.counts}
          emptyCount={filtered.emptyCount}
          emptyOnly={emptyOnly}
          onChange={(patch) => {
            setEmptyOnly(false);
            applyState(patch);
          }}
          onQueryChange={changeQuery}
          onToggleEmpty={() => setEmptyOnly((value) => !value)}
        />

        {emptyOnly && filtered.items.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg-surface px-3 py-2 text-sm">
            <span className="mr-auto text-text-secondary">
              제목·설명·본문이 모두 빈 초안 {filtered.items.length}편입니다.
            </span>
            <button
              type="button"
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              onClick={() =>
                setDialog({ kind: 'clear-empty', ids: filtered.items.map((item) => item.id) })
              }
            >
              모두 지우기
            </button>
          </div>
        )}

        <div className="mt-3">
          {list.phase === 'ready' ? (
            <EntryTable
              items={filtered.items}
              categoryLabel={getCategoryLabel}
              now={now}
              actions={{
                onToggleVisibility: (item) => void toggleVisibility(item),
                onDelete: (item) => setDialog({ kind: 'delete', item }),
              }}
            />
          ) : list.phase === 'error' ? (
            <div className="py-12 text-center text-sm text-text-secondary">
              <p>목록을 받지 못했습니다. {list.message}</p>
              <button
                type="button"
                className={`${secondaryButton} mt-3`}
                onClick={() => void loadList(true)}
              >
                다시 받기
              </button>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-text-secondary">목록을 불러오는 중…</p>
          )}
        </div>
      </section>

      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="글 삭제"
          confirmLabel="삭제"
          danger
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmDelete(dialog.item)}
        >
          <p>
            「{dialog.item.title || '(제목 없음)'}」을 지웁니다. 초안·발행본·이전 판을 함께
            지웁니다. 되돌릴 수 없습니다.
          </p>
          {dialog.item.status !== 'draft' && <p>공개 주소는 404가 됩니다.</p>}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'clear-empty' && (
        <ConfirmDialog
          title="빈 초안 모두 지우기"
          confirmLabel={`${dialog.ids.length}편 지우기`}
          danger
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => void clearEmpty(dialog.ids)}
        >
          <p>제목·설명·본문이 모두 빈 초안 {dialog.ids.length}편을 지웁니다. 되돌릴 수 없습니다.</p>
          <p>지우기 직전에 목록을 다시 받아, 그사이 내용이 생긴 초안은 남깁니다.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
