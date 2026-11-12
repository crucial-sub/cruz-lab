// 첫 화면: 새 글 · 오늘 기록 · 이어 쓰기 · 목록 (재건 5단계 D10, 계획 문서 5.3·5.4)
// - 맨 위: 알림 띠(문제가 있을 때만, D11). 그 아래 "새 글"·"오늘 기록"(노트를 만들고 바로 에디터).
// - "이어 쓰기": 최근에 고친 초안과 "발행 뒤 변경 있음" 글 최대 3편(제목 · 고친 때 · 기기). 빈 초안은 넣지 않는다.
//   한 번 누르면 에디터가 열리고 본문에 커서가 간다. 마우스를 올리면 에디터 청크를 미리 받는다.
// - 목록: GET /api/admin/posts 한 번(앱이 받아 둔다). 거르기·검색·정렬은 브라우저에서 즉시(list-filter.ts).
// - 빈 초안 칩: 그것만 보이고 "모두 지우기"(개수와 확인). 지우기 직전에 목록을 다시 받아 아직 빈 초안인 것만 지운다.
// - 키: Shift+N 새 글, / 검색 칸. 입력 칸 안에서는 듣지 않는다. 공개 페이지에는 전역 키를 두지 않는다.
// - 여러 편 삭제(2026-11-12): 고른 글 ∩ 보이는 글을 확인 뒤 기존 DELETE로 3편씩 지운다(bulk-select.ts).
//   탭·종류·검색·빈 초안 칩이 바뀌면 고른 것을 비운다. 실패한 글은 고른 채로 남기고 결과 창에 보인다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from '@/editor/state/api';
import { deleteOfflineDraft, listOfflineDraftIds } from '@/editor/state/offline-store';
import type { AdminListItem } from '@/lib/server/admin-entries';
import { getCategoryLabel } from '@/lib/taxonomy';
import { appApi } from '../api';
import { errorMessage, redirectIfUnauthorized, useAdmin } from '../app-context';
import { preloadEditor } from '../editor-loader';
import { AlertBar } from '../layout/AlertBar';
import { editPath } from '../router';
import {
  ConfirmDialog,
  formatShortDate,
  NoticeDialog,
  primaryButton,
  secondaryButton,
} from '../ui';
import {
  BulkDeleteBody,
  BulkResultBody,
  DesktopSelectionBar,
  MobileSelectionFooter,
  MobileSelectionHeader,
} from './BulkControls';
import {
  canConfirmBulkDelete,
  headerCheckState,
  runBulkDelete,
  selectionScopeKey,
  summarizeForDelete,
  toggleAllVisible,
  toggleId,
} from './bulk-select';
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
  // 여러 편 삭제 확인. 연 때의 대상(보이는 순서)을 지닌다. 지우는 동안 목록이 줄어도 그대로다
  | { kind: 'bulk-delete'; targets: AdminListItem[] }
  // 여러 편 삭제의 일부 실패 결과
  | {
      kind: 'bulk-result';
      deleted: number;
      failed: Array<{ id: string; title: string; message: string }>;
    }
  | null;

// API 오류의 HTTP 상태가 이것인지
function isApiStatus(error: unknown, status: number): boolean {
  return error instanceof ApiClientError && error.status === status;
}

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
  const {
    route,
    list,
    loadList,
    replaceSearch,
    patchItem,
    removeItem,
    showToast,
    registerLeaveGuard,
  } = useAdmin();
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
  // 여러 편 고르기: 고른 글 ID, 휴대폰 선택 모드, 확인 칸, 지우는 진행
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  // 여러 편을 지우는 중인지(떠나기 가드가 읽는다). 로그인 화면으로 보내기 전에 바로 끄려고 ref로도 둔다
  const bulkRunningRef = useRef(false);
  const bulkRunning = bulkProgress !== null;

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
  // 카테고리 표시 이름: 서버가 목록에 준 값(데이터 분류, 5단계 D1). 없으면 코드 기본값·key
  const categoryLabel = useMemo(() => {
    const labels = new Map<string, string>();
    for (const item of items)
      if (item.category && item.categoryLabel) labels.set(item.category, item.categoryLabel);
    return (key: string) => labels.get(key) ?? getCategoryLabel(key);
  }, [items]);
  const filtered = useMemo(
    () => filterEntries(items, { ...state, q: query }, categoryLabel, emptyOnly),
    [items, state, query, emptyOnly],
  );
  const continueItems = useMemo(() => pickContinueItems(items), [items]);

  // 빈 초안이 없어지면 칩 보기를 끈다
  useEffect(() => {
    if (emptyOnly && filtered.emptyCount === 0) setEmptyOnly(false);
  }, [emptyOnly, filtered.emptyCount]);

  // 보이는 글이 바뀌는 조건(탭·종류·검색·빈 초안 칩)이 바뀌면 고른 것을 비운다. 정렬은 비우지 않는다
  const scopeKey = selectionScopeKey(state, query, emptyOnly);
  useEffect(() => {
    setSelected(new Set());
  }, [scopeKey]);

  // 지울 대상은 고른 글 중 지금 보이는 글이다(보이는 순서)
  const visibleIds = useMemo(() => filtered.items.map((item) => item.id), [filtered.items]);
  const selectedItems = useMemo(
    () => filtered.items.filter((item) => selected.has(item.id)),
    [filtered.items, selected],
  );
  const selectedSummary = useMemo(() => summarizeForDelete(selectedItems), [selectedItems]);
  const header = headerCheckState(selected, visibleIds);

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

  const openBulkDelete = () => {
    if (selectedItems.length === 0) return;
    setAcknowledged(false);
    setDialog({ kind: 'bulk-delete', targets: selectedItems });
  };

  // 여러 편 지우기: 기존 DELETE를 3편씩 부른다. 지운 글마다 서버가 한 편 삭제와 같은 부수 처리를 한다
  // (출간 기록 줄, 캐시 비우기, 백업 알림, 자산 usedBy). 일부가 실패해도 끝까지 한다
  const confirmBulkDelete = async (targets: AdminListItem[]) => {
    const titles = new Map(targets.map((item) => [item.id, item.title || '(제목 없음)']));
    setBusy(true);
    setBulkProgress({ done: 0, total: targets.length });
    bulkRunningRef.current = true;
    try {
      const result = await runBulkDelete(
        targets.map((item) => item.id),
        (id) => appApi.deleteEntry(id),
        {
          isFatal: (error) => isApiStatus(error, 401),
          // 그사이 다른 곳에서 지운 글은 지운 것으로 센다
          isAlreadyGone: (error) => isApiStatus(error, 404),
          describe: errorMessage,
          onProgress: (done, total) => setBulkProgress({ done, total }),
          onDeleted: (id) => {
            removeItem(id);
            // 지운 글의 이 기기 보관 초안은 열 곳이 없다. 함께 지운다(한 편 삭제와 같다)
            void deleteOfflineDraft(id).catch(() => {});
          },
        },
      );
      bulkRunningRef.current = false;
      setAlertsKey((key) => key + 1);
      if (result.fatal !== null) {
        setDialog(null);
        if (!redirectIfUnauthorized(result.fatal)) showToast('error', errorMessage(result.fatal));
        return;
      }
      // 실패한 글만 고른 채로 남긴다
      setSelected(new Set(result.failed.map((item) => item.id)));
      if (result.failed.length === 0) {
        setDialog(null);
        setSelectMode(false);
        showToast('success', `${result.deleted.length}편을 지웠습니다.`);
      } else {
        setDialog({
          kind: 'bulk-result',
          deleted: result.deleted.length,
          failed: result.failed.map((item) => ({
            ...item,
            title: titles.get(item.id) ?? '(제목 없음)',
          })),
        });
      }
    } finally {
      bulkRunningRef.current = false;
      setBusy(false);
      setBulkProgress(null);
    }
  };

  // 여러 편을 지우는 동안 다른 화면으로 가거나 탭을 닫지 않게 한다.
  // 떠나면 결과 창(실패한 글)이 사라지고, 아직 보내지 않은 글은 지워지지 않는다
  useEffect(() => {
    if (!bulkRunning) return;
    registerLeaveGuard(async () => {
      if (!bulkRunningRef.current) return true;
      showToast('info', '여러 편을 지우는 중입니다. 끝난 뒤에 이동하세요.');
      return false;
    });
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!bulkRunningRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      registerLeaveGuard(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [bulkRunning, registerLeaveGuard, showToast]);

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

      <section aria-label="글 목록" className={selectMode ? 'mt-6 pb-24 md:pb-0' : 'mt-6'}>
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
            <>
              {filtered.items.length > 0 && (
                <DesktopSelectionBar
                  summary={selectedSummary}
                  busy={busy}
                  onClear={() => setSelected(new Set())}
                  onDelete={openBulkDelete}
                />
              )}
              {/* 선택 모드에서 맞는 글이 0편이 되어도 "완료"는 남긴다(끌 길이 있어야 한다) */}
              {(filtered.items.length > 0 || selectMode) && (
                <MobileSelectionHeader
                  mode={selectMode}
                  header={header}
                  visibleCount={filtered.items.length}
                  busy={busy}
                  onStart={() => setSelectMode(true)}
                  onDone={() => {
                    setSelectMode(false);
                    setSelected(new Set());
                  }}
                  onToggleAll={() =>
                    setSelected((current) => toggleAllVisible(current, visibleIds))
                  }
                />
              )}
              <EntryTable
                items={filtered.items}
                categoryLabel={categoryLabel}
                now={now}
                actions={{
                  onToggleVisibility: (item) => void toggleVisibility(item),
                  onDelete: (item) => setDialog({ kind: 'delete', item }),
                }}
                selection={{
                  selected,
                  header,
                  mobileMode: selectMode,
                  disabled: busy,
                  onToggle: (id) => setSelected((current) => toggleId(current, id)),
                  onToggleAll: () =>
                    setSelected((current) => toggleAllVisible(current, visibleIds)),
                }}
              />
              {selectMode && (
                <MobileSelectionFooter
                  summary={selectedSummary}
                  busy={busy}
                  onClear={() => setSelected(new Set())}
                  onDelete={openBulkDelete}
                />
              )}
            </>
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
      {dialog?.kind === 'bulk-delete' && (
        <BulkDeleteDialog
          targets={dialog.targets}
          acknowledged={acknowledged}
          busy={busy}
          progress={bulkProgress}
          onAcknowledge={() => setAcknowledged((value) => !value)}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmBulkDelete(dialog.targets)}
        />
      )}
      {dialog?.kind === 'bulk-result' && (
        <NoticeDialog title="일부를 지우지 못했습니다" onClose={() => setDialog(null)}>
          <BulkResultBody deleted={dialog.deleted} failed={dialog.failed} />
        </NoticeDialog>
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

// 여러 편 삭제 확인 창. 요약은 연 때의 대상으로 한 번 만든다
function BulkDeleteDialog({
  targets,
  acknowledged,
  busy,
  progress,
  onAcknowledge,
  onCancel,
  onConfirm,
}: {
  targets: AdminListItem[];
  acknowledged: boolean;
  busy: boolean;
  progress: { done: number; total: number } | null;
  onAcknowledge: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const summary = useMemo(() => summarizeForDelete(targets), [targets]);
  return (
    <ConfirmDialog
      title={`글 ${summary.count}편 삭제`}
      confirmLabel={`${summary.count}편 지우기`}
      danger
      busy={busy}
      busyLabel={progress ? `지우는 중… ${progress.done}/${progress.total}` : '지우는 중…'}
      confirmDisabled={!canConfirmBulkDelete(summary, acknowledged)}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <BulkDeleteBody
        summary={summary}
        acknowledged={acknowledged}
        busy={busy}
        onAcknowledge={onAcknowledge}
      />
    </ConfirmDialog>
  );
}
