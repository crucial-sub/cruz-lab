// 이미지 라이브러리 거르기·정렬·쪽 나누기 (재건 5단계 D12)
// - 순수 함수만 둔다. 테스트는 admin-asset-filter.test.ts.
// - 거르기: 전체 · 쓰는 것(usedBy 있음) · 쓰지 않는 것(usedBy 없음) · legacy · 영상.
// - 정렬: 올린 때 최신순 · 크기 큰 순. 같으면 올린 때 최신순, 그다음 ID 순.
// - 한 번에 60칸까지 그린다. "더 보기"가 60칸씩 더한다(legacy 썸네일은 원본이라 무겁다).

import type { AdminAssetItem } from '@/lib/server/admin-assets';

export type AssetFilter = 'all' | 'used' | 'unused' | 'legacy' | 'video';
export type AssetSort = 'uploaded' | 'size';

export const ASSET_FILTERS: readonly AssetFilter[] = ['all', 'used', 'unused', 'legacy', 'video'];

export const ASSET_FILTER_LABELS: Record<AssetFilter, string> = {
  all: '전체',
  used: '쓰는 것',
  unused: '쓰지 않는 것',
  legacy: 'legacy',
  video: '영상',
};

export const ASSET_SORT_LABELS: Record<AssetSort, string> = {
  uploaded: '올린 때',
  size: '크기',
};

// 한 쪽의 칸 수
export const ASSET_PAGE_SIZE = 60;

// 자산 하나가 거르기에 맞는지
export function matchesAssetFilter(item: AdminAssetItem, filter: AssetFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'used':
      return item.usedBy.length > 0;
    case 'unused':
      return item.usedBy.length === 0;
    case 'legacy':
      return item.legacy;
    case 'video':
      return item.kind === 'video';
  }
}

// 거르기별 수 (탭에 보인다)
export function countAssetFilters(items: readonly AdminAssetItem[]): Record<AssetFilter, number> {
  const counts: Record<AssetFilter, number> = { all: 0, used: 0, unused: 0, legacy: 0, video: 0 };
  for (const item of items) {
    for (const filter of ASSET_FILTERS) if (matchesAssetFilter(item, filter)) counts[filter] += 1;
  }
  return counts;
}

// 올린 때 최신순. 올린 때가 없으면 뒤로 보낸다
function compareUploadedDesc(a: AdminAssetItem, b: AdminAssetItem): number {
  if (a.uploadedAt === b.uploadedAt) return 0;
  if (a.uploadedAt === null) return 1;
  if (b.uploadedAt === null) return -1;
  return a.uploadedAt < b.uploadedAt ? 1 : -1;
}

function compareId(a: AdminAssetItem, b: AdminAssetItem): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// 두 자산의 순서
export function compareAssets(a: AdminAssetItem, b: AdminAssetItem, sort: AssetSort): number {
  if (sort === 'size' && a.bytes !== b.bytes) return b.bytes - a.bytes;
  return compareUploadedDesc(a, b) || compareId(a, b);
}

// 거르고 정렬한다. 받은 배열은 바꾸지 않는다
export function filterAssets(
  items: readonly AdminAssetItem[],
  filter: AssetFilter,
  sort: AssetSort,
): AdminAssetItem[] {
  return items
    .filter((item) => matchesAssetFilter(item, filter))
    .sort((a, b) => compareAssets(a, b, sort));
}

// 앞에서 pageCount쪽만큼 자른다. remaining은 아직 그리지 않은 칸 수
export function sliceAssetPages<T>(
  items: readonly T[],
  pageCount: number,
): { items: T[]; remaining: number } {
  const shown = items.slice(0, Math.max(1, pageCount) * ASSET_PAGE_SIZE);
  return { items: shown, remaining: items.length - shown.length };
}

// 화면에서 지울 수 있는지
// - 쓰지 않는 새 자산만. legacy는 main 병합 뒤 정리한다(PURGE_LEGACY_ASSETS = false).
// - pending(업로드를 끝내지 않음)은 정리 API가 24시간 뒤 따로 지운다.
export function isDeletableAsset(item: AdminAssetItem): boolean {
  return !item.legacy && item.status === 'ready' && item.usedBy.length === 0;
}

// 바이트 → 읽을 글자 ("2.6 MB", "312 KB", "900 B"). 1024 단위다
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  // 반올림해 1024 KB가 되면 MB로 쓴다
  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} KB`;
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

// 본문에 붙일 마크다운 한 줄
// - 주소의 괄호·공백은 퍼센트 부호로 바꾼다. 마크다운 링크가 중간에 끊기지 않게 한다
export function markdownImageLine(url: string): string {
  const safe = url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20');
  return `![](${safe})`;
}
