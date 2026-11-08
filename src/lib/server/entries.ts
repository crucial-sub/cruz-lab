// entries 컬렉션 접근 (재건 2단계 Plan D1, 8절)
// - 컬렉션 이름은 이 파일에만 둔다.
// - 공개 페이지는 status == 'published' 문서의 published만 읽는다.
// - 목록은 select()로 본문(published.markdown)을 빼고 읽는다.
// - 정렬과 kind 거르기는 메모리에서 한다(복합 인덱스가 필요 없다).

import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { Cover, EntryKind, SeriesRef } from '@/lib/entry-schema';
import { getCategoryLabel, type CategoryKey } from '@/lib/taxonomy';
import { getServerDb } from './firebase-server';
import { invalidateMemo, memoize } from './memo-cache';

export const ENTRIES_COLLECTION = 'entries';
export const REVISIONS_SUBCOLLECTION = 'revisions';
export const SERIES_META_COLLECTION = 'seriesMeta';
export const ASSETS_COLLECTION = 'assets';
export const PUBLISH_LOG_COLLECTION = 'publishLog';
export const ENTRY_TOMBSTONES_COLLECTION = 'entryTombstones';
// 읽기만 하는 옛 컬렉션 (자산 정리 전 재검사용)
export const LEGACY_POSTS_COLLECTION = 'posts';
export const LEGACY_SERIES_COLLECTION = 'series';

// 메모리 캐시 키 접두사. 발행·숨김·삭제 때 비운다
const ENTRIES_MEMO_PREFIX = 'entries:';

// 공개 목록 한 줄 (본문 없음)
export interface PublicEntrySummary {
  id: string;
  kind: EntryKind;
  title: string;
  description: string;
  slug: string;
  category: CategoryKey | null;
  categoryLabel: string;
  tags: string[];
  series: SeriesRef | null;
  cover: Cover;
  readingTime: number;
  publishedAt: Date;
  lastPublishedAt: Date;
}

// 공개 글 하나 (본문 포함)
export interface PublicEntry extends PublicEntrySummary {
  markdown: string;
}

export interface SeriesMetaValue {
  title: string;
  description: string;
}

// 목록에 필요한 필드만 읽는다
const LIST_FIELDS = [
  'kind',
  'status',
  'publishedAt',
  'lastPublishedAt',
  'published.title',
  'published.description',
  'published.slug',
  'published.category',
  'published.tags',
  'published.series',
  'published.cover',
  'published.readingTime',
];

function toDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  return fallback;
}

// 문서 → 공개 요약. 발행본이 없거나 깨졌으면 null
function toSummary(docSnap: QueryDocumentSnapshot<DocumentData>): PublicEntrySummary | null {
  const data = docSnap.data();
  const published = data.published;
  if (data.status !== 'published' || !published || typeof published.slug !== 'string' || !published.slug) {
    return null;
  }
  const publishedAt = toDate(data.publishedAt, new Date(0));
  const category = typeof published.category === 'string' ? (published.category as CategoryKey) : null;
  return {
    id: docSnap.id,
    kind: (data.kind as EntryKind) ?? 'post',
    title: typeof published.title === 'string' ? published.title : '',
    description: typeof published.description === 'string' ? published.description : '',
    slug: published.slug,
    category,
    categoryLabel: category ? getCategoryLabel(category) : '',
    tags: Array.isArray(published.tags) ? published.tags.filter((tag: unknown) => typeof tag === 'string') : [],
    series: published.series && typeof published.series.key === 'string' ? (published.series as SeriesRef) : null,
    cover: published.cover?.kind === 'image' ? (published.cover as Cover) : { kind: 'generated' },
    readingTime: typeof published.readingTime === 'number' && published.readingTime > 0 ? published.readingTime : 1,
    publishedAt,
    lastPublishedAt: toDate(data.lastPublishedAt, publishedAt),
  };
}

// 발행된 모든 글 (모든 kind). 최신 발행순
// - 홈, 블로그, 태그, 연재, RSS, 사이트맵이 한 요청에서 여러 번 부르므로 메모리 캐시로 한 번만 조회한다.
export async function listPublishedEntries(): Promise<PublicEntrySummary[]> {
  return memoize(`${ENTRIES_MEMO_PREFIX}list`, async () => {
    const snapshot = await getServerDb()
      .collection(ENTRIES_COLLECTION)
      .where('status', '==', 'published')
      .select(...LIST_FIELDS)
      .get();
    return snapshot.docs
      .map(toSummary)
      .filter((entry): entry is PublicEntrySummary => entry !== null)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  });
}

export type PublicSlugLookup = { entry: PublicEntry } | { redirectTo: string; entryId: string } | null;

// 공개 slug 조회 (Plan 4.1)
// 1. published.slug가 같은 발행 글을 찾는다.
// 2. 없으면 slugHistory에 그 slug가 있는 발행 글을 찾아 새 slug를 돌려준다(301용).
export async function findPublishedEntryBySlug(slug: string): Promise<PublicSlugLookup> {
  return memoize(`${ENTRIES_MEMO_PREFIX}slug:${slug}`, async () => {
    const db = getServerDb();
    const direct = await db.collection(ENTRIES_COLLECTION).where('published.slug', '==', slug).get();
    for (const docSnap of direct.docs) {
      const summary = toSummary(docSnap);
      if (!summary) continue;
      const markdown = docSnap.data().published?.markdown;
      return { entry: { ...summary, markdown: typeof markdown === 'string' ? markdown : '' } };
    }

    const history = await db
      .collection(ENTRIES_COLLECTION)
      .where('slugHistory', 'array-contains', slug)
      .select(...LIST_FIELDS)
      .get();
    for (const docSnap of history.docs) {
      const summary = toSummary(docSnap);
      if (summary && summary.slug !== slug) return { redirectTo: summary.slug, entryId: summary.id };
    }
    return null;
  });
}

// 연재 제목·설명 (seriesMeta/{key})
export async function listSeriesMeta(): Promise<Map<string, SeriesMetaValue>> {
  return memoize(`${ENTRIES_MEMO_PREFIX}series-meta`, async () => {
    const snapshot = await getServerDb().collection(SERIES_META_COLLECTION).get();
    const result = new Map<string, SeriesMetaValue>();
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      result.set(docSnap.id, {
        title: typeof data.title === 'string' && data.title ? data.title : docSnap.id,
        description: typeof data.description === 'string' ? data.description : '',
      });
    }
    return result;
  });
}

// 이 서버 인스턴스의 공개 데이터 캐시를 비운다 (발행·숨김·삭제 직후)
export function invalidateEntriesCache() {
  invalidateMemo(ENTRIES_MEMO_PREFIX);
}
