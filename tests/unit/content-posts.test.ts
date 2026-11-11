// 글·노트 상세 조회·이웃 글·공개 주소 테스트 (재건 4단계 D11·D12·D16, 리뷰 테스트 빈틈)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicEntrySummary } from '@/lib/server/entries';

const findPublishedEntryBySlug = vi.fn();
const listPublishedEntries = vi.fn();
const listSeriesMeta = vi.fn();

vi.mock('@/lib/server/entries', () => ({
  findPublishedEntryBySlug: (slug: string) => findPublishedEntryBySlug(slug),
  listPublishedEntries: () => listPublishedEntries(),
  listPublishedNoteEntries: async () => [],
  listSeriesMeta: () => listSeriesMeta(),
}));

const {
  getAdjacentParts,
  getAdjacentPosts,
  getPublishedProjects,
  getPublishedSeriesList,
  resolveNotePageBySlug,
  resolvePostPageBySlug,
  resolveProjectPageBySlug,
} = await import('@/lib/content-posts');
const { categoryPath, notePath, ogImagePath, projectPath, projectPostPath, seriesPath, tagPath } = await import(
  '@/lib/public-paths'
);

// 프로젝트 정보 (seriesMeta.project)
const PROJECT_META = { longDescription: '', tags: [], tech: ['Astro 5'], featured: true, order: 2 };

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
  listSeriesMeta.mockReset();
  listSeriesMeta.mockResolvedValue(new Map());
});

// 프로젝트 글 요약 (연재 = 프로젝트 key, Part 번호)
function projectSummary(id: string, key: string, order: number, day: number): PublicEntrySummary {
  return { ...summary(id, 'project', day), series: { key, order } };
}

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

  it('노트의 slug는 노트 주소로 보낸다 (4단계 D12)', async () => {
    const note = { ...summary('n1', 'note', 1), markdown: '노트', revision: 1 };
    findPublishedEntryBySlug.mockResolvedValue({ entry: note });
    expect(await resolvePostPageBySlug('n1-slug')).toEqual({ type: 'redirect', location: '/notes/n1-slug', id: 'n1' });
    findPublishedEntryBySlug.mockResolvedValue({
      redirectTo: 'n1-slug',
      entryId: 'n1',
      kind: 'note',
    });
    expect(await resolvePostPageBySlug('옛-노트')).toEqual({
      type: 'redirect',
      location: '/notes/n1-slug',
      id: 'n1',
    });
  });

  it('프로젝트 글의 slug는 /projects/<key>/<slug>로 보낸다 (4단계 D1)', async () => {
    const project = { ...projectSummary('pr1', 'cruz-lab', 1, 1), markdown: '프로젝트 글', revision: 1 };
    findPublishedEntryBySlug.mockResolvedValue({ entry: project });
    expect(await resolvePostPageBySlug('pr1-slug')).toEqual({
      type: 'redirect',
      location: '/projects/cruz-lab/pr1-slug',
      id: 'pr1',
    });
    expect(await resolveNotePageBySlug('pr1-slug')).toMatchObject({ location: '/projects/cruz-lab/pr1-slug' });
    findPublishedEntryBySlug.mockResolvedValue({
      redirectTo: 'pr1-slug',
      entryId: 'pr1',
      kind: 'project',
      series: { key: 'cruz-lab', order: 1 },
    });
    expect(await resolvePostPageBySlug('옛-slug')).toMatchObject({ location: '/projects/cruz-lab/pr1-slug' });
  });

  it('연재가 없는 프로젝트 글은 주소를 만들 수 없어 찾지 못한 것이다', async () => {
    const project = { ...summary('pr1', 'project', 1), markdown: '프로젝트 글', revision: 1 };
    findPublishedEntryBySlug.mockResolvedValue({ entry: project });
    expect(await resolvePostPageBySlug('pr1-slug')).toBeNull();
  });

  it('없으면 null', async () => {
    findPublishedEntryBySlug.mockResolvedValue(null);
    expect(await resolvePostPageBySlug('없음')).toBeNull();
  });
});

describe('resolveNotePageBySlug', () => {
  it('노트면 그 노트를 돌려준다', async () => {
    const note = { ...summary('n1', 'note', 1), markdown: '노트', revision: 2 };
    findPublishedEntryBySlug.mockResolvedValue({ entry: note });
    expect(await resolveNotePageBySlug('n1-slug')).toEqual({ type: 'post', entry: note });
  });

  it('글의 slug는 글 주소로, 노트의 예전 slug는 새 노트 주소로 보낸다', async () => {
    const post = { ...summary('p1', 'post', 1), markdown: '본문', revision: 1 };
    findPublishedEntryBySlug.mockResolvedValue({ entry: post });
    expect(await resolveNotePageBySlug('p1-slug')).toEqual({ type: 'redirect', location: '/blog/p1-slug', id: 'p1' });
    findPublishedEntryBySlug.mockResolvedValue({ redirectTo: '새-노트', entryId: 'n1', kind: 'note' });
    expect(await resolveNotePageBySlug('옛-노트')).toEqual({
      type: 'redirect',
      location: '/notes/%EC%83%88-%EB%85%B8%ED%8A%B8',
      id: 'n1',
    });
  });
});

describe('resolveProjectPageBySlug', () => {
  const entry = { ...projectSummary('pr1', 'cruz-lab', 2, 1), markdown: '본문', revision: 1 };

  it('주소의 프로젝트 key가 같으면 그 글을 그린다', async () => {
    findPublishedEntryBySlug.mockResolvedValue({ entry });
    expect(await resolveProjectPageBySlug('cruz-lab', 'pr1-slug')).toEqual({ type: 'post', entry });
  });

  it('프로젝트 key가 다르면 바른 주소로, 글의 slug면 글 주소로 보낸다', async () => {
    findPublishedEntryBySlug.mockResolvedValue({ entry });
    expect(await resolveProjectPageBySlug('stock-lab', 'pr1-slug')).toEqual({
      type: 'redirect',
      location: '/projects/cruz-lab/pr1-slug',
      id: 'pr1',
    });
    findPublishedEntryBySlug.mockResolvedValue({ entry: { ...summary('p1', 'post', 1), markdown: '', revision: 1 } });
    expect(await resolveProjectPageBySlug('cruz-lab', 'p1-slug')).toMatchObject({ location: '/blog/p1-slug' });
    findPublishedEntryBySlug.mockResolvedValue(null);
    expect(await resolveProjectPageBySlug('cruz-lab', '없음')).toBeNull();
  });
});

describe('getPublishedProjects', () => {
  it('project 칸이 있고 발행 글이 있는 연재만, order 순, Part는 번호 순이다', async () => {
    listPublishedEntries.mockResolvedValue([
      projectSummary('c2', 'cruz-lab', 2, 5),
      projectSummary('s1', 'stock-lab', 1, 4),
      summary('p1', 'post', 3),
      projectSummary('c1', 'cruz-lab', 1, 2),
    ]);
    listSeriesMeta.mockResolvedValue(
      new Map([
        ['cruz-lab', { title: 'Cruz Lab', description: '블로그', project: { ...PROJECT_META, order: 2 } }],
        ['stock-lab', { title: 'Stock Lab', description: '퀀트', project: { ...PROJECT_META, order: 1 } }],
        ['empty', { title: '빈 프로젝트', description: '', project: { ...PROJECT_META, order: 0 } }],
        ['pintos', { title: 'Pintos', description: '연재', project: null }],
      ]),
    );
    const projects = await getPublishedProjects();
    expect(projects.map((project) => project.key)).toEqual(['stock-lab', 'cruz-lab']);
    expect(projects[1].posts.map((post) => post.id)).toEqual(['c1', 'c2']);
    expect(getAdjacentParts(projects[1], 'c1')).toMatchObject({ previous: null, next: { id: 'c2' } });
    expect(getAdjacentParts(projects[1], 'c2')).toMatchObject({ previous: { id: 'c1' }, next: null });
    expect(getAdjacentParts(projects[1], 'x')).toEqual({ previous: null, next: null });
  });

  it('프로젝트 글은 /series 연재 목록에 들어가지 않는다', async () => {
    listPublishedEntries.mockResolvedValue([projectSummary('c1', 'cruz-lab', 1, 2)]);
    listSeriesMeta.mockResolvedValue(new Map([['cruz-lab', { title: 'Cruz Lab', description: '', project: PROJECT_META }]]));
    expect(await getPublishedSeriesList()).toEqual([]);
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

  it('노트는 노트끼리 이웃한다 (kind note)', async () => {
    listPublishedEntries.mockResolvedValue([
      summary('n3', 'note', 5),
      summary('c', 'post', 4),
      summary('n2', 'note', 3),
      summary('n1', 'note', 1),
    ]);
    const { previous, next } = await getAdjacentPosts('n2', 'note');
    expect(previous?.id).toBe('n1');
    expect(next?.id).toBe('n3');
    expect(await getAdjacentPosts('c', 'note')).toEqual({ previous: null, next: null });
  });

  it('양 끝과 모르는 글', async () => {
    listPublishedEntries.mockResolvedValue(list);
    expect(await getAdjacentPosts('a')).toMatchObject({ previous: null, next: { id: 'b' } });
    expect(await getAdjacentPosts('c')).toMatchObject({ previous: { id: 'b' }, next: null });
    expect(await getAdjacentPosts('x')).toEqual({ previous: null, next: null });
  });
});

describe('public-paths', () => {
  it('카테고리는 /blog/category/<key>다 (4단계 D11)', () => {
    expect(categoryPath('react-native')).toBe('/blog/category/react-native');
    expect(categoryPath('os')).toBe('/blog/category/os');
  });

  it('노트 주소는 /notes/<slug>이고 한글은 인코딩한다', () => {
    expect(notePath('note-20261109-1200')).toBe('/notes/note-20261109-1200');
    expect(notePath('짧은-기록')).toBe(`/notes/${encodeURIComponent('짧은')}-${encodeURIComponent('기록')}`);
  });

  it('태그·연재 주소는 인코딩한다', () => {
    expect(tagPath('크래프톤-정글')).toBe(`/blog/tag/${encodeURIComponent('크래프톤-정글')}`);
    expect(seriesPath('pintos')).toBe('/series/pintos');
  });

  it('프로젝트·프로젝트 글·OG 이미지 주소 (4단계 D1·D13)', () => {
    expect(projectPath('cruz-lab')).toBe('/projects/cruz-lab');
    expect(projectPostPath('cruz-lab', 'cruz-lab-operating-cms')).toBe('/projects/cruz-lab/cruz-lab-operating-cms');
    expect(projectPostPath('a', '한글-글')).toBe(`/projects/a/${encodeURIComponent('한글')}-${encodeURIComponent('글')}`);
    expect(ogImagePath('LeFCqFhw9iubpp6OocVu')).toBe('/og/LeFCqFhw9iubpp6OocVu.png');
  });
});
