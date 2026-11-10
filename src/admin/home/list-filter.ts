// 첫 화면 목록의 거르기·검색·정렬 (재건 5단계 D10)
// - 순수 함수만 둔다. 목록은 GET /api/admin/posts 한 번으로 받고, 거르기·검색·정렬은 브라우저에서 즉시 한다.
// - 주소 상태: ?status=&kind=&q=&sort=. 기본값은 주소에 쓰지 않는다. 에디터에서 돌아오면 같은 거르기다.
// - 빈 초안 칩은 주소에 쓰지 않는다(한 번 모아 지우는 화면이다).
// - 테스트는 tests/unit/admin-list-filter.test.ts.

import type { EntryKind, EntryStatus } from '@/lib/entry-schema';
import type { AdminListItem } from '@/lib/server/admin-entries';

export type StatusFilter = 'all' | EntryStatus;
export type KindFilter = 'all' | EntryKind;
export type SortKey = 'updated' | 'published' | 'readers';

export interface ListState {
  status: StatusFilter;
  kind: KindFilter;
  q: string;
  sort: SortKey;
}

export const DEFAULT_LIST_STATE: ListState = { status: 'all', kind: 'all', q: '', sort: 'updated' };

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'draft', 'published', 'hidden'];
const KIND_VALUES: readonly KindFilter[] = ['all', 'post', 'note', 'project'];
const SORT_VALUES: readonly SortKey[] = ['updated', 'published', 'readers'];
// 검색어 최대 길이(목록 API의 q 한도와 같다)
const MAX_QUERY_LENGTH = 200;
// "이어 쓰기" 최대 편 수(D10)
export const CONTINUE_LIMIT = 3;

function pick<T extends string>(values: readonly T[], value: string | null, fallback: T): T {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

// 주소 쿼리 → 목록 상태. 모르는 값은 기본값
export function parseListState(search: string): ListState {
  const params = new URLSearchParams(search);
  return {
    status: pick(STATUS_VALUES, params.get('status'), 'all'),
    kind: pick(KIND_VALUES, params.get('kind'), 'all'),
    q: (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
    sort: pick(SORT_VALUES, params.get('sort'), 'updated'),
  };
}

// 목록 상태 → 주소 쿼리('?…' 또는 ''). 기본값은 쓰지 않는다
export function serializeListState(state: ListState): string {
  const params = new URLSearchParams();
  if (state.status !== 'all') params.set('status', state.status);
  if (state.kind !== 'all') params.set('kind', state.kind);
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.sort !== 'updated') params.set('sort', state.sort);
  const text = params.toString();
  return text ? `?${text}` : '';
}

// 검색 대상 글자: 제목, slug, 태그, 카테고리 이름, 연재 key
function searchText(item: AdminListItem, categoryLabel: (key: string) => string): string {
  return [
    item.title,
    item.slug,
    ...item.tags,
    item.category ? categoryLabel(item.category) : '',
    item.category ?? '',
    item.series?.key ?? '',
  ]
    .join('\n')
    .toLowerCase();
}

// 검색어와 종류 조건만 적용한다(상태 탭 수·빈 초안 수를 셀 때 쓴다)
export function matchesKindAndQuery(
  item: AdminListItem,
  state: Pick<ListState, 'kind' | 'q'>,
  categoryLabel: (key: string) => string,
): boolean {
  if (state.kind !== 'all' && item.kind !== state.kind) return false;
  const needle = state.q.trim().toLowerCase();
  return !needle || searchText(item, categoryLabel).includes(needle);
}

// 시각 문자열 비교(내림차순). 없는 값은 뒤로
function compareDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
}

// 정렬. 같으면 고친 때 → ID 순으로 고정한다(목록이 흔들리지 않게)
export function compareEntries(a: AdminListItem, b: AdminListItem, sort: SortKey): number {
  let result = 0;
  if (sort === 'published') result = compareDesc(a.publishedAt, b.publishedAt);
  else if (sort === 'readers') {
    const ra = a.readers30;
    const rb = b.readers30;
    if (ra !== rb) result = ra === null ? 1 : rb === null ? -1 : rb - ra;
  }
  return result || compareDesc(a.updatedAt, b.updatedAt) || a.id.localeCompare(b.id);
}

export interface FilteredList {
  items: AdminListItem[];
  // 상태 탭 수(종류·검색 조건 뒤, 상태 조건 전)
  counts: Record<StatusFilter, number>;
  // 빈 초안 수(종류·검색 조건 뒤)
  emptyCount: number;
}

// 목록을 거르고 정렬한다. emptyOnly면 빈 초안만 보인다(상태 탭은 무시한다)
export function filterEntries(
  items: readonly AdminListItem[],
  state: ListState,
  categoryLabel: (key: string) => string,
  emptyOnly = false,
): FilteredList {
  const base = items.filter((item) => matchesKindAndQuery(item, state, categoryLabel));
  const counts: Record<StatusFilter, number> = {
    all: base.length,
    draft: 0,
    published: 0,
    hidden: 0,
  };
  let emptyCount = 0;
  for (const item of base) {
    counts[item.status] += 1;
    if (item.isEmptyDraft) emptyCount += 1;
  }
  const shown = base
    .filter((item) =>
      emptyOnly ? item.isEmptyDraft : state.status === 'all' || item.status === state.status,
    )
    .sort((a, b) => compareEntries(a, b, state.sort));
  return { items: shown, counts, emptyCount };
}

// "이어 쓰기": 최근에 고친 초안과 "발행 뒤 변경 있음" 글. 빈 초안은 넣지 않는다(D10)
export function pickContinueItems(
  items: readonly AdminListItem[],
  limit = CONTINUE_LIMIT,
): AdminListItem[] {
  return items
    .filter((item) => !item.isEmptyDraft && (item.status === 'draft' || item.hasUnpublishedChanges))
    .sort((a, b) => compareEntries(a, b, 'updated'))
    .slice(0, limit);
}

// 분류 칸 글자: 카테고리 이름 또는 연재 key·순서
export function classificationOf(
  item: AdminListItem,
  categoryLabel: (key: string) => string,
): string {
  if (item.series) return `${item.series.key} · ${item.series.order}`;
  if (item.category) return categoryLabel(item.category);
  return '';
}
