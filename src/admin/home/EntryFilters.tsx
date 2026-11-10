// 목록 거르기 막대 (재건 5단계 D10, M6)
// - 상태 탭(전체·초안·발행·숨김 + 수), 종류, 정렬, 검색 칸, 빈 초안 칩.
// - 값은 주소 쿼리에 남는다(?status=&kind=&q=&sort=). 바꾸면 목록이 즉시 줄어든다.

import { forwardRef } from 'react';
import { classNames } from '@/editor/ui/class-names';
import type { KindFilter, ListState, SortKey, StatusFilter } from './list-filter';

const STATUS_TABS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'draft', label: '초안' },
  { key: 'published', label: '발행' },
  { key: 'hidden', label: '숨김' },
];

const KIND_OPTIONS: ReadonlyArray<{ key: KindFilter; label: string }> = [
  { key: 'all', label: '모든 종류' },
  { key: 'post', label: '글' },
  { key: 'note', label: '노트' },
  { key: 'project', label: '프로젝트' },
];

const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'updated', label: '고친 때' },
  { key: 'published', label: '발행일' },
  { key: 'readers', label: '30일 독자' },
];

const selectClass =
  'h-9 rounded-md border border-border bg-bg-surface px-2 text-sm text-text-primary focus:border-brand focus:outline-none';

export const EntryFilters = forwardRef<
  HTMLInputElement,
  {
    state: ListState;
    query: string;
    counts: Record<StatusFilter, number>;
    emptyCount: number;
    emptyOnly: boolean;
    onChange: (patch: Partial<ListState>) => void;
    onQueryChange: (value: string) => void;
    onToggleEmpty: () => void;
  }
>(function EntryFilters(props, searchRef) {
  const { state, counts, emptyOnly } = props;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex max-w-full overflow-x-auto rounded-md border border-border text-sm"
          role="tablist"
          aria-label="상태"
        >
          {STATUS_TABS.map((tab) => {
            const selected = !emptyOnly && state.status === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                className={classNames(
                  'shrink-0 px-3 py-1.5',
                  selected
                    ? 'bg-bg-card font-semibold text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
                onClick={() => props.onChange({ status: tab.key })}
              >
                {tab.label} <span className="tabular-nums">{counts[tab.key]}</span>
              </button>
            );
          })}
        </div>
        {props.emptyCount > 0 && (
          <button
            type="button"
            aria-pressed={emptyOnly}
            className={classNames(
              'rounded-pill border px-3 py-1 text-sm',
              emptyOnly
                ? 'border-amber-500/70 bg-amber-500/10 font-semibold text-text-primary'
                : 'border-border text-text-secondary hover:text-text-primary',
            )}
            onClick={props.onToggleEmpty}
          >
            빈 초안 {props.emptyCount}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-48">
          <span className="sr-only">검색</span>
          <input
            ref={searchRef}
            type="search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="제목·slug·태그·카테고리·연재 검색 ( / )"
            maxLength={200}
            className="h-9 w-full rounded-md border border-border bg-bg-surface px-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-text-secondary">
          <span className="sr-only">종류</span>
          <select
            className={selectClass}
            value={state.kind}
            onChange={(event) => props.onChange({ kind: event.target.value as KindFilter })}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm text-text-secondary">
          <span>정렬</span>
          <select
            className={selectClass}
            value={state.sort}
            onChange={(event) => props.onChange({ sort: event.target.value as SortKey })}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
});
