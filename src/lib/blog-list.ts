// 글 목록 화면 도우미 (재건 4단계 D11·D17·D19)
// - /blog, /blog/category/<key>, /blog/tag/<tag>, 홈이 쓴다. 순수 함수만 둔다(Firestore를 읽지 않는다).
// - 카테고리 탭: 발행 글이 있는 카테고리만. 글 수 많은 순, 같으면 분류 순서(D17).
//   5단계 D1: 카테고리 목록은 데이터(settings/taxonomy)다. 순서는 부르는 쪽이 넘긴다. 표시 이름은 글 값(categoryLabel)이다.
// - 태그 칩: 발행 글에 쓰인 태그. 글 수 많은 순, 같으면 이름순.
// - 대표 카드: 목록의 첫 글(최신 글). 나머지를 연도 묶음으로 나눈다(D19).
// - 행 묶음: 날짜 내림차순 한 줄기를 서울 연도로 나눈다. 연도가 바뀌는 첫 행 앞에 머리가 온다.
// - 연재 배지: "Pintos 2/5". N은 그 연재의 발행 글 중 순서다(연재 상자 N/M과 같다).

import type { SeriesRef } from './entry-schema.ts';
import { seoulYear } from './date-format.ts';
import { categoryPath, tagPath } from './public-paths.ts';
import { normalizeSearchText } from './search-filter.ts';

// 목록이 쓰는 글 값 (content-posts.ts의 ContentPost와 모양이 맞는다)
export interface ListPost {
  id: string;
  title: string;
  description: string;
  slug: string;
  tags: string[];
  category: string | null;
  categoryLabel: string;
  series: SeriesRef | null;
  pubDate: Date;
  readingTime: number;
}

// 목록이 쓰는 연재 값 (content-posts.ts의 PublishedSeries와 모양이 맞는다)
export interface ListSeries {
  key: string;
  title: string;
  posts: Array<{ id: string }>; // 연재 순서대로
}

export interface CategoryTab {
  key: string;
  label: string;
  count: number;
  href: string;
}

export interface TagChip {
  tag: string;
  count: number;
  href: string;
}

export interface SeriesBadge {
  title: string;
  position: number; // 1부터
  total: number;
}

export interface YearGroup<T extends ListPost = ListPost> {
  year: number;
  posts: T[];
}

// 카테고리 탭 (전체 탭은 화면이 따로 그린다)
// - order: 분류 데이터의 카테고리 key 순서. 목록에 없는 key(기본값으로 읽은 경우 등)는 그 뒤에 key 이름순이다
export function buildCategoryTabs(posts: readonly ListPost[], order: readonly string[]): CategoryTab[] {
  const counts = new Map<string, { count: number; label: string }>();
  for (const post of posts) {
    if (!post.category) continue;
    const current = counts.get(post.category);
    counts.set(post.category, { count: (current?.count ?? 0) + 1, label: current?.label || post.categoryLabel || post.category });
  }
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
  };
  return [...counts.entries()]
    .map(([key, { count, label }]) => ({ key, label, count }))
    .sort((a, b) => b.count - a.count || rank(a.key) - rank(b.key) || a.key.localeCompare(b.key))
    .map(({ key, label, count }) => ({ key, label, count, href: categoryPath(key) }));
}

// 태그 칩
export function buildTagChips(posts: readonly ListPost[]): TagChip[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .map(([tag, count]) => ({ tag, count, href: tagPath(tag) }));
}

// 글 ID → 연재 배지
export function buildSeriesBadges(seriesList: readonly ListSeries[]): Map<string, SeriesBadge> {
  const result = new Map<string, SeriesBadge>();
  for (const series of seriesList) {
    series.posts.forEach((post, index) => {
      result.set(post.id, { title: series.title, position: index + 1, total: series.posts.length });
    });
  }
  return result;
}

// 대표 카드와 나머지 (D19 매거진형)
// - 입력은 최신 발행순이다. 첫 글이 대표 카드(최신 글)이고 나머지가 행이다. 글이 없으면 대표도 없다.
export function splitFeatured<T extends ListPost>(
  posts: readonly T[],
): { featured: T | null; rest: T[] } {
  if (posts.length === 0) return { featured: null, rest: [] };
  return { featured: posts[0], rest: posts.slice(1) };
}

// 연도 묶음 (입력 순서를 지킨다. 입력은 최신 발행순이다)
export function groupByYear<T extends ListPost>(posts: readonly T[]): YearGroup<T>[] {
  const groups: YearGroup<T>[] = [];
  for (const post of posts) {
    const year = seoulYear(post.pubDate);
    const last = groups.at(-1);
    if (last && last.year === year) last.posts.push(post);
    else groups.push({ year, posts: [post] });
  }
  return groups;
}

// 행의 검색 대상 글: 제목 · 설명 · 태그 · 카테고리 이름(D2)과 카테고리 key(주소에 보이는 값, 예: os)
export function searchTextFor(post: ListPost): string {
  return normalizeSearchText(
    [post.title, post.description, ...post.tags, post.categoryLabel, post.category ?? ''].join(' '),
  );
}
