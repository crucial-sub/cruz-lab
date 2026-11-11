// 첫 화면 목록 거르기·검색·정렬 테스트 (재건 5단계 D10)
import { describe, expect, it } from 'vitest';
import {
  classificationOf,
  compareEntries,
  DEFAULT_LIST_STATE,
  filterEntries,
  parseListState,
  pickContinueItems,
  serializeListState,
} from '@/admin/home/list-filter';
import type { AdminListItem } from '@/lib/server/admin-entries';

function item(patch: Partial<AdminListItem> & { id: string }): AdminListItem {
  return {
    kind: 'post',
    status: 'published',
    title: '',
    slug: '',
    category: null,
    categoryLabel: null,
    tags: [],
    series: null,
    updatedAt: '2026-03-31T11:47:00.000Z',
    publishedAt: null,
    hasUnpublishedChanges: false,
    draftDevice: null,
    isEmptyDraft: false,
    readers30: null,
    publicPath: null,
    ...patch,
  };
}

const LABELS: Record<string, string> = { os: '운영체제', network: '네트워크' };
const label = (key: string) => LABELS[key] ?? key;

const ITEMS: AdminListItem[] = [
  item({
    id: 'p1',
    title: 'Pintos 스레드',
    slug: 'pintos-threads',
    category: 'os',
    tags: ['pintos', '크래프톤-정글'],
    series: { key: 'pintos', order: 1 },
    publishedAt: '2025-05-01T00:00:00.000Z',
  }),
  item({ id: 'p2', title: '프록시 서버', slug: 'proxy', category: 'network', publishedAt: '2025-06-01T00:00:00.000Z' }),
  item({
    id: 'd1',
    status: 'draft',
    title: '쓰는 중',
    updatedAt: '2026-11-09T10:00:00.000Z',
    draftDevice: 'macbook',
  }),
  item({ id: 'e1', status: 'draft', isEmptyDraft: true, updatedAt: '2026-11-10T01:00:00.000Z' }),
  item({ id: 'n1', kind: 'note', status: 'draft', isEmptyDraft: true, updatedAt: '2026-11-10T01:00:00.000Z' }),
  item({
    id: 'h1',
    status: 'hidden',
    title: '숨긴 글',
    hasUnpublishedChanges: true,
    updatedAt: '2026-11-08T00:00:00.000Z',
    publishedAt: '2025-01-01T00:00:00.000Z',
  }),
  item({
    id: 'j1',
    kind: 'project',
    title: '테트리스 Part 1',
    slug: 'part-1',
    series: { key: 'jungle-tetris', order: 1 },
    publishedAt: '2026-11-01T00:00:00.000Z',
  }),
];

describe('주소 상태', () => {
  it('기본값은 주소에 쓰지 않는다', () => {
    expect(serializeListState(DEFAULT_LIST_STATE)).toBe('');
    expect(parseListState('')).toEqual(DEFAULT_LIST_STATE);
  });

  it('값을 읽고 쓴다(왕복)', () => {
    const state = { status: 'draft', kind: 'note', q: 'pintos', sort: 'published' } as const;
    const search = serializeListState(state);
    expect(search).toBe('?status=draft&kind=note&q=pintos&sort=published');
    expect(parseListState(search)).toEqual(state);
  });

  it('모르는 값은 기본값, 검색어는 앞뒤 공백을 뗀다', () => {
    expect(parseListState('?status=zzz&kind=x&sort=y&q=a')).toEqual({ ...DEFAULT_LIST_STATE, q: 'a' });
    expect(serializeListState({ ...DEFAULT_LIST_STATE, q: '  ' })).toBe('');
    expect(serializeListState({ ...DEFAULT_LIST_STATE, q: ' 한글 ' })).toBe(`?q=${encodeURIComponent('한글')}`);
  });
});

describe('filterEntries', () => {
  it('상태 탭과 수: 종류·검색 뒤, 상태 전', () => {
    const result = filterEntries(ITEMS, { ...DEFAULT_LIST_STATE, status: 'draft' }, label);
    expect(result.items.map((entry) => entry.id).sort()).toEqual(['d1', 'e1', 'n1']);
    expect(result.counts).toEqual({ all: 7, draft: 3, published: 3, hidden: 1 });
    expect(result.emptyCount).toBe(2);
  });

  it('검색: 제목·slug·태그·카테고리 이름·연재 key(대소문자 무시)', () => {
    const ids = (q: string) =>
      filterEntries(ITEMS, { ...DEFAULT_LIST_STATE, q }, label)
        .items.map((entry) => entry.id)
        .sort();
    expect(ids('PINTOS')).toEqual(['p1']);
    expect(ids('proxy')).toEqual(['p2']);
    expect(ids('정글')).toEqual(['p1']);
    expect(ids('네트워크')).toEqual(['p2']);
    expect(ids('jungle-tetris')).toEqual(['j1']);
    expect(ids('없는 말')).toEqual([]);
  });

  it('종류 거르기는 탭 수에도 적용한다', () => {
    const result = filterEntries(ITEMS, { ...DEFAULT_LIST_STATE, kind: 'project' }, label);
    expect(result.items.map((entry) => entry.id)).toEqual(['j1']);
    expect(result.counts.all).toBe(1);
    expect(result.emptyCount).toBe(0);
  });

  it('빈 초안 칩: 빈 초안만, 종류 거르기를 따른다', () => {
    expect(
      filterEntries(ITEMS, DEFAULT_LIST_STATE, label, true)
        .items.map((entry) => entry.id)
        .sort(),
    ).toEqual(['e1', 'n1']);
    expect(
      filterEntries(ITEMS, { ...DEFAULT_LIST_STATE, kind: 'note', status: 'published' }, label, true).items.map(
        (entry) => entry.id,
      ),
    ).toEqual(['n1']);
  });

  it('정렬: 고친 때(기본), 발행일(없는 것 뒤), 같으면 ID 순', () => {
    const byUpdated = filterEntries(ITEMS, DEFAULT_LIST_STATE, label).items.map((entry) => entry.id);
    expect(byUpdated.slice(0, 4)).toEqual(['e1', 'n1', 'd1', 'h1']);
    const byPublished = filterEntries(ITEMS, { ...DEFAULT_LIST_STATE, sort: 'published' }, label).items.map(
      (entry) => entry.id,
    );
    expect(byPublished.slice(0, 4)).toEqual(['j1', 'p2', 'p1', 'h1']);
    expect(byPublished.slice(4)).toEqual(['e1', 'n1', 'd1']);
  });

  it('정렬: 30일 독자(값 없는 것 뒤)', () => {
    const a = item({ id: 'a', readers30: 3 });
    const b = item({ id: 'b', readers30: 10 });
    const c = item({ id: 'c', readers30: null });
    expect([a, c, b].sort((x, y) => compareEntries(x, y, 'readers')).map((entry) => entry.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('pickContinueItems', () => {
  it('초안과 발행 뒤 변경 글, 최근 고친 순 3편, 빈 초안 제외', () => {
    expect(pickContinueItems(ITEMS).map((entry) => entry.id)).toEqual(['d1', 'h1']);
    const many = Array.from({ length: 5 }, (_, index) =>
      item({ id: `x${index}`, status: 'draft', title: `초안 ${index}`, updatedAt: `2026-11-0${index + 1}T00:00:00.000Z` }),
    );
    expect(pickContinueItems(many).map((entry) => entry.id)).toEqual(['x4', 'x3', 'x2']);
  });
});

describe('classificationOf', () => {
  it('연재가 있으면 key · 순서, 없으면 카테고리 이름', () => {
    expect(classificationOf(ITEMS[0], label)).toBe('pintos · 1');
    expect(classificationOf(ITEMS[1], label)).toBe('네트워크');
    expect(classificationOf(ITEMS[2], label)).toBe('');
  });
});
