// 관리자 글 API의 Firestore 처리 (재건 2단계 Plan 6.3)
// - 목록, 새 초안, 한 편 읽기, 초안 저장, 초안 버리기, 발행, 숨김, 삭제.
// - 상태를 바꾸는 쓰기는 트랜잭션 안에서 한다. 쓰기 전에 결과 문서를 zod 스키마로 검사한다.
// - 컬렉션 이름은 entries.ts의 상수를 쓴다.
// - 오류는 ApiError로 던진다. 경로 처리기가 JSON 오류 응답으로 바꾼다.

import { Timestamp, type DocumentData, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import {
  CREATABLE_KINDS,
  applyVisibility,
  buildPublishedSnapshot,
  checkPublishable,
  emptyEntryContent,
  hasUnpublishedChanges,
  nextSlugHistory,
  pickEntryContent,
  reservesSlug,
  type FieldIssue,
  type NormalizedDraft,
} from '@/lib/entry-rules';
import {
  ENTRY_KINDS,
  ENTRY_STATUSES,
  entryDocSchema,
  isTimestampLike,
  toDateValue,
  type EntryDoc,
  type EntryKind,
  type EntryStatus,
} from '@/lib/entry-schema';
import { ApiError, zodIssues } from './api-response';
import { collectUsedAssetIds, syncAssetUsage } from './asset-usage';
import {
  ENTRIES_COLLECTION,
  ENTRY_TOMBSTONES_COLLECTION,
  PUBLISH_LOG_COLLECTION,
  REVISIONS_SUBCOLLECTION,
} from './entries';
import { getServerDb } from './firebase-server';

type PublishAction = 'publish' | 'hide' | 'unhide' | 'delete';

// ───────────── 공통 도구 ─────────────

function entriesRef() {
  return getServerDb().collection(ENTRIES_COLLECTION);
}

// 시각 값 → ISO 문자열. 시각이 아니면 null
function toIso(value: unknown): string | null {
  return isTimestampLike(value) ? toDateValue(value).toISOString() : null;
}

// 저장된 문서를 스키마로 읽는다. 깨진 문서면 500
function parseStoredEntry(snapshot: DocumentSnapshot<DocumentData>): EntryDoc {
  const result = entryDocSchema.safeParse(snapshot.data());
  if (!result.success) {
    throw new ApiError(500, 'CORRUPT_ENTRY', `저장된 글 문서가 스키마와 맞지 않습니다: ${snapshot.id}`, zodIssues(result.error));
  }
  return result.data;
}

// 쓰기 직전 결과 문서를 검사한다. 틀리면 쓰지 않고 500
function assertValidEntry(id: string, entry: unknown): void {
  const result = entryDocSchema.safeParse(entry);
  if (!result.success) {
    throw new ApiError(500, 'INVALID_RESULT', `쓰려는 글 문서가 스키마와 맞지 않습니다: ${id}`, zodIssues(result.error));
  }
}

// 트랜잭션 안에서 글을 읽는다. 없으면 404
async function readEntryInTx(tx: Transaction, id: string) {
  const ref = entriesRef().doc(id);
  const snapshot = await tx.get(ref);
  if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '글이 없습니다.');
  return { ref, snapshot, entry: parseStoredEntry(snapshot) };
}

// 초안 충돌 오류 (409). details에 서버 초안 전체를 준다
function draftConflict(entry: EntryDoc): ApiError {
  return new ApiError(409, 'DRAFT_CONFLICT', '다른 곳에서 초안이 먼저 바뀌었습니다.', {
    version: entry.draft.version,
    device: entry.draft.device,
    updatedAt: toIso(entry.draft.updatedAt),
    draft: serializeDraft(entry),
  });
}

// publishLog 한 줄을 트랜잭션에 더한다
function addPublishLog(
  tx: Transaction,
  entryId: string,
  action: PublishAction,
  slug: string,
  at: Date,
  revision?: number,
) {
  const ref = getServerDb().collection(PUBLISH_LOG_COLLECTION).doc();
  tx.set(ref, { entryId, action, slug, at, ...(revision !== undefined ? { revision } : {}) });
}

// ───────────── 직렬화 (응답용, 시각은 ISO 문자열) ─────────────

function serializeDraft(entry: EntryDoc) {
  return {
    ...pickEntryContent(entry.draft),
    version: entry.draft.version,
    updatedAt: toIso(entry.draft.updatedAt),
    device: entry.draft.device,
    editorJson: entry.draft.editorJson,
  };
}

// 글 문서 전체 (revisions 제외)
export function serializeEntry(id: string, entry: EntryDoc) {
  return {
    id,
    kind: entry.kind,
    status: entry.status,
    createdAt: toIso(entry.createdAt),
    updatedAt: toIso(entry.updatedAt),
    publishedAt: toIso(entry.publishedAt),
    lastPublishedAt: toIso(entry.lastPublishedAt),
    slugHistory: entry.slugHistory,
    hasUnpublishedChanges: hasUnpublishedChanges(entry.draft.version, entry.published),
    draft: serializeDraft(entry),
    published: entry.published ? { ...entry.published } : null,
    legacy: entry.legacy
      ? {
          ...entry.legacy,
          sourceUpdatedAt: toIso(entry.legacy.sourceUpdatedAt),
          migratedAt: toIso(entry.legacy.migratedAt),
        }
      : null,
  };
}

// ───────────── 목록 ─────────────

export interface AdminListQuery {
  status: EntryStatus | null;
  kind: EntryKind | null;
  q: string | null;
}

// 목록 한 줄 (본문 없음, Plan 6.3 GET 예시)
export interface AdminListItem {
  id: string;
  kind: EntryKind;
  status: EntryStatus;
  title: string;
  slug: string;
  category: string | null;
  tags: string[];
  series: { key: string; order: number } | null;
  updatedAt: string | null;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  draftDevice: string | null;
}

// 목록에 필요한 필드만 읽는다
const ADMIN_LIST_FIELDS = [
  'kind',
  'status',
  'updatedAt',
  'publishedAt',
  'draft.title',
  'draft.slug',
  'draft.category',
  'draft.tags',
  'draft.series',
  'draft.version',
  'draft.device',
  'published.fromDraftVersion',
];

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

// 모든 상태의 글 목록 (Plan 6.3 GET)
// - title·slug·분류는 초안 값을 준다. 정렬은 updatedAt 내림차순.
// - counts는 kind 조건만 적용한 상태별 수다(status·q 조건 전). 화면의 탭 수에 쓴다.
// - q는 제목·slug 부분 일치다(메모리에서 거른다. 대소문자 무시).
export async function listEntriesForAdmin(query: AdminListQuery) {
  const snapshot = await entriesRef().select(...ADMIN_LIST_FIELDS).get();
  const items: AdminListItem[] = [];
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const draft = data.draft ?? {};
    const kind: EntryKind = isOneOf(ENTRY_KINDS, data.kind) ? data.kind : 'post';
    const status: EntryStatus = isOneOf(ENTRY_STATUSES, data.status) ? data.status : 'draft';
    const fromDraftVersion = data.published?.fromDraftVersion;
    const updatedAt = isTimestampLike(data.updatedAt) ? toDateValue(data.updatedAt) : null;
    items.push({
      id: docSnap.id,
      kind,
      status,
      title: typeof draft.title === 'string' ? draft.title : '',
      slug: typeof draft.slug === 'string' ? draft.slug : '',
      category: typeof draft.category === 'string' ? draft.category : null,
      tags: Array.isArray(draft.tags) ? draft.tags.filter((tag: unknown) => typeof tag === 'string') : [],
      series: draft.series && typeof draft.series.key === 'string' ? draft.series : null,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
      publishedAt: toIso(data.publishedAt),
      hasUnpublishedChanges:
        typeof fromDraftVersion === 'number' && typeof draft.version === 'number' && draft.version !== fromDraftVersion,
      draftDevice: typeof draft.device === 'string' ? draft.device : null,
    });
  }

  const byKind = query.kind ? items.filter((item) => item.kind === query.kind) : items;
  const counts: Record<EntryStatus, number> = { draft: 0, published: 0, hidden: 0 };
  for (const item of byKind) counts[item.status] += 1;

  const needle = query.q?.trim().toLowerCase() ?? '';
  const filtered = byKind
    .filter((item) => !query.status || item.status === query.status)
    .filter(
      (item) => !needle || item.title.toLowerCase().includes(needle) || item.slug.toLowerCase().includes(needle),
    )
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  return { counts, items: filtered };
}

// ───────────── 새 초안 ─────────────

// 빈 초안을 만든다 (Plan 6.3 POST). slug와 카테고리는 발행할 때 필요하다
export async function createEntry(kind: (typeof CREATABLE_KINDS)[number]) {
  const now = new Date();
  const ref = entriesRef().doc();
  const doc = {
    kind,
    status: 'draft' as const,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    lastPublishedAt: null,
    slugHistory: [],
    draft: { ...emptyEntryContent(), version: 1, updatedAt: now, device: null, editorJson: null },
    published: null,
    legacy: null,
  };
  assertValidEntry(ref.id, doc);
  await ref.create(doc);
  return { id: ref.id, draft: { version: 1 } };
}

// ───────────── 한 편 읽기 ─────────────

export async function getEntryForAdmin(id: string) {
  const snapshot = await entriesRef().doc(id).get();
  if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '글이 없습니다.');
  return serializeEntry(id, parseStoredEntry(snapshot));
}

// ───────────── 초안 저장 ─────────────

export interface SaveDraftInput {
  baseVersion: number;
  device: string | null;
  draft: NormalizedDraft;
}

// 초안 저장 (Plan 6.3 PUT draft)
// - draft.version == baseVersion일 때만 저장하고 version을 1 올린다. 다르면 409.
// - 저장 뒤 assets.usedBy를 맞춘다(초안과 발행본이 쓰는 자산).
export async function saveDraft(id: string, input: SaveDraftInput) {
  const now = new Date();
  const result = await getServerDb().runTransaction(async (tx) => {
    const { ref, entry } = await readEntryInTx(tx, id);
    if (entry.draft.version !== input.baseVersion) throw draftConflict(entry);

    const { editorJson, ...content } = input.draft;
    const draft = {
      ...content,
      version: entry.draft.version + 1,
      updatedAt: now,
      device: input.device,
      editorJson,
    };
    assertValidEntry(id, { ...entry, draft, updatedAt: now });
    tx.update(ref, { draft, updatedAt: now });
    return { version: draft.version, published: entry.published };
  });

  await syncAssetUsage(id, collectUsedAssetIds([input.draft, result.published]));
  return { version: result.version, updatedAt: now.toISOString() };
}

// ───────────── 초안 버리기 ─────────────

// 초안을 발행본 내용으로 되돌린다 (Plan 6.3 draft/discard)
// - 발행본이 없으면 409. baseVersion이 다르면 409.
export async function discardDraft(id: string, baseVersion: number) {
  const now = new Date();
  const result = await getServerDb().runTransaction(async (tx) => {
    const { ref, entry } = await readEntryInTx(tx, id);
    if (!entry.published) throw new ApiError(409, 'NOT_PUBLISHED', '되돌릴 발행본이 없습니다.');
    if (entry.draft.version !== baseVersion) throw draftConflict(entry);

    const draft = {
      ...pickEntryContent(entry.published),
      version: entry.draft.version + 1,
      updatedAt: now,
      device: null,
      editorJson: null,
    };
    assertValidEntry(id, { ...entry, draft, updatedAt: now });
    tx.update(ref, { draft, updatedAt: now });
    return { version: draft.version, published: entry.published };
  });

  await syncAssetUsage(id, collectUsedAssetIds([result.published]));
  return { version: result.version, updatedAt: now.toISOString() };
}

// ───────────── 발행 ─────────────

// slug 유일성 검사 (Plan 4.1)
// - published·hidden 상태인 다른 글의 발행본 slug와 겹치면 안 된다.
// - 다른 글의 slugHistory 값과도 겹치면 안 된다.
async function findSlugConflicts(tx: Transaction, id: string, slug: string): Promise<FieldIssue[]> {
  const [current, history] = await Promise.all([
    tx.get(entriesRef().where('published.slug', '==', slug)),
    tx.get(entriesRef().where('slugHistory', 'array-contains', slug)),
  ]);
  const usedByOther =
    current.docs.some((docSnap) => docSnap.id !== id && reservesSlug(docSnap.get('status'))) ||
    history.docs.some((docSnap) => docSnap.id !== id);
  return usedByOther ? [{ field: 'slug', message: '다른 글이 이미 쓰는 slug입니다' }] : [];
}

// 초안 → 발행 (Plan 6.3 publish)
// 1. draftVersion이 지금 초안 버전과 다르면 409.
// 2. 검사에 실패하면 422 VALIDATION_FAILED(항목별 이유).
// 3. 트랜잭션: 발행본, revision, 상태, 날짜, slugHistory, revisions/{revision}, publishLog.
// 4. 트랜잭션 밖: assets.usedBy (CDN 퍼지는 경로 처리기가 한다).
export async function publishEntry(id: string, draftVersion: number) {
  const now = new Date();
  const result = await getServerDb().runTransaction(async (tx) => {
    const { ref, entry } = await readEntryInTx(tx, id);
    if (entry.draft.version !== draftVersion) throw draftConflict(entry);

    const previousSlug = entry.published?.slug ?? null;
    const check = checkPublishable({ kind: entry.kind, draft: entry.draft, currentPublishedSlug: previousSlug, now });
    const issues = check.ok ? await findSlugConflicts(tx, id, check.content.slug) : check.issues;
    if (!check.ok || issues.length > 0) {
      throw new ApiError(422, 'VALIDATION_FAILED', '발행 조건을 지키지 않았습니다.', issues);
    }

    const revision = (entry.published?.revision ?? 0) + 1;
    const published = buildPublishedSnapshot(check.content, { revision, fromDraftVersion: entry.draft.version });
    const changes = {
      status: 'published' as const,
      published,
      publishedAt: entry.publishedAt ?? now,
      lastPublishedAt: now,
      updatedAt: now,
      slugHistory: nextSlugHistory(entry.slugHistory, previousSlug, published.slug),
    };
    assertValidEntry(id, { ...entry, ...changes });

    tx.update(ref, changes);
    tx.set(ref.collection(REVISIONS_SUBCOLLECTION).doc(String(revision)), { ...published, publishedAt: now });
    addPublishLog(tx, id, 'publish', published.slug, now, revision);
    return { kind: entry.kind, revision, published, draft: entry.draft };
  });

  await syncAssetUsage(id, collectUsedAssetIds([result.draft, result.published]));
  return { kind: result.kind, revision: result.revision, slug: result.published.slug };
}

// ───────────── 숨김 / 다시 보임 ─────────────

// published ↔ hidden (Plan 6.3 visibility). 발행본이 없으면 409.
// - 이미 그 상태면 아무것도 쓰지 않고 changed = false를 돌려준다.
export async function setEntryVisibility(id: string, visible: boolean) {
  const now = new Date();
  return getServerDb().runTransaction(async (tx) => {
    const { ref, entry } = await readEntryInTx(tx, id);
    const transition = applyVisibility(entry.status, entry.published !== null, visible);
    if (!transition.ok) throw new ApiError(409, 'NOT_PUBLISHED', '발행하지 않은 글은 숨기거나 보일 수 없습니다.');
    if (!transition.changed) return { status: transition.next, changed: false };

    assertValidEntry(id, { ...entry, status: transition.next, updatedAt: now });
    tx.update(ref, { status: transition.next, updatedAt: now });
    addPublishLog(tx, id, visible ? 'unhide' : 'hide', entry.published?.slug ?? entry.draft.slug, now);
    return { status: transition.next, changed: true };
  });
}

// ───────────── 삭제 ─────────────

// 글 삭제 (Plan 6.3 DELETE)
// 1. 마이그레이션 출신 글이면 entryTombstones/{id}를 먼저 쓴다(재동기화가 되살리지 않게, 5.4).
// 2. 문서와 하위 revisions를 지운다(recursiveDelete).
// 3. 그 글이 쓰던 자산에서 글 ID를 뺀다. usedBy가 비면 orphanedAt을 적는다.
// 4. publishLog(delete, 마지막 slug).
export async function deleteEntry(id: string) {
  const db = getServerDb();
  const ref = entriesRef().doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '글이 없습니다.');
  const entry = parseStoredEntry(snapshot);
  const lastSlug = entry.published?.slug ?? entry.draft.slug;
  const now = new Date();

  if (entry.legacy) {
    await db.collection(ENTRY_TOMBSTONES_COLLECTION).doc(id).set({
      legacyPostId: entry.legacy.postId,
      deletedAt: now,
      lastSlug,
    });
  }

  await db.recursiveDelete(ref);
  const orphanedAssets = await syncAssetUsage(id, new Set());
  await db.collection(PUBLISH_LOG_COLLECTION).add({ entryId: id, action: 'delete', slug: lastSlug, at: Timestamp.fromDate(now) });

  return { deleted: true as const, orphanedAssets, kind: entry.kind, wasPublic: entry.status === 'published' };
}
