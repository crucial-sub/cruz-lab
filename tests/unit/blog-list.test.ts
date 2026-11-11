// 글 목록 도우미·목록 검색·노트 발췌·날짜 표기 테스트 (재건 4단계 D2·D11·D12·D17·D19)
import { describe, expect, it } from 'vitest';
import {
  buildCategoryTabs,
  buildSeriesBadges,
  buildTagChips,
  groupByYear,
  searchTextFor,
  splitFeatured,
  type ListPost,
} from '@/lib/blog-list';
import { firstLineExcerpt } from '@/lib/content/excerpt';
import { formatSeoulMonthDay, seoulYear } from '@/lib/date-format';
import { matchesSearch, normalizeSearchText } from '@/lib/search-filter';
import { CATEGORIES } from '@/lib/taxonomy';

// 코드 기본값의 이름과 순서(테스트는 분류 데이터 대신 쓴다)
const LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.map((category) => [category.key, category.label]));
const ORDER = CATEGORIES.map((category) => category.key);

function post(
  id: string,
  category: string | null,
  tags: string[],
  iso = '2025-12-01T03:00:00Z',
): ListPost {
  return {
    id,
    title: `제목 ${id}`,
    description: `설명 ${id}`,
    slug: `${id}-slug`,
    tags,
    category,
    categoryLabel: category ? (LABELS[category] ?? category) : '',
    series: null,
    pubDate: new Date(iso),
    readingTime: 3,
  };
}

describe('buildCategoryTabs', () => {
  it('발행 글이 있는 카테고리만, 글 수 많은 순, 같으면 taxonomy 순서', () => {
    const tabs = buildCategoryTabs(
      [post('a', 'os', []), post('b', 'javascript', []), post('c', 'javascript', []), post('d', 'ai', []), post('e', null, [])],
      ORDER,
    );
    expect(tabs.map((tab) => [tab.key, tab.count])).toEqual([
      ['javascript', 2],
      ['ai', 1],
      ['os', 1],
    ]);
    expect(tabs[0].href).toBe('/blog/category/javascript');
    expect(tabs[0].label).toBe('JavaScript');
    // 글이 없는 카테고리(회고)는 탭이 없다(D17)
    expect(tabs.some((tab) => tab.key === 'retrospective')).toBe(false);
  });

  it('분류 데이터 순서를 따른다. 목록에 없는 key는 뒤에 key 이름순, 이름은 글 값이다(5단계 D1)', () => {
    const tabs = buildCategoryTabs(
      [post('a', 'zeta', []), post('b', 'os', []), post('c', 'ai', []), post('d', 'new-one', [])],
      ['new-one', 'os', 'ai'],
    );
    expect(tabs.map((tab) => tab.key)).toEqual(['new-one', 'os', 'ai', 'zeta']);
    expect(tabs.find((tab) => tab.key === 'os')?.label).toBe('운영체제');
    expect(tabs.find((tab) => tab.key === 'zeta')?.label).toBe('zeta');
  });
});

describe('buildTagChips', () => {
  it('글 수 많은 순, 같으면 이름순(한국어 순서: 한글이 영문 앞). 주소는 인코딩한다', () => {
    const chips = buildTagChips([
      post('a', 'os', ['pintos', '크래프톤-정글']),
      post('b', 'os', ['pintos', 'csapp']),
    ]);
    expect(chips.map((chip) => [chip.tag, chip.count])).toEqual([
      ['pintos', 2],
      ['크래프톤-정글', 1],
      ['csapp', 1],
    ]);
    expect(chips[1].href).toBe(`/blog/tag/${encodeURIComponent('크래프톤-정글')}`);
  });
});

describe('buildSeriesBadges', () => {
  it('연재 순서의 위치(1부터)와 전체 수', () => {
    const badges = buildSeriesBadges([
      { key: 'pintos', title: 'Pintos', posts: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
    ]);
    expect(badges.get('b')).toEqual({ title: 'Pintos', position: 2, total: 3 });
    expect(badges.get('x')).toBeUndefined();
  });
});

describe('groupByYear', () => {
  it('서울 연도로 묶고 입력 순서를 지킨다', () => {
    const groups = groupByYear([
      post('a', null, [], '2026-04-02T00:00:00Z'),
      // 2025-12-31 16:00 UTC = 2026-01-01 01:00 서울
      post('b', null, [], '2025-12-31T16:00:00Z'),
      post('c', null, [], '2025-12-31T14:00:00Z'),
      post('d', null, [], '2025-06-01T00:00:00Z'),
    ]);
    expect(groups.map((group) => [group.year, group.posts.map((p) => p.id)])).toEqual([
      [2026, ['a', 'b']],
      [2025, ['c', 'd']],
    ]);
  });
});

describe('splitFeatured (D19)', () => {
  it('첫 글(최신 글)이 대표이고 나머지가 행이다. 글이 없으면 대표도 없다', () => {
    const posts = [post('a', 'ai', []), post('b', 'os', []), post('c', 'os', [])];
    const { featured, rest } = splitFeatured(posts);
    expect(featured?.id).toBe('a');
    expect(rest.map((p) => p.id)).toEqual(['b', 'c']);
    expect(splitFeatured([])).toEqual({ featured: null, rest: [] });
    expect(splitFeatured([posts[0]])).toEqual({ featured: posts[0], rest: [] });
  });
});

describe('목록 검색 (D2)', () => {
  it('제목·설명·태그·카테고리 이름을 검색 대상에 넣는다', () => {
    const text = searchTextFor({
      ...post('a', 'os', ['Pintos']),
      categoryLabel: '운영체제',
      title: 'UserProgram  시스템 콜',
    });
    expect(text).toContain('userprogram 시스템 콜');
    expect(text).toContain('설명 a');
    expect(text).toContain('pintos');
    expect(text).toContain('운영체제');
  });

  it('낱말이 모두 들어 있어야 맞다. 대소문자·공백·NFC를 무시한다', () => {
    const haystack = normalizeSearchText('UserProgram 시스템 콜 pintos 운영체제');
    expect(matchesSearch(haystack, 'PINTOS')).toBe(true);
    expect(matchesSearch(haystack, '  시스템   pintos ')).toBe(true);
    expect(matchesSearch(haystack, '시스템 react')).toBe(false);
    expect(matchesSearch(haystack, '운영체제'.normalize('NFD'))).toBe(true);
    expect(matchesSearch(haystack, '')).toBe(true);
  });

  it('낱말 앞의 #은 떼고, 카테고리 key로도 찾는다 (리뷰 경미 14)', () => {
    const text = searchTextFor({ ...post('a', 'os', ['pintos']), categoryLabel: '운영체제' });
    expect(matchesSearch(text, '#pintos')).toBe(true);
    expect(matchesSearch(text, '##pintos 운영체제')).toBe(true);
    expect(matchesSearch(text, 'os')).toBe(true);
    expect(matchesSearch(text, '#')).toBe(true);
  });
});

describe('firstLineExcerpt (D12)', () => {
  it('첫 글자 블록의 첫 줄을 평문으로 꺼낸다', () => {
    expect(firstLineExcerpt('**굵은** 글과 `코드`, [링크](https://a.b)\n둘째 줄')).toBe(
      '굵은 글과 코드, 링크',
    );
  });

  it('코드·수식·원시 HTML·구분선은 건너뛴다', () => {
    expect(
      firstLineExcerpt('```js\nconst a = 1;\n```\n\n$$\nx\n$$\n\n<br>\n\n---\n\n# 제목\n\n본문'),
    ).toBe('제목');
  });

  it('목록·표는 첫 항목·첫 칸의 글자만 꺼낸다(글자가 붙지 않는다, 리뷰 경미 8)', () => {
    expect(firstLineExcerpt('- 첫째 항목\n- 둘째 항목')).toBe('첫째 항목');
    expect(firstLineExcerpt('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('a');
    expect(firstLineExcerpt('> 인용 첫 줄\n> 둘째 줄')).toBe('인용 첫 줄');
  });

  it('길면 자르고 …를 붙인다. 글자는 코드 포인트로 센다', () => {
    const long = '가'.repeat(130);
    expect(firstLineExcerpt(long)).toBe(`${'가'.repeat(120)}…`);
    expect(Array.from(firstLineExcerpt('😀'.repeat(5), 3))).toHaveLength(4);
    expect(firstLineExcerpt('')).toBe('');
  });
});

describe('날짜 표기', () => {
  it('서울 기준 MM.DD와 연도', () => {
    const date = new Date('2025-12-31T16:00:00Z'); // 서울 2026-01-01 01:00
    expect(formatSeoulMonthDay(date)).toBe('01.01');
    expect(seoulYear(date)).toBe(2026);
  });
});
