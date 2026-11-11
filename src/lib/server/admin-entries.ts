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
  exceedsEntryDocLimit,
  hasUnpublishedChanges,
  nextSlugHistory,
  pickEntryContent,
  publicPathFor,
  reservesSlug,
  type FieldIssue,
  type NormalizedDraft,
} from '@/lib/entry-rules';
import {
  ENTRY_KINDS,
  ENTRY_STATUSES,
  entryContentSchema,
  entryDocSchema,
  isTimestampLike,
  toDateValue,
  type EntryDoc,
  type EntryKind,
  type EntryStatus,
} from '@/lib/entry-schema';
import { alignContentTaxonomy, categoryLabelIn } from '@/lib/taxonomy';
import { ApiError, zodIssues } from './api-response';
import { collectUsedAssetIds, syncAssetUsage } from './asset-usage';
import {
  ENTRIES_COLLECTION,
  ENTRY_TOMBSTONES_COLLECTION,
  PUBLISH_LOG_COLLECTION,
  REVISIONS_SUBCOLLECTION,
} from './entries';
import { getServerDb } from './firebase-server';
import { getTaxonomy } from './taxonomy-store';

type PublishAction = 'publish' | 'hide' | 'unhide' | 'delete' | 'restore';

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

// publishLog 한 줄을 트랜잭션에 더한다. 줄 ID를 돌려준다
// - title은 그때 제목이다(5단계 D11). 글이 지워져도 출간 기록 화면이 이 값을 보인다.
// - 부수 작업 결과(purge·backup·assetUsage)는 커밋 뒤 경로 처리기가 같은 줄에 적는다(publish-log.ts recordSideEffects).
function addPublishLog(
  tx: Transaction,
  entry: { entryId: string; action: PublishAction; slug: string; title: string; at: Date; revision?: number },
): string {
  const ref = getServerDb().collection(PUBLISH_LOG_COLLECTION).doc();
  const { revision, ...rest } = entry;
  tx.set(ref, { ...rest, ...(revision !== undefined ? { revision } : {}) });
  return ref.id;
}

// 커밋 뒤 부수 작업의 결과
// - 트랜잭션이 커밋된 뒤의 일이라 실패해도 요청은 성공으로 끝낸다(다시 보내면 버전 충돌이 나기 때문이다).
// - 실패는 로그로 남기고 응답에 'failed'를 적는다. 정리 API는 지우기 직전에 다시 훑으므로 안전하다.
export type SideEffectResult = 'ok' | 'failed';

async function syncAssetUsageSafely(
  id: string,
  ids: ReadonlySet<string>,
): Promise<{ assetUsage: SideEffectResult; orphaned: number }> {
  try {
    return { assetUsage: 'ok', orphaned: await syncAssetUsage(id, ids) };
  } catch (error) {
    console.error(`[admin-entries] 자산 사용 기록 갱신 실패: ${id}`, error);
    return { assetUsage: 'failed', orphaned: 0 };
  }
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
  // 카테고리 표시 이름(데이터 분류, 5단계 D1). 카테고리가 없으면 null, 목록에 없는 key면 key다
  categoryLabel: string | null;
  tags: string[];
  series: { key: string; order: number } | null;
  updatedAt: string | null;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  draftDevice: string | null;
  // 발행본이 없고 제목·설명·본문이 모두 빈 초안(5단계 D10). 서버가 계산한다(본문을 보내지 않는다)
  isEmptyDraft: boolean;
  // 최근 30일 독자(방문) 수. 독자 흐름(D20, PR-D) 전에는 null이다
  readers30: number | null;
  // 발행본의 공개 주소(발행본 slug 기준). 발행본이 없거나 주소가 없으면 null.
  // 숨김 글도 값을 준다(다시 보이면 이 주소다). 화면은 발행 상태일 때만 링크를 보인다(5단계 D10 행 메뉴)
  publicPath: string | null;
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
  'published.slug',
  'published.series',
];

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

// 빈 초안 판정에 필요한 칸. 초안 상태 글만 읽는다(발행본이 있는 글은 빈 초안이 아니다)
const EMPTY_CHECK_FIELDS = ['draft.description', 'draft.markdown'];

// 초안 상태이고 제목이 빈 글 중 설명·본문도 빈 글의 ID (5단계 D10 isEmptyDraft)
// - 본문은 서버에서만 읽는다. 제목이 빈 초안만 읽는다(제목이 있는 초안의 본문은 받지 않는다).
// - 같음 조건 두 개라 단일 필드 인덱스 병합으로 된다(복합 인덱스 없음).
// - 공백만 있는 제목은 이 쿼리에 걸리지 않는다. 빈 초안이 아니라고 본다(지우지 않는 쪽).
async function findBlankDraftBodies(): Promise<Set<string>> {
  const snapshot = await entriesRef()
    .where('status', '==', 'draft')
    .where('draft.title', '==', '')
    .select(...EMPTY_CHECK_FIELDS)
    .get();
  const ids = new Set<string>();
  for (const docSnap of snapshot.docs) {
    const draft = docSnap.data().draft ?? {};
    const description = typeof draft.description === 'string' ? draft.description : '';
    const markdown = typeof draft.markdown === 'string' ? draft.markdown : '';
    if (!description.trim() && !markdown.trim()) ids.add(docSnap.id);
  }
  return ids;
}

// 모든 상태의 글 목록 (Plan 6.3 GET)
// - title·slug·분류는 초안 값을 준다. 정렬은 updatedAt 내림차순.
// - counts는 kind 조건만 적용한 상태별 수다(status·q 조건 전). 화면의 탭 수에 쓴다.
// - q는 제목·slug 부분 일치다(메모리에서 거른다. 대소문자 무시).
// - 5단계: isEmptyDraft(발행본 없음 + 제목·설명·본문이 빔)와 readers30(PR-D 전에는 null)을 더한다.
export async function listEntriesForAdmin(query: AdminListQuery) {
  const [snapshot, blankBodies, taxonomy] = await Promise.all([
    entriesRef().select(...ADMIN_LIST_FIELDS).get(),
    findBlankDraftBodies(),
    // 메모 없이 읽는다: 다른 인스턴스에서 방금 바꾼 카테고리 이름이 목록에 바로 보이게(PR-B 리뷰 B2)
    getTaxonomy({ fresh: true }),
  ]);
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
      categoryLabel: typeof draft.category === 'string' ? categoryLabelIn(taxonomy, draft.category) : null,
      tags: Array.isArray(draft.tags) ? draft.tags.filter((tag: unknown) => typeof tag === 'string') : [],
      series: draft.series && typeof draft.series.key === 'string' ? draft.series : null,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
      publishedAt: toIso(data.publishedAt),
      hasUnpublishedChanges:
        typeof fromDraftVersion === 'number' && typeof draft.version === 'number' && draft.version !== fromDraftVersion,
      draftDevice: typeof draft.device === 'string' ? draft.device : null,
      isEmptyDraft:
        status === 'draft' &&
        data.published == null &&
        blankBodies.has(docSnap.id) &&
        !(typeof draft.title === 'string' && draft.title.trim()),
      readers30: null,
      publicPath:
        status !== 'draft' && typeof data.published?.slug === 'string'
          ? publicPathFor(kind, data.published.slug, data.published.series ?? null)
          : null,
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

// 빈 초안 문서 (새 글, 새 프로젝트의 첫 Part)
// - 5단계 D2: series를 주면 초안에 연재 값을 넣는다(새 프로젝트: { key, order: 1 })
export function newEntryDoc(kind: (typeof CREATABLE_KINDS)[number], now: Date, series: { key: string; order: number } | null = null) {
  return {
    kind,
    status: 'draft' as const,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    lastPublishedAt: null,
    slugHistory: [],
    draft: { ...emptyEntryContent(), series, version: 1, updatedAt: now, device: null, editorJson: null },
    published: null,
    legacy: null,
  };
}

// 쓰기 직전 새 글 문서를 검사한다(다른 서버 모듈이 트랜잭션 안에서 만들 때)
export function assertValidNewEntry(id: string, doc: unknown): void {
  assertValidEntry(id, doc);
}

// 빈 초안을 만든다 (Plan 6.3 POST). slug와 카테고리는 발행할 때 필요하다
export async function createEntry(kind: (typeof CREATABLE_KINDS)[number]) {
  const ref = entriesRef().doc();
  const doc = newEntryDoc(kind, new Date());
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

// 글의 이름표(다시 시도 줄, 5단계 D11). 글이 없으면 null
// - 이름표 칸만 읽는다(본문·editorJson은 받지 않는다).
export async function getEntryLabel(id: string): Promise<{ slug: string; title: string } | null> {
  const ref = entriesRef().doc(id);
  const [snapshot] = await ref.firestore.getAll(ref, {
    fieldMask: ['published.slug', 'published.title', 'draft.slug', 'draft.title'],
  });
  if (!snapshot?.exists) return null;
  const data = snapshot.data() ?? {};
  const pick = (key: 'slug' | 'title') => {
    const value = data.published?.[key] ?? data.draft?.[key];
    return typeof value === 'string' ? value : '';
  };
  return { slug: pick('slug'), title: pick('title') };
}

// ───────────── 초안 저장 ─────────────

export interface SaveDraftInput {
  baseVersion: number;
  device: string | null;
  draft: NormalizedDraft;
  // 목록에 없는 카테고리면 버전 검사 뒤에 400으로 거절한다(5단계 D1, PR-B 리뷰 S5)
  rejectUnknownCategory?: boolean;
}

// 초안 저장 (Plan 6.3 PUT draft)
// - draft.version == baseVersion일 때만 저장하고 version을 1 올린다. 다르면 409.
// - 저장 뒤 assets.usedBy를 맞춘다(초안과 발행본이 쓰는 자산).
export async function saveDraft(id: string, input: SaveDraftInput) {
  const now = new Date();
  const result = await getServerDb().runTransaction(async (tx) => {
    const { ref, entry } = await readEntryInTx(tx, id);
    if (entry.draft.version !== input.baseVersion) throw draftConflict(entry);
    if (input.rejectUnknownCategory) {
      throw new ApiError(400, 'INVALID_REQUEST', '초안 값이 올바르지 않습니다.', [
        { field: 'category', message: '목록에 없는 카테고리입니다' },
      ]);
    }

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

  const { assetUsage } = await syncAssetUsageSafely(id, collectUsedAssetIds([input.draft, result.published]));
  return { version: result.version, updatedAt: now.toISOString(), assetUsage };
}

// ───────────── 초안 버리기 ─────────────

// 초안을 발행본 내용으로 되돌린다 (Plan 6.3 draft/discard)
// - 발행본이 없으면 409. baseVersion이 다르면 409.
// - 5단계 D15 2: 같은 트랜잭션에서 published.fromDraftVersion을 새 초안 버전으로 맞춘다.
//   초안이 발행본과 같으므로 "발행 뒤 변경 있음"이 사라진다. 리비전 문서는 바꾸지 않는다.
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
    const published = { ...entry.published, fromDraftVersion: draft.version };
    assertValidEntry(id, { ...entry, draft, published, updatedAt: now });
    tx.update(ref, { draft, 'published.fromDraftVersion': draft.version, updatedAt: now });
    return { version: draft.version, published };
  });

  const { assetUsage } = await syncAssetUsageSafely(id, collectUsedAssetIds([result.published]));
  return { version: result.version, updatedAt: now.toISOString(), assetUsage };
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
  // 5단계 D1: 카테고리가 목록(데이터)에 있는지도 본다
  const taxonomy = await getTaxonomy({ strict: true });
  const result = await getServerDb().runTransaction(async (tx) => {
    const { ref, entry } = await readEntryInTx(tx, id);
    if (entry.draft.version !== draftVersion) throw draftConflict(entry);

    const previousSlug = entry.published?.slug ?? null;
    const check = checkPublishable({
      kind: entry.kind,
      draft: entry.draft,
      currentPublishedSlug: previousSlug,
      ownSlugHistory: entry.slugHistory,
      now,
      taxonomy,
    });
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
    if (exceedsEntryDocLimit({ ...entry, ...changes })) {
      throw new ApiError(422, 'VALIDATION_FAILED', '발행 조건을 지키지 않았습니다.', [
        { field: 'markdown', message: '발행하면 문서가 Firestore 크기 한도를 넘습니다' },
      ]);
    }

    tx.update(ref, changes);
    tx.set(ref.collection(REVISIONS_SUBCOLLECTION).doc(String(revision)), { ...published, publishedAt: now });
    const logId = addPublishLog(tx, {
      entryId: id,
      action: 'publish',
      slug: published.slug,
      title: published.title,
      at: now,
      revision,
    });
    return { kind: entry.kind, revision, published, draft: entry.draft, logId };
  });

  const { assetUsage } = await syncAssetUsageSafely(id, collectUsedAssetIds([result.draft, result.published]));
  // series: 프로젝트 글의 공개 주소(/projects/<key>/<slug>)에 쓴다(4단계 D1)
  return {
    kind: result.kind,
    revision: result.revision,
    slug: result.published.slug,
    series: result.published.series,
    assetUsage,
    logId: result.logId,
  };
}

// ───────────── 리비전 (5단계 D3) ─────────────

// 리비전 문서 = 그때의 발행본 + publishedAt (publishEntry가 쓴다)
function revisionsRef(id: string) {
  return entriesRef().doc(id).collection(REVISIONS_SUBCOLLECTION);
}

// 글이 있는지 본다(이름표 칸만). 없으면 404
async function assertEntryExists(id: string): Promise<{ currentRevision: number | null }> {
  const ref = entriesRef().doc(id);
  const [snapshot] = await ref.firestore.getAll(ref, { fieldMask: ['published.revision'] });
  if (!snapshot?.exists) throw new ApiError(404, 'NOT_FOUND', '글이 없습니다.');
  const revision = snapshot.get('published.revision');
  return { currentRevision: typeof revision === 'number' ? revision : null };
}

// 이전 발행본 목록 (GET /api/admin/posts/{id}/revisions). 최신 판이 먼저다. 본문은 보내지 않는다
export async function listRevisions(id: string) {
  const [{ currentRevision }, snapshot] = await Promise.all([
    assertEntryExists(id),
    revisionsRef(id).select('revision', 'title', 'slug', 'publishedAt', 'fromDraftVersion', 'wordCount').get(),
  ]);
  const items = snapshot.docs
    .map((docSnap) => {
      const revision = docSnap.get('revision');
      return {
        revision: typeof revision === 'number' ? revision : Number(docSnap.id),
        title: String(docSnap.get('title') ?? ''),
        slug: String(docSnap.get('slug') ?? ''),
        publishedAt: toIso(docSnap.get('publishedAt')),
        wordCount: typeof docSnap.get('wordCount') === 'number' ? (docSnap.get('wordCount') as number) : null,
      };
    })
    .filter((item) => Number.isInteger(item.revision) && item.revision > 0)
    .sort((a, b) => b.revision - a.revision)
    .map((item) => ({ ...item, current: item.revision === currentRevision }));
  return { items, currentRevision };
}

// 리비전 문서를 읽어 내용 칸으로. 없거나 깨졌으면 404·500
function revisionContent(id: string, revision: number, data: DocumentData | undefined) {
  if (!data) throw new ApiError(404, 'NOT_FOUND', '그 판이 없습니다.');
  const parsed = entryContentSchema.safeParse(pickEntryContent(data as never));
  if (!parsed.success) {
    throw new ApiError(500, 'CORRUPT_REVISION', `저장된 판이 스키마와 맞지 않습니다: ${id}/${revision}`, zodIssues(parsed.error));
  }
  return parsed.data;
}

// 이전 발행본 하나 (GET /api/admin/posts/{id}/revisions/{rev}). 본문 포함
export async function getRevision(id: string, revision: number) {
  const [{ currentRevision }, snapshot] = await Promise.all([
    assertEntryExists(id),
    revisionsRef(id).doc(String(revision)).get(),
  ]);
  const content = revisionContent(id, revision, snapshot.exists ? snapshot.data() : undefined);
  return { revision, current: revision === currentRevision, publishedAt: toIso(snapshot.get('publishedAt')), content };
}

// 이전 발행본을 초안으로 가져온다 (POST /api/admin/posts/{id}/revisions/{rev}/restore)
// - 초안 버전 + 1. baseVersion이 지금 초안 버전과 다르면 409(충돌 검사 그대로, D3).
// - 발행본·리비전은 바꾸지 않는다. 되돌리려면 "초안 버리기"(발행본 내용으로)를 쓴다.
// - publishLog에 restore 줄(가져온 판 번호)을 남긴다.
export async function restoreRevision(id: string, revision: number, baseVersion: number) {
  const now = new Date();
  const taxonomy = await getTaxonomy({ strict: true });
  const result = await getServerDb().runTransaction(async (tx) => {
    const { ref, entry } = await readEntryInTx(tx, id);
    const revisionSnap = await tx.get(ref.collection(REVISIONS_SUBCOLLECTION).doc(String(revision)));
    if (entry.draft.version !== baseVersion) throw draftConflict(entry);
    const content = alignContentTaxonomy(
      revisionContent(id, revision, revisionSnap.exists ? revisionSnap.data() : undefined),
      taxonomy,
    );
    const draft = { ...content, version: entry.draft.version + 1, updatedAt: now, device: null, editorJson: null };
    assertValidEntry(id, { ...entry, draft, updatedAt: now });
    tx.update(ref, { draft, updatedAt: now });
    addPublishLog(tx, {
      entryId: id,
      action: 'restore',
      slug: entry.published?.slug ?? content.slug,
      title: content.title,
      at: now,
      revision,
    });
    return { version: draft.version, draft, published: entry.published };
  });

  const { assetUsage } = await syncAssetUsageSafely(id, collectUsedAssetIds([result.draft, result.published]));
  return { version: result.version, revision, updatedAt: now.toISOString(), assetUsage };
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
    if (!transition.changed) return { status: transition.next, changed: false, logId: null };

    assertValidEntry(id, { ...entry, status: transition.next, updatedAt: now });
    tx.update(ref, { status: transition.next, updatedAt: now });
    const logId = addPublishLog(tx, {
      entryId: id,
      action: visible ? 'unhide' : 'hide',
      slug: entry.published?.slug ?? entry.draft.slug,
      title: entry.published?.title ?? entry.draft.title,
      at: now,
    });
    return { status: transition.next, changed: true, logId };
  });
}

// ───────────── 삭제 ─────────────

// 글 삭제 (Plan 6.3 DELETE)
// 1. 마이그레이션 출신 글이면 entryTombstones/{id}를 먼저 쓴다(재동기화가 되살리지 않게, 5.4).
//    4단계 프로젝트 이전 글(projectSource)도 같다(이전 스크립트를 다시 돌려도 되살리지 않게, PR-C 리뷰 경미 10).
// 2. 문서와 하위 revisions를 지운다(recursiveDelete).
// 3. 그 글이 쓰던 자산에서 글 ID를 뺀다. usedBy가 비면 orphanedAt을 적는다.
// 4. publishLog(delete, 마지막 slug, 그때 제목). 줄 ID를 돌려준다(부수 결과 기록, 5단계 D11).
export async function deleteEntry(id: string) {
  const db = getServerDb();
  const ref = entriesRef().doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '글이 없습니다.');
  const entry = parseStoredEntry(snapshot);
  const lastSlug = entry.published?.slug ?? entry.draft.slug;
  const now = new Date();

  if (entry.legacy || entry.projectSource) {
    await db.collection(ENTRY_TOMBSTONES_COLLECTION).doc(id).set({
      legacyPostId: entry.legacy?.postId ?? null,
      ...(entry.projectSource ? { projectSourcePath: entry.projectSource.path } : {}),
      deletedAt: now,
      lastSlug,
    });
  }

  await db.recursiveDelete(ref);

  // 여기부터는 지운 뒤의 일이다. 실패해도 삭제는 성공으로 끝낸다
  const { assetUsage, orphaned } = await syncAssetUsageSafely(id, new Set());
  let logId: string | null = null;
  try {
    const logRow = await db.collection(PUBLISH_LOG_COLLECTION).add({
      entryId: id,
      action: 'delete',
      slug: lastSlug,
      title: entry.published?.title ?? entry.draft.title,
      at: Timestamp.fromDate(now),
    });
    logId = logRow.id;
  } catch (error) {
    console.error(`[admin-entries] 삭제 기록 실패: ${id}`, error);
  }

  return { deleted: true as const, orphanedAssets: orphaned, assetUsage, logId };
}
