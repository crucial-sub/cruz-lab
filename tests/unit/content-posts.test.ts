// 글 상세 조회·이웃 글·공개 주소 테스트 (재건 4단계 D11·D16, 리뷰 테스트 빈틈)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicEntrySummary } from '@/lib/server/entries';

const findPublishedEntryBySlug = vi.fn();
const listPublishedEntries = vi.fn();

vi.mock('@/lib/server/entries', () => ({
  findPublishedEntryBySlug: (slug: string) => findPublishedEntryBySlug(slug),
  listPublishedEntries: () => listPublishedEntries(),
  listSeriesMeta: async () => new Map(),
}));

const { getAdjacentPosts, resolvePostPageBySlug } = await import('@/lib/content-posts');
const { categoryPath, seriesPath, tagPath } = await import('@/lib/public-paths');

function summary(id: string, kind: PublicEntrySummary['kind'], day: number): PublicEntrySummary {
  const date = new Date(Date.UTC(2026, 0, day));
  return {
    id,
    kind,
    title: id,
    description: '',
    slug: `${id}-slug`,
    category: kind === 'post' ? 'os' : null,
    categoryLabel: '',
    tags: [],
    series: null,
    cover: { kind: 'generated' },
    readingTime: 1,
    publishedAt: date,
    lastPublishedAt: date,
  };
}

beforeEach(() => {
  findPublishedEntryBySlug.mockReset();
  listPublishedEntries.mockReset();
});

describe('resolvePostPageBySlug', () => {
  it('글이면 그 글을 돌려준다', async () => {
    const entry = { ...summary('p1', 'post', 1), markdown: '본문', revision: 3 };
    findPublishedEntryBySlug.mockResolvedValue({ entry });
    expect(await resolvePostPageBySlug('p1-slug')).toEqual({ type: 'post', entry });
  });

  it('예전 slug면 인코딩한 새 주소로 보낸다', async () => {
    findPublishedEntryBySlug.mockResolvedValue({
      redirectTo: '새-주소',
      entryId: 'p1',
      kind: 'post',
    });
    expect(await resolvePostPageBySlug('옛-주소')).toEqual({
      type: 'redirect',
      location: '/blog/%EC%83%88-%EC%A3%BC%EC%86%8C',
      id: 'p1',
    });
  });

  it('다른 kind의 slug는 공개 주소가 아직 없으면 찾지 못한 것이다 (PR-B가 노트 주소를 더한다)', async () => {
    const note = { ...summary('n1', 'note', 1), markdown: '노트', revision: 1 };
    findPublishedEntryBySlug.mockResolvedValue({ entry: note });
    expect(await resolvePostPageBySlug('n1-slug')).toBeNull();
    findPublishedEntryBySlug.mockResolvedValue({
      redirectTo: 'n1-slug',
      entryId: 'n1',
      kind: 'note',
    });
    expect(await resolvePostPageBySlug('옛-노트')).toBeNull();
  });

  it('없으면 null', async () => {
    findPublishedEntryBySlug.mockResolvedValue(null);
    expect(await resolvePostPageBySlug('없음')).toBeNull();
  });
});

describe('getAdjacentPosts', () => {
  // listPublishedEntries는 최신 발행순이다
  const list = [
    summary('c', 'post', 3),
    summary('note', 'note', 2),
    summary('b', 'post', 2),
    summary('a', 'post', 1),
  ];

  it('이전 글은 더 오래된 글, 다음 글은 더 새 글이다 (노트는 건너뛴다)', async () => {
    listPublishedEntries.mockResolvedValue(list);
    const { previous, next } = await getAdjacentPosts('b');
    expect(previous?.id).toBe('a');
    expect(next?.id).toBe('c');
  });

  it('양 끝과 모르는 글', async () => {
    listPublishedEntries.mockResolvedValue(list);
    expect(await getAdjacentPosts('a')).toMatchObject({ previous: null, next: { id: 'b' } });
    expect(await getAdjacentPosts('c')).toMatchObject({ previous: { id: 'b' }, next: null });
    expect(await getAdjacentPosts('x')).toEqual({ previous: null, next: null });
  });
});

describe('public-paths', () => {
  it('카테고리는 PR-B까지 동의어 태그 주소다', () => {
    expect(categoryPath('react-native')).toBe('/blog/tag/reactnative');
    expect(categoryPath('os')).toBe(`/blog/tag/${encodeURIComponent('운영체제')}`);
  });

  it('태그·연재 주소는 인코딩한다', () => {
    expect(tagPath('크래프톤-정글')).toBe(`/blog/tag/${encodeURIComponent('크래프톤-정글')}`);
    expect(seriesPath('pintos')).toBe('/series/pintos');
  });
});
