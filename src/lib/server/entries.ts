// entries 컬렉션 접근 (재건 2단계 Plan D1, 8절)
// - 컬렉션 이름은 이 파일에만 둔다.
// - 공개 페이지는 status == 'published' 문서의 published만 읽는다.
// - 목록은 select()로 본문(published.markdown)을 빼고 읽는다.
// - 정렬과 kind 거르기는 메모리에서 한다(복합 인덱스가 필요 없다).

import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { RenderAsset, RenderAssetVariant } from '@/lib/content/rehype-assets';
import type { Cover, EntryKind, SeriesRef } from '@/lib/entry-schema';
import { chooseSlugLookup } from '@/lib/slug-lookup';
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
// - revision: 발행본 번호(published.revision). 렌더 캐시 키에 쓴다(4단계 D7). 리다이렉트 후보는 0이다
export interface PublicEntry extends PublicEntrySummary {
  markdown: string;
  revision: number;
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

// 문서 → 본문이 있는 공개 글. 발행본이 없거나 깨졌으면 null
function toPublicEntry(docSnap: QueryDocumentSnapshot<DocumentData>): PublicEntry | null {
  const summary = toSummary(docSnap);
  if (!summary) return null;
  const published = docSnap.data().published;
  const markdown = published?.markdown;
  const revision = published?.revision;
  return {
    ...summary,
    markdown: typeof markdown === 'string' ? markdown : '',
    revision: typeof revision === 'number' ? revision : 0,
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

// 발행된 노트와 본문 (재건 4단계 D12). 최신 발행순
// - /notes는 노트 본문을 목록에 그대로 그린다. 그래서 목록 조회(본문 제외)와 따로 읽는다.
// - 등호 조건 둘(status, kind)만 쓴다. 정렬은 메모리에서 한다(복합 색인이 필요 없다).
export async function listPublishedNoteEntries(): Promise<PublicEntry[]> {
  return memoize(`${ENTRIES_MEMO_PREFIX}notes`, async () => {
    const snapshot = await getServerDb()
      .collection(ENTRIES_COLLECTION)
      .where('status', '==', 'published')
      .where('kind', '==', 'note')
      .get();
    return snapshot.docs
      .map(toPublicEntry)
      .filter((entry): entry is PublicEntry => entry !== null)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  });
}

export type PublicSlugLookup =
  | { entry: PublicEntry }
  | { redirectTo: string; entryId: string; kind: EntryKind }
  | null;

// 공개 slug 조회 (Plan 4.1)
// 1. published.slug가 같은 발행 글을 찾는다. 여럿이면 post를 먼저 고른다.
// 2. 없으면 slugHistory에 그 slug가 있는 발행 글을 찾아 새 slug를 돌려준다(301용).
//    대상의 kind도 같은 조회 결과에서 준다(따로 캐시된 목록을 보지 않는다).
export async function findPublishedEntryBySlug(slug: string): Promise<PublicSlugLookup> {
  return memoize(`${ENTRIES_MEMO_PREFIX}slug:${slug}`, async () => {
    const db = getServerDb();
    const direct = await db.collection(ENTRIES_COLLECTION).where('published.slug', '==', slug).get();
    const directItems = direct.docs.flatMap((docSnap) => {
      const entry = toPublicEntry(docSnap);
      return entry ? [entry] : [];
    });

    // 리다이렉트 후보는 본문이 필요 없다(빈 문자열로 둔다)
    let historyItems: PublicEntry[] = [];
    if (directItems.length === 0) {
      const history = await db
        .collection(ENTRIES_COLLECTION)
        .where('slugHistory', 'array-contains', slug)
        .select(...LIST_FIELDS)
        .get();
      historyItems = history.docs
        .map(toSummary)
        .filter((entry): entry is PublicEntrySummary => entry !== null)
        .map((entry) => ({ ...entry, markdown: '', revision: 0 }));
    }

    const choice = chooseSlugLookup(slug, directItems, historyItems);
    if (!choice) return null;
    if ('match' in choice) return { entry: choice.match };
    return { redirectTo: choice.redirectTo, entryId: choice.target.id, kind: choice.target.kind };
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

// 자산 변형 하나 (문서 값이 모양에 맞지 않으면 null)
function toRenderVariant(value: unknown): RenderAssetVariant | null {
  if (!value || typeof value !== 'object') return null;
  const { url, width, height } = value as Record<string, unknown>;
  if (typeof url !== 'string' || !url) return null;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  return { url, width, height };
}

// 자산 문서 → 렌더용 변형 (재건 4단계 D15). legacy 자산은 variants가 null이다
function toRenderAsset(data: DocumentData | undefined): RenderAsset {
  const variants = data?.variants;
  const max = toRenderVariant(variants?.max);
  if (!max) return { variants: null };
  const result: NonNullable<RenderAsset['variants']> = { max };
  for (const key of ['w480', 'w960', 'w1600'] as const) {
    const variant = toRenderVariant(variants?.[key]);
    if (variant) result[key] = variant;
  }
  return { variants: result };
}

// 본문에 쓰인 새 자산의 변형 (재건 4단계 D15)
// - 자산 ID 목록을 한 번에 읽는다(getAll, variants 칸만). 없는 문서는 결과에서 빠진다.
// - 공개 데이터와 같이 메모리 캐시한다(같은 목록이면 60초 안에 다시 읽지 않는다).
export async function getAssetsByIds(ids: readonly string[]): Promise<Map<string, RenderAsset>> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return new Map();
  return memoize(`${ENTRIES_MEMO_PREFIX}assets:${unique.join(',')}`, async () => {
    const db = getServerDb();
    const refs = unique.map((id) => db.collection(ASSETS_COLLECTION).doc(id));
    const snapshots = await db.getAll(...refs, { fieldMask: ['variants'] });
    const result = new Map<string, RenderAsset>();
    for (const snapshot of snapshots) {
      if (snapshot.exists) result.set(snapshot.id, toRenderAsset(snapshot.data()));
    }
    return result;
  });
}

// 이 서버 인스턴스의 공개 데이터 캐시를 비운다 (발행·숨김·삭제 직후)
export function invalidateEntriesCache() {
  invalidateMemo(ENTRIES_MEMO_PREFIX);
}
