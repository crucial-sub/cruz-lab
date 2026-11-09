// 공개 페이지용 글 데이터 (재건 2단계 Plan 8절)
// - entries 컬렉션의 발행 글(kind == 'post')만 돌려준다. 노트는 4단계 /notes에서 보인다(D4).
// - 화면 컴포넌트가 쓰던 모양(ContentPost)을 지킨다. category, categoryLabel, series를 더했다.
// - 4단계 글 상세(D16)는 resolvePostPageBySlug·getAdjacentPosts를 쓴다.

import { publicPathFor } from '@/lib/entry-rules';
import type { SeriesRef } from '@/lib/entry-schema';
import {
  findPublishedEntryBySlug,
  listPublishedEntries,
  listSeriesMeta,
  type PublicEntry,
  type PublicEntrySummary,
} from '@/lib/server/entries';
import type { CategoryKey } from '@/lib/taxonomy';

export interface ContentPost {
  id: string;
  title: string;
  description: string;
  content: string; // 목록에서는 빈 문자열이다(본문을 읽지 않는다)
  heroImage: string;
  heroVideo?: string;
  tags: string[];
  slug: string;
  pubDate: Date;
  updatedDate: Date;
  readingTime: number;
  isPublic: boolean;
  category: CategoryKey | null;
  categoryLabel: string;
  series: SeriesRef | null;
}

// 공개 요약 → 화면용 모양
function toContentPost(entry: PublicEntrySummary, markdown = ''): ContentPost {
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    content: markdown,
    // 옛 데이터의 heroImage를 표지 주소로 옮겼다. 영상 주소일 수도 있다(옛 화면과 같은 동작)
    heroImage: entry.cover.kind === 'image' ? entry.cover.url : '',
    tags: entry.tags,
    slug: entry.slug,
    pubDate: entry.publishedAt,
    updatedDate: entry.lastPublishedAt,
    readingTime: entry.readingTime,
    isPublic: true,
    category: entry.category,
    categoryLabel: entry.categoryLabel,
    series: entry.series,
  };
}

// 발행된 글 목록 (최신 발행순)
export async function getPublishedContentPosts(): Promise<ContentPost[]> {
  const entries = await listPublishedEntries();
  return entries.filter((entry) => entry.kind === 'post').map((entry) => toContentPost(entry));
}

// 글 상세 주소(/blog/<slug>)의 조회 결과 (4단계 D11)
// - post: 이 페이지가 그린다.
// - redirect: 예전 slug(slugHistory)이거나 다른 kind(노트·프로젝트 글)의 slug다. 그 주소로 301.
//   다른 kind의 공개 주소가 아직 없으면(publicPathFor가 null) 찾지 못한 것으로 본다(404).
export type PostPageLookup =
  | { type: 'post'; entry: PublicEntry }
  | { type: 'redirect'; location: string; id: string }
  | null;

export async function resolvePostPageBySlug(slug: string): Promise<PostPageLookup> {
  const result = await findPublishedEntryBySlug(slug);
  if (!result) return null;
  if ('redirectTo' in result) {
    const location = publicPathFor(result.kind, result.redirectTo);
    return location
      ? { type: 'redirect', location: encodeURI(location), id: result.entryId }
      : null;
  }
  const { entry } = result;
  if (entry.kind === 'post') return { type: 'post', entry };
  const location = publicPathFor(entry.kind, entry.slug);
  return location ? { type: 'redirect', location: encodeURI(location), id: entry.id } : null;
}

export interface AdjacentPosts {
  // 바로 전에 발행한 글 (더 오래된 글)
  previous: ContentPost | null;
  // 바로 뒤에 발행한 글 (더 새 글)
  next: ContentPost | null;
}

// 발행순으로 이웃한 글 (같은 kind = post, 4단계 D16 7)
export async function getAdjacentPosts(id: string): Promise<AdjacentPosts> {
  const posts = await getPublishedContentPosts(); // 최신 발행순
  const index = posts.findIndex((post) => post.id === id);
  if (index === -1) return { previous: null, next: null };
  return { previous: posts[index + 1] ?? null, next: posts[index - 1] ?? null };
}

// 발행 글에 쓰인 태그 (가나다·알파벳순)
export async function getAllContentTags(): Promise<string[]> {
  const posts = await getPublishedContentPosts();
  return Array.from(new Set(posts.flatMap((post) => post.tags))).sort();
}

export interface PublishedSeries {
  key: string;
  title: string;
  description: string;
  posts: ContentPost[]; // 연재 순서대로
  totalReadingTime: number;
  updatedAt: Date; // 연재 글 중 가장 최근 발행 시각
}

// 발행 글을 published.series.key로 모아 연재 목록을 만든다 (Plan 7.2)
// - 제목·설명은 seriesMeta. 없으면 key를 제목으로 쓴다.
// - 연재 순서는 글이 가장 최근에 발행된 연재가 먼저다.
export async function getPublishedSeriesList(): Promise<PublishedSeries[]> {
  const [posts, metaByKey] = await Promise.all([getPublishedContentPosts(), listSeriesMeta()]);
  const grouped = new Map<string, ContentPost[]>();
  for (const post of posts) {
    if (!post.series) continue;
    if (!grouped.has(post.series.key)) grouped.set(post.series.key, []);
    grouped.get(post.series.key)?.push(post);
  }

  return [...grouped.entries()]
    .map(([key, members]) => {
      const sorted = [...members].sort((a, b) => (a.series?.order ?? 0) - (b.series?.order ?? 0));
      const meta = metaByKey.get(key);
      return {
        key,
        title: meta?.title ?? key,
        description: meta?.description ?? '',
        posts: sorted,
        totalReadingTime: sorted.reduce((sum, post) => sum + post.readingTime, 0),
        updatedAt: new Date(Math.max(...sorted.map((post) => post.updatedDate.getTime()))),
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

// 연재 하나
export async function getPublishedSeriesByKey(key: string): Promise<PublishedSeries | null> {
  const list = await getPublishedSeriesList();
  return list.find((series) => series.key === key) ?? null;
}
