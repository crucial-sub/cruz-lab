// 이미지 라이브러리 화면 (재건 5단계 D12, 계획 문서 8.4 시나리오 8)
// - 자산 전부를 한 번 받는다(GET /api/admin/assets). 거르기·정렬은 브라우저에서 즉시 한다(asset-filter.ts). 주소에 남기지 않는다.
// - 격자: 정사각 칸, 썸네일 지연 로드, object-fit: cover. 영상 칸은 영상을 받지 않는다(재생 표시와 형식만).
//   한 번에 60칸까지 그리고 "더 보기"가 60칸씩 더한다. legacy 썸네일은 원본(최대 2.64 MB)이라 무겁다.
// - 칸을 누르면 상세(AssetDetail). 1024px 이상은 오른쪽 패널, 그보다 좁으면 시트다.
// - 쓰는 글 제목은 앱이 받아 둔 글 목록으로 잇는다(loadList).
// - 올리기는 없다. 이미지는 에디터에서 넣는다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { classNames } from '@/editor/ui/class-names';
import type { AdminAssetItem } from '@/lib/server/admin-assets';
import { errorMessage, redirectIfUnauthorized, useAdmin } from '../app-context';
import { secondaryButton } from '../ui';
import { AssetDetail } from './AssetDetail';
import {
  ASSET_FILTER_LABELS,
  ASSET_FILTERS,
  ASSET_PAGE_SIZE,
  ASSET_SORT_LABELS,
  countAssetFilters,
  filterAssets,
  formatBytes,
  sliceAssetPages,
  type AssetFilter,
  type AssetSort,
} from './asset-filter';
import { assetsApi } from './assets-api';

const SORTS: readonly AssetSort[] = ['uploaded', 'size'];

const selectClass =
  'h-9 rounded-md border border-border bg-bg-surface px-2 text-sm text-text-primary focus:border-brand focus:outline-none';

// 화면 폭이 조건에 맞는지. 폭이 바뀌면 다시 그린다
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// 격자 칸의 그림. 영상은 받지 않는다. 그림을 읽지 못하면 글자로 알린다
function CellPicture({ item }: { item: AdminAssetItem }) {
  const [failed, setFailed] = useState(false);
  if (item.kind === 'video') {
    const type = item.contentType.split('/')[1] ?? item.contentType;
    return (
      <span className="flex size-full flex-col items-center justify-center gap-1 bg-bg-card text-text-secondary">
        <span aria-hidden="true" className="text-2xl leading-none">
          ▶
        </span>
        <span className="text-xs uppercase">{type}</span>
      </span>
    );
  }
  if (!item.thumbUrl || failed) {
    return (
      <span className="flex size-full items-center justify-center bg-bg-card px-1 text-center text-xs text-text-secondary">
        {item.status === 'pending' ? '업로드 미완료' : '그림을 읽지 못함'}
      </span>
    );
  }
  return (
    <img
      src={item.thumbUrl}
      alt=""
      loading="lazy"
      decoding="async"
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

// 칸의 읽기 이름 (스크린 리더)
function cellLabel(item: AdminAssetItem): string {
  const parts = [item.kind === 'video' ? '영상' : '이미지', formatBytes(item.bytes)];
  if (item.legacy) parts.push('legacy');
  if (item.usedBy.length === 0) parts.push('안 씀');
  else parts.push(`글 ${item.usedBy.length}편이 씀`);
  return parts.join(' · ');
}

export function AssetsScreen() {
  const { loadList } = useAdmin();
  const [items, setItems] = useState<AdminAssetItem[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [sort, setSort] = useState<AssetSort>('uploaded');
  const [pageCount, setPageCount] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  // 상세를 연 칸. 상세를 닫으면 초점을 이 칸으로 돌린다
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(() => {
    setPhase('loading');
    setError(null);
    assetsApi
      .listAssets()
      .then((response) => {
        setItems(response.items);
        setPhase('ready');
      })
      .catch((loadError: unknown) => {
        if (redirectIfUnauthorized(loadError)) return;
        setError(errorMessage(loadError));
        setPhase('error');
      });
  }, []);

  useEffect(() => {
    // 쓰는 글 제목을 잇는 데 글 목록이 필요하다. 이미 받았으면 다시 받지 않는다
    void loadList();
    load();
  }, [loadList, load]);

  const counts = useMemo(() => countAssetFilters(items), [items]);
  const filtered = useMemo(() => filterAssets(items, filter, sort), [items, filter, sort]);
  const page = useMemo(() => sliceAssetPages(filtered, pageCount), [filtered, pageCount]);
  const selected = useMemo(
    () => (selectedId ? (items.find((item) => item.id === selectedId) ?? null) : null),
    [items, selectedId],
  );

  // 거르기·정렬을 바꾸면 첫 60칸부터 다시 그린다
  const changeFilter = (next: AssetFilter) => {
    setFilter(next);
    setPageCount(1);
  };
  const changeSort = (next: AssetSort) => {
    setSort(next);
    setPageCount(1);
  };

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    const trigger = triggerRef.current;
    // 칸이 아직 있으면 초점을 돌린다(지운 칸은 없다)
    if (trigger?.isConnected) trigger.focus();
  }, []);

  const removeAsset = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
  }, []);

  const panelOpen = selected !== null && isDesktop;

  return (
    <div>
      <h1 className="text-xl font-bold">이미지</h1>
      <p className="mt-1 text-sm text-text-secondary">
        글에 넣은 이미지와 영상입니다. 쓰지 않는 새 파일만 지울 수 있습니다.
      </p>

      {phase === 'loading' && (
        <p className="py-12 text-center text-sm text-text-secondary">이미지를 불러오는 중…</p>
      )}
      {phase === 'error' && (
        <div className="py-12 text-center text-sm text-text-secondary">
          <p>이미지 목록을 받지 못했습니다. {error}</p>
          <button type="button" className={`${secondaryButton} mt-3`} onClick={load}>
            다시 받기
          </button>
        </div>
      )}
      {phase === 'ready' && items.length === 0 && (
        <p className="py-12 text-center text-sm text-text-secondary">이미지가 없습니다.</p>
      )}

      {phase === 'ready' && items.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div
              className="flex max-w-full overflow-x-auto rounded-md border border-border text-sm"
              role="tablist"
              aria-label="거르기"
            >
              {ASSET_FILTERS.map((key) => {
                const isSelected = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={classNames(
                      'shrink-0 px-3 py-1.5',
                      isSelected
                        ? 'bg-bg-card font-semibold text-text-primary'
                        : 'text-text-secondary hover:text-text-primary',
                    )}
                    onClick={() => changeFilter(key)}
                  >
                    {ASSET_FILTER_LABELS[key]} <span className="tabular-nums">{counts[key]}</span>
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-1 text-sm text-text-secondary">
              <span>정렬</span>
              <select
                className={selectClass}
                value={sort}
                onChange={(event) => changeSort(event.target.value as AssetSort)}
              >
                {SORTS.map((key) => (
                  <option key={key} value={key}>
                    {ASSET_SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={classNames('mt-4', panelOpen && 'flex items-start gap-6')}>
            <div className="min-w-0 flex-1">
              {filtered.length === 0 ? (
                <p className="py-12 text-center text-sm text-text-secondary">
                  이 거르기에 맞는 파일이 없습니다.
                </p>
              ) : (
                <ul
                  className={classNames(
                    'grid gap-2',
                    panelOpen
                      ? 'grid-cols-3 xl:grid-cols-4'
                      : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6',
                  )}
                >
                  {page.items.map((item) => {
                    const isSelected = item.id === selectedId;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          aria-label={cellLabel(item)}
                          className={classNames(
                            'relative block aspect-square w-full overflow-hidden rounded-md border bg-bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                            isSelected
                              ? 'border-brand ring-2 ring-brand'
                              : 'border-border hover:border-text-secondary',
                          )}
                          onClick={(event) => {
                            if (isSelected) {
                              closeDetail();
                              return;
                            }
                            triggerRef.current = event.currentTarget;
                            setSelectedId(item.id);
                          }}
                        >
                          <CellPicture item={item} />
                          {(item.legacy || item.usedBy.length === 0) && (
                            <span className="pointer-events-none absolute bottom-1 left-1 flex flex-wrap gap-1">
                              {item.legacy && (
                                <span className="rounded-pill bg-black/70 px-1.5 py-0.5 text-[11px] leading-none text-white">
                                  legacy
                                </span>
                              )}
                              {item.usedBy.length === 0 && (
                                <span className="rounded-pill bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-black">
                                  안 씀
                                </span>
                              )}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {page.remaining > 0 && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => setPageCount((count) => count + 1)}
                  >
                    더 보기{' '}
                    <span className="tabular-nums text-text-secondary">{page.remaining}</span>
                  </button>
                  <p className="mt-1 text-xs text-text-secondary">
                    {filtered.length}개 중 {page.items.length}개를 보입니다. 누르면{' '}
                    {Math.min(ASSET_PAGE_SIZE, page.remaining)}개를 더 그립니다.
                  </p>
                </div>
              )}
            </div>

            {panelOpen && selected && (
              <AssetDetail
                key={selected.id}
                item={selected}
                variant="panel"
                onClose={closeDetail}
                onDeleted={removeAsset}
              />
            )}
          </div>

          {selected && !isDesktop && (
            <AssetDetail
              key={selected.id}
              item={selected}
              variant="sheet"
              onClose={closeDetail}
              onDeleted={removeAsset}
            />
          )}
        </>
      )}
    </div>
  );
}
