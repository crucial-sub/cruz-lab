// 이미지 라이브러리 거르기·정렬·쪽 나누기 테스트 (재건 5단계 D12)
import { describe, expect, it } from 'vitest';
import {
  ASSET_PAGE_SIZE,
  compareAssets,
  countAssetFilters,
  filterAssets,
  formatBytes,
  isDeletableAsset,
  markdownImageLine,
  matchesAssetFilter,
  sliceAssetPages,
} from '@/admin/assets/asset-filter';
import type { AdminAssetItem } from '@/lib/server/admin-assets';

function asset(patch: Partial<AdminAssetItem> & { id: string }): AdminAssetItem {
  return {
    url: `https://example.test/${patch.id}.webp`,
    thumbUrl: `https://example.test/${patch.id}-w480.webp`,
    contentType: 'image/webp',
    kind: 'image',
    bytes: 1000,
    width: 1600,
    height: 900,
    legacy: false,
    status: 'ready',
    usedBy: [],
    orphanedAt: null,
    uploadedAt: '2026-11-01T00:00:00.000Z',
    variants: [],
    ...patch,
  };
}

const ITEMS: AdminAssetItem[] = [
  asset({ id: 'a1', usedBy: ['p1'], bytes: 5000, uploadedAt: '2026-11-03T00:00:00.000Z' }),
  asset({ id: 'a2', usedBy: [], bytes: 9000, uploadedAt: '2026-11-02T00:00:00.000Z' }),
  asset({
    id: 'l1',
    legacy: true,
    usedBy: ['p2'],
    bytes: 2_700_000,
    uploadedAt: '2025-01-01T00:00:00.000Z',
  }),
  asset({ id: 'l2', legacy: true, usedBy: [], bytes: 300, uploadedAt: '2025-02-01T00:00:00.000Z' }),
  asset({
    id: 'v1',
    kind: 'video',
    contentType: 'video/mp4',
    usedBy: ['p1'],
    bytes: 9000,
    uploadedAt: '2026-11-02T00:00:00.000Z',
  }),
];

const ids = (items: AdminAssetItem[]) => items.map((item) => item.id);

describe('matchesAssetFilter·countAssetFilters', () => {
  it('거르기마다 맞는 자산만 고른다', () => {
    expect(ITEMS.filter((item) => matchesAssetFilter(item, 'all'))).toHaveLength(5);
    expect(ids(ITEMS.filter((item) => matchesAssetFilter(item, 'used')))).toEqual([
      'a1',
      'l1',
      'v1',
    ]);
    expect(ids(ITEMS.filter((item) => matchesAssetFilter(item, 'unused')))).toEqual(['a2', 'l2']);
    expect(ids(ITEMS.filter((item) => matchesAssetFilter(item, 'legacy')))).toEqual(['l1', 'l2']);
    expect(ids(ITEMS.filter((item) => matchesAssetFilter(item, 'video')))).toEqual(['v1']);
  });

  it('거르기별 수를 센다', () => {
    expect(countAssetFilters(ITEMS)).toEqual({ all: 5, used: 3, unused: 2, legacy: 2, video: 1 });
  });

  it('빈 목록은 모두 0이다', () => {
    expect(countAssetFilters([])).toEqual({ all: 0, used: 0, unused: 0, legacy: 0, video: 0 });
  });
});

describe('filterAssets·compareAssets', () => {
  it('올린 때 최신순이다. 같은 때는 ID 순이다', () => {
    expect(ids(filterAssets(ITEMS, 'all', 'uploaded'))).toEqual(['a1', 'a2', 'v1', 'l2', 'l1']);
  });

  it('크기 큰 순이다. 같은 크기는 올린 때 최신순, 그다음 ID 순이다', () => {
    const items = [
      ...ITEMS,
      asset({ id: 'b0', bytes: 9000, uploadedAt: '2026-11-04T00:00:00.000Z' }),
      asset({ id: 'a0', bytes: 9000, uploadedAt: '2026-11-02T00:00:00.000Z' }),
    ];
    expect(ids(filterAssets(items, 'all', 'size'))).toEqual([
      'l1',
      'b0',
      'a0',
      'a2',
      'v1',
      'a1',
      'l2',
    ]);
  });

  it('올린 때가 없는 자산은 뒤로 간다', () => {
    const items = [asset({ id: 'n1', uploadedAt: null }), asset({ id: 'x1' })];
    expect(ids(filterAssets(items, 'all', 'uploaded'))).toEqual(['x1', 'n1']);
    expect(compareAssets(items[0], items[0], 'uploaded')).toBe(0);
  });

  it('거르기와 정렬을 함께 쓴다', () => {
    expect(ids(filterAssets(ITEMS, 'unused', 'size'))).toEqual(['a2', 'l2']);
  });

  it('받은 배열을 바꾸지 않는다', () => {
    const before = ids(ITEMS);
    filterAssets(ITEMS, 'all', 'size');
    expect(ids(ITEMS)).toEqual(before);
  });
});

describe('sliceAssetPages', () => {
  const many = Array.from({ length: 141 }, (_, index) => index);

  it('한 쪽은 60칸이다', () => {
    expect(ASSET_PAGE_SIZE).toBe(60);
    const first = sliceAssetPages(many, 1);
    expect(first.items).toHaveLength(60);
    expect(first.remaining).toBe(81);
  });

  it('"더 보기"마다 60칸씩 더한다', () => {
    expect(sliceAssetPages(many, 2)).toMatchObject({ remaining: 21 });
    const last = sliceAssetPages(many, 3);
    expect(last.items).toHaveLength(141);
    expect(last.remaining).toBe(0);
    expect(sliceAssetPages(many, 4).remaining).toBe(0);
  });

  it('0쪽 이하를 받아도 첫 쪽을 준다', () => {
    expect(sliceAssetPages(many, 0).items).toHaveLength(60);
  });

  it('60칸보다 적으면 모두 준다', () => {
    expect(sliceAssetPages([1, 2, 3], 1)).toEqual({ items: [1, 2, 3], remaining: 0 });
  });
});

describe('isDeletableAsset', () => {
  it('쓰지 않는 새 ready 자산만 지울 수 있다', () => {
    expect(isDeletableAsset(asset({ id: 'ok' }))).toBe(true);
  });

  it('legacy는 쓰지 않아도 지울 수 없다', () => {
    expect(isDeletableAsset(asset({ id: 'l', legacy: true }))).toBe(false);
  });

  it('pending은 지울 수 없다', () => {
    expect(isDeletableAsset(asset({ id: 'p', status: 'pending', url: '' }))).toBe(false);
  });

  it('글이 쓰는 자산은 지울 수 없다', () => {
    expect(isDeletableAsset(asset({ id: 'u', usedBy: ['p1'] }))).toBe(false);
  });

  it('쓰지 않는 새 영상도 지울 수 있다', () => {
    expect(isDeletableAsset(asset({ id: 'v', kind: 'video', contentType: 'video/webm' }))).toBe(
      true,
    );
  });
});

describe('formatBytes', () => {
  it('1024보다 작으면 B다', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(900)).toBe('900 B');
  });

  it('KB는 정수로 반올림한다', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(312 * 1024 + 300)).toBe('312 KB');
  });

  it('반올림해 1024 KB가 되면 MB로 쓴다', () => {
    expect(formatBytes(1024 * 1024 - 100)).toBe('1.0 MB');
  });

  it('10 MB 아래는 소수 한 자리, 그 위는 정수다', () => {
    expect(formatBytes(2.64 * 1024 * 1024)).toBe('2.6 MB');
    expect(formatBytes(42.4 * 1024 * 1024)).toBe('42 MB');
  });

  it('잘못된 값은 —다', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });
});

describe('markdownImageLine', () => {
  it('마크다운 이미지 한 줄을 만든다', () => {
    expect(markdownImageLine('https://example.test/a.webp?alt=media&token=t')).toBe(
      '![](https://example.test/a.webp?alt=media&token=t)',
    );
  });

  it('괄호와 공백은 퍼센트 부호로 바꾼다', () => {
    expect(markdownImageLine('https://example.test/a (1).png')).toBe(
      '![](https://example.test/a%20%281%29.png)',
    );
  });
});
