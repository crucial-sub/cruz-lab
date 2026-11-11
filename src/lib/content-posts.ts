// 공개 페이지용 글 데이터 (재건 2단계 Plan 8절, 4단계 D11·D12·D16)
// - 글(kind == 'post'): 홈·/blog·카테고리·태그·연재·RSS·사이트맵. 화면용 모양(ContentPost)으로 돌려준다.
// - 노트(kind == 'note'): /notes·홈·노트 RSS(4단계 D12). 본문을 함께 읽는다(getPublishedNoteEntries).
// - 프로젝트 글(kind == 'project'): /projects·사이트맵(4단계 D1). 연재 key가 프로젝트 key이고,
//   seriesMeta/<key>.project가 프로젝트 정보다(getPublishedProjects).
// - 상세 주소 조회는 resolvePostPageBySlug(/blog/<slug>)·resolveNotePageBySlug(/notes/<slug>)·
//   resolveProjectPageBySlug(/projects/<key>/<slug>)다. slug 공간이 하나라서 다른 kind의 slug는 그 kind의 주소로 301한다.

import { publicPathFor } from '@/lib/entry-rules';
import type { EntryKind, ProjectMeta, SeriesRef } from '@/lib/entry-schema';
import {
  findPublishedEntryBySlug,
  listPublishedEntries,
  listPublishedNoteEntries,
  listSeriesMeta,
  type PublicEntry,
  type PublicEntrySummary,
} from '@/lib/server/entries';

// 목록·카드·이전다음이 쓰는 글 값 (본문 없음)
// - 4단계 PR-B: 옛 React 카드가 쓰던 content·heroImage·heroVideo·isPublic 칸을 지웠다(리뷰 경미 9).
//   표지는 글 상세가 PublicEntry.cover로 읽는다.
export interface ContentPost {
  id: string;
  title: string;
  description: string;
  tags: string[];
  slug: string;
  pubDate: Date;
  updatedDate: Date;
  readingTime: number;
  category: string | null;
  categoryLabel: string;
  series: SeriesRef | null;
}

// 공개 요약 → 화면용 모양
function toContentPost(entry: PublicEntrySummary): ContentPost {
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    tags: entry.tags,
    slug: entry.slug,
    pubDate: entry.publishedAt,
    updatedDate: entry.lastPublishedAt,
    readingTime: entry.readingTime,
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

// 상세 주소(/blog/<slug>, /notes/<slug>, /projects/<key>/<slug>)의 조회 결과 (4단계 D11)
// - post: 이 페이지가 그린다(그 페이지의 kind와 같은 글).
// - redirect: 예전 slug(slugHistory)이거나 다른 kind의 slug다. 그 kind의 주소로 301.
//   공개 주소를 만들 수 없으면(publicPathFor가 null. 연재가 없는 project 글) 찾지 못한 것으로 본다(404).
export type PostPageLookup =
  | { type: 'post'; entry: PublicEntry }
  | { type: 'redirect'; location: string; id: string }
  | null;

// slug로 그 페이지(kind)의 글을 찾는다
export async function resolveEntryPageBySlug(slug: string, pageKind: EntryKind): Promise<PostPageLookup> {
  const result = await findPublishedEntryBySlug(slug);
  if (!result) return null;
  if ('redirectTo' in result) {
    const location = publicPathFor(result.kind, result.redirectTo, result.series);
    return location
      ? { type: 'redirect', location: encodeURI(location), id: result.entryId }
      : null;
  }
  const { entry } = result;
  if (entry.kind === pageKind) return { type: 'post', entry };
  const location = publicPathFor(entry.kind, entry.slug, entry.series);
  return location ? { type: 'redirect', location: encodeURI(location), id: entry.id } : null;
}

// 글 상세 /blog/<slug>
export function resolvePostPageBySlug(slug: string): Promise<PostPageLookup> {
  return resolveEntryPageBySlug(slug, 'post');
}

// 노트 상세 /notes/<slug> (4단계 D12)
export function resolveNotePageBySlug(slug: string): Promise<PostPageLookup> {
  return resolveEntryPageBySlug(slug, 'note');
}

// 프로젝트 글 상세 /projects/<key>/<slug> (4단계 D1)
// - 프로젝트 글이고 그 프로젝트(연재 key)가 주소의 key와 같으면 그린다.
// - 프로젝트 key가 다르면(글을 다른 프로젝트로 옮겼다) 바른 주소로 301. 다른 kind·예전 slug도 301이다.
export async function resolveProjectPageBySlug(projectKey: string, slug: string): Promise<PostPageLookup> {
  const lookup = await resolveEntryPageBySlug(slug, 'project');
  if (lookup?.type !== 'post' || lookup.entry.series?.key === projectKey) return lookup;
  const location = publicPathFor('project', lookup.entry.slug, lookup.entry.series);
  return location ? { type: 'redirect', location: encodeURI(location), id: lookup.entry.id } : null;
}

export interface AdjacentPosts {
  // 바로 전에 발행한 글 (더 오래된 글)
  previous: ContentPost | null;
  // 바로 뒤에 발행한 글 (더 새 글)
  next: ContentPost | null;
}

// 발행순으로 이웃한 글 (같은 kind, 4단계 D16 7). 노트 상세는 kind 'note'로 부른다
export async function getAdjacentPosts(id: string, kind: EntryKind = 'post'): Promise<AdjacentPosts> {
  const entries = await listPublishedEntries(); // 최신 발행순
  const sameKind = entries.filter((entry) => entry.kind === kind).map((entry) => toContentPost(entry));
  const index = sameKind.findIndex((post) => post.id === id);
  if (index === -1) return { previous: null, next: null };
  return { previous: sameKind[index + 1] ?? null, next: sameKind[index - 1] ?? null };
}

// 발행된 노트와 본문 (최신 발행순, 4단계 D12)
export async function getPublishedNoteEntries(): Promise<PublicEntry[]> {
  return listPublishedNoteEntries();
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

// ───────────── 프로젝트 (4단계 D1) ─────────────

export interface PublishedProject {
  key: string; // 프로젝트 key (= 연재 key, 주소 /projects/<key>)
  title: string;
  description: string;
  meta: ProjectMeta;
  posts: ContentPost[]; // Part 순서대로. 발행된 프로젝트 글만
}

// 발행된 프로젝트 목록
// - seriesMeta에 project 칸이 있고 발행된 프로젝트 글이 1편 이상인 연재다. 글이 없는 프로젝트는 보이지 않는다
//   (/projects/<key>가 보낼 첫 글이 없다).
// - 순서는 project.order, 같으면 key 순이다(D17: featured 구분 없이 order 순).
export async function getPublishedProjects(): Promise<PublishedProject[]> {
  const [entries, metaByKey] = await Promise.all([listPublishedEntries(), listSeriesMeta()]);
  const grouped = new Map<string, ContentPost[]>();
  for (const entry of entries) {
    if (entry.kind !== 'project' || !entry.series) continue;
    const list = grouped.get(entry.series.key) ?? [];
    list.push(toContentPost(entry));
    grouped.set(entry.series.key, list);
  }
  const projects: PublishedProject[] = [];
  for (const [key, meta] of metaByKey) {
    const posts = grouped.get(key);
    if (!meta.project || !posts || posts.length === 0) continue;
    posts.sort((a, b) => (a.series?.order ?? 0) - (b.series?.order ?? 0) || a.slug.localeCompare(b.slug));
    projects.push({ key, title: meta.title, description: meta.description, meta: meta.project, posts });
  }
  return projects.sort((a, b) => a.meta.order - b.meta.order || a.key.localeCompare(b.key));
}

// 프로젝트 하나
export async function getPublishedProjectByKey(key: string): Promise<PublishedProject | null> {
  const projects = await getPublishedProjects();
  return projects.find((project) => project.key === key) ?? null;
}

// 프로젝트 안에서 이웃한 Part (D17 "이전·다음 Part")
export function getAdjacentParts(project: PublishedProject, id: string): AdjacentPosts {
  const index = project.posts.findIndex((post) => post.id === id);
  if (index === -1) return { previous: null, next: null };
  return { previous: project.posts[index - 1] ?? null, next: project.posts[index + 1] ?? null };
}
