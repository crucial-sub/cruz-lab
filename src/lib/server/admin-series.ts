// 연재·프로젝트 정보 읽기·고치기 (재건 5단계 D2)
// - seriesMeta/{key}: 제목·설명, 프로젝트면 project 칸(긴 설명·태그·기술·GitHub·데모·대표·순서·기간). 스키마는 그대로다.
// - 연재 목록은 seriesMeta 문서와 글의 연재 key를 합친다. 글만 있고 문서가 없는 key는 "제목 없음"으로 보인다
//   (에디터에서 새 key를 쓰면 생긴다). 이 화면에서 제목을 달면 문서가 생긴다.
// - 고치기의 버전 검사: 문서의 updateTime을 쓴다(문서에 칸을 더하지 않는다). 화면이 받은 값과 다르면 409.
// - 새 프로젝트: seriesMeta/<key>(project 칸) + 첫 Part 초안(kind project, series { key, order: 1 })을 한 트랜잭션에서 만든다.
// - 지우기: 그 key를 쓰는 글이 0편일 때만 문서를 지운다(잘못 만든 프로젝트를 치울 길).
// - 바꾸면 그 연재의 공개 글 캐시와 목록 캐시를 비우고, publishLog에 series 줄을 남긴다.

import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { projectMetaSchema, seriesMetaSchema, type EntryKind, type ProjectMeta } from '@/lib/entry-schema';
import { SERIES_KEY_PATTERN } from '@/lib/taxonomy';
import { assertValidNewEntry, newEntryDoc } from './admin-entries';
import { ApiError, zodIssues } from './api-response';
import { notifyContentChanged, type BackupResult } from './backup-dispatch';
import { purgePublicCacheMany, type PurgeResult } from './cdn-purge';
import { ENTRIES_COLLECTION, PUBLISH_LOG_COLLECTION, SERIES_META_COLLECTION } from './entries';
import { getServerDb } from './firebase-server';
import { recordSideEffects } from './publish-log';

// 연재 줄의 entryId (분류 줄의 'taxonomy'와 같은 쓰임)
export const SERIES_LOG_ENTRY_ID = 'series';
export const MAX_SERIES_KEY_LENGTH = 40;
export const MAX_SERIES_TITLE_LENGTH = 120;

export interface SeriesPart {
  id: string;
  title: string;
  order: number;
  status: string;
  kind: EntryKind;
}

export interface SeriesRow {
  key: string;
  title: string | null; // 문서가 없으면 null(화면은 "제목 없음")
  description: string;
  project: ProjectMeta | null;
  hasMeta: boolean;
  version: string | null; // 문서의 updateTime. 문서가 없으면 null
  parts: SeriesPart[]; // 연재 순서대로
  publishedCount: number;
}

function db() {
  return getServerDb();
}

// updateTime → 버전 문자열 (초.나노초)
function versionOf(snapshot: { exists: boolean; updateTime?: Timestamp }): string | null {
  if (!snapshot.exists || !snapshot.updateTime) return null;
  return `${snapshot.updateTime.seconds}.${String(snapshot.updateTime.nanoseconds).padStart(9, '0')}`;
}

// 연재 칸만 읽는다(본문 없음)
const SERIES_ENTRY_FIELDS = ['kind', 'status', 'draft.title', 'draft.series', 'published.title', 'published.series'];

function partOf(docSnap: QueryDocumentSnapshot<DocumentData>): (SeriesPart & { key: string; publicKey: string | null }) | null {
  const data = docSnap.data();
  const series = data.published?.series ?? data.draft?.series;
  const key = typeof data.draft?.series?.key === 'string' ? data.draft.series.key : typeof series?.key === 'string' ? series.key : null;
  if (!key) return null;
  const publicKey = data.status === 'published' && typeof data.published?.series?.key === 'string' ? data.published.series.key : null;
  return {
    id: docSnap.id,
    key,
    publicKey,
    title: (typeof data.draft?.title === 'string' && data.draft.title) || (typeof data.published?.title === 'string' ? data.published.title : ''),
    order: typeof data.draft?.series?.order === 'number' ? data.draft.series.order : (series?.order ?? 0),
    status: typeof data.status === 'string' ? data.status : 'draft',
    kind: data.kind === 'note' || data.kind === 'project' ? data.kind : 'post',
  };
}

// 연재·프로젝트 목록 (GET /api/admin/series)
// - 순서: 프로젝트(대표 순서) 먼저, 그다음 연재(key 순)
export async function listSeriesForAdmin(): Promise<{ items: SeriesRow[] }> {
  const [metaSnap, entrySnap] = await Promise.all([
    db().collection(SERIES_META_COLLECTION).get(),
    db().collection(ENTRIES_COLLECTION).select(...SERIES_ENTRY_FIELDS).get(),
  ]);
  const partsByKey = new Map<string, Array<ReturnType<typeof partOf> & object>>();
  for (const docSnap of entrySnap.docs) {
    const part = partOf(docSnap);
    if (!part) continue;
    const list = partsByKey.get(part.key) ?? [];
    list.push(part);
    partsByKey.set(part.key, list);
  }

  const rows = new Map<string, SeriesRow>();
  for (const docSnap of metaSnap.docs) {
    const data = docSnap.data();
    const project = data.project === undefined ? null : projectMetaSchema.safeParse(data.project);
    rows.set(docSnap.id, {
      key: docSnap.id,
      title: typeof data.title === 'string' && data.title ? data.title : null,
      description: typeof data.description === 'string' ? data.description : '',
      project: project?.success ? project.data : null,
      hasMeta: true,
      version: versionOf(docSnap),
      parts: [],
      publishedCount: 0,
    });
  }
  for (const [key, parts] of partsByKey) {
    const row =
      rows.get(key) ??
      ({ key, title: null, description: '', project: null, hasMeta: false, version: null, parts: [], publishedCount: 0 } satisfies SeriesRow);
    row.parts = parts
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map(({ id, title, order, status, kind }) => ({ id, title, order, status, kind }));
    row.publishedCount = parts.filter((part) => part.publicKey === key).length;
    rows.set(key, row);
  }

  const items = [...rows.values()].sort((a, b) => {
    if (Boolean(a.project) !== Boolean(b.project)) return a.project ? -1 : 1;
    if (a.project && b.project) return a.project.order - b.project.order || a.key.localeCompare(b.key);
    return a.key.localeCompare(b.key);
  });
  return { items };
}

// 연재 줄 (분류 줄과 같은 모양). 트랜잭션 안에서 쓴다(PR-B 리뷰 S9: 커밋과 기록이 함께 남는다)
function seriesLogRow(op: string, key: string, title: string, publishedIds: string[]) {
  return {
    entryId: SERIES_LOG_ENTRY_ID,
    action: 'series',
    op,
    slug: key,
    title,
    at: Timestamp.now(),
    from: null,
    to: key,
    affected: publishedIds,
    purged: publishedIds,
  };
}

// 커밋 뒤 부수 작업: 공개 캐시 비우기(대상 글 + 목록), 백업 알림, 결과 기록. 실패해도 던지지 않는다
async function afterCommit(input: { key: string; logId: string; publishedIds: string[] }) {
  const [purge, backup] = await Promise.all([
    purgePublicCacheMany(input.publishedIds),
    notifyContentChanged({ entryId: input.publishedIds[0] ?? `series-${input.key}`, action: 'publish' }),
  ]);
  await recordSideEffects(input.logId, { purge, backup });
  return { purge, backup, logId: input.logId };
}

export interface SeriesSaveInput {
  title: string;
  description: string;
  project: ProjectMeta | null; // 프로젝트면 칸 전체, 아니면 null
}

export interface SeriesSaveResult {
  version: string | null;
  purge: PurgeResult;
  backup: BackupResult;
  logId: string | null;
}

// 연재·프로젝트 정보 고치기 (PUT /api/admin/series/{key})
// - baseVersion: 화면이 받은 version. 문서가 없던 연재(글에서 생긴 key)는 null이다. 다르면 409.
// - project 칸은 프로젝트였던 문서만 고친다. 연재를 프로젝트로 바꾸지 않는다(프로젝트는 "새 프로젝트"로 만든다).
// - 문서의 다른 칸은 그대로 둔다(덮지 않는다).
export async function updateSeriesMeta(key: string, input: SeriesSaveInput, baseVersion: string | null): Promise<SeriesSaveResult> {
  if (!SERIES_KEY_PATTERN.test(key)) throw new ApiError(400, 'INVALID_REQUEST', '연재 key 형식이 올바르지 않습니다.');
  const ref = db().collection(SERIES_META_COLLECTION).doc(key);
  const title = input.title.trim();
  const logRef = db().collection(PUBLISH_LOG_COLLECTION).doc();
  const publishedIds = await db().runTransaction(async (tx) => {
    const [snapshot, users] = await Promise.all([
      tx.get(ref),
      tx.get(db().collection(ENTRIES_COLLECTION).where('published.series.key', '==', key)),
    ]);
    if (versionOf(snapshot) !== baseVersion) {
      throw new ApiError(409, 'SERIES_CONFLICT', '다른 곳에서 이 연재 정보를 먼저 바꿨습니다. 다시 불러오세요.');
    }
    const existing = snapshot.exists ? (snapshot.data() ?? {}) : {};
    const wasProject = existing.project !== undefined;
    if (input.project && !wasProject) {
      throw new ApiError(400, 'INVALID_REQUEST', '연재를 프로젝트로 바꿀 수 없습니다. 새 프로젝트로 만드세요.');
    }
    if (!input.project && wasProject) {
      throw new ApiError(400, 'INVALID_REQUEST', '프로젝트 정보가 필요합니다.');
    }
    const next: Record<string, unknown> = { ...existing, title, description: input.description.trim() };
    if (input.project) next.project = input.project;
    const checked = seriesMetaSchema.safeParse(next);
    if (!checked.success) {
      throw new ApiError(400, 'INVALID_REQUEST', '연재 정보가 올바르지 않습니다.', zodIssues(checked.error));
    }
    // 그 연재의 공개 글(캐시를 비울 글)
    const ids = users.docs.filter((docSnap) => docSnap.get('status') === 'published').map((docSnap) => docSnap.id);
    tx.set(ref, next);
    tx.set(logRef, seriesLogRow('update', key, `연재 정보 고치기: ${title}(${key})`, ids));
    return ids;
  });

  // 커밋 뒤의 읽기가 실패해도 저장은 성공이다. version을 모르면 null(화면은 목록을 다시 받는다)
  let version: string | null = null;
  try {
    version = versionOf(await ref.get());
  } catch (error) {
    console.error(`[admin-series] 저장 뒤 version 읽기 실패: ${key}`, error);
  }
  const effects = await afterCommit({ key, logId: logRef.id, publishedIds });
  return { version, ...effects };
}

// 새 프로젝트 (POST /api/admin/projects)
// - key는 연재 key 형식이다. seriesMeta에도 글에도 없는 key여야 한다(409).
// - 대표 순서(order)는 지금 프로젝트의 가장 큰 값 + 1이다. 대표(featured)는 거짓으로 시작한다.
export async function createProject(input: { key: string; title: string }): Promise<{ id: string; key: string }> {
  const key = input.key.trim();
  const title = input.title.trim();
  if (!key || key.length > MAX_SERIES_KEY_LENGTH || !SERIES_KEY_PATTERN.test(key)) {
    throw new ApiError(400, 'INVALID_REQUEST', '프로젝트 key는 영문 소문자·숫자·-로 40자까지입니다.', [
      { field: 'key', message: '영문 소문자·숫자·-로 40자까지입니다' },
    ]);
  }
  if (!title || title.length > MAX_SERIES_TITLE_LENGTH) {
    throw new ApiError(400, 'INVALID_REQUEST', `제목은 1~${MAX_SERIES_TITLE_LENGTH}자입니다.`, [
      { field: 'title', message: `1~${MAX_SERIES_TITLE_LENGTH}자입니다` },
    ]);
  }
  const now = new Date();
  const metaRef = db().collection(SERIES_META_COLLECTION).doc(key);
  const entryRef = db().collection(ENTRIES_COLLECTION).doc();
  const logRef = db().collection(PUBLISH_LOG_COLLECTION).doc();
  await db().runTransaction(async (tx) => {
    const entries = db().collection(ENTRIES_COLLECTION);
    const [meta, allMeta, draftUsers, publishedUsers] = await Promise.all([
      tx.get(metaRef),
      tx.get(db().collection(SERIES_META_COLLECTION)),
      tx.get(entries.where('draft.series.key', '==', key)),
      tx.get(entries.where('published.series.key', '==', key)),
    ]);
    if (meta.exists || !draftUsers.empty || !publishedUsers.empty) {
      throw new ApiError(409, 'SERIES_EXISTS', '이미 쓰는 key입니다.', [{ field: 'key', message: '이미 쓰는 key입니다' }]);
    }
    const maxOrder = Math.max(
      -1,
      ...allMeta.docs.map((docSnap) => {
        const order = docSnap.get('project.order');
        return typeof order === 'number' ? order : -1;
      }),
    );
    const metaDoc = {
      title,
      description: '',
      project: { longDescription: '', tags: [], tech: [], featured: false, order: maxOrder + 1 },
    };
    seriesMetaSchema.parse(metaDoc);
    const entryDoc = newEntryDoc('project', now, { key, order: 1 });
    assertValidNewEntry(entryRef.id, entryDoc);
    tx.create(metaRef, metaDoc);
    tx.create(entryRef, entryDoc);
    tx.set(logRef, seriesLogRow('create-project', key, `새 프로젝트: ${title}(${key})`, []));
  });
  await afterCommit({ key, logId: logRef.id, publishedIds: [] });
  return { id: entryRef.id, key };
}

// 연재·프로젝트 정보 지우기 (DELETE /api/admin/series/{key})
// - 그 key를 쓰는 글(초안·발행본)이 0편일 때만. 아니면 409
export async function deleteSeriesMeta(key: string, baseVersion: string | null): Promise<{ deleted: true }> {
  if (!SERIES_KEY_PATTERN.test(key)) throw new ApiError(400, 'INVALID_REQUEST', '연재 key 형식이 올바르지 않습니다.');
  const ref = db().collection(SERIES_META_COLLECTION).doc(key);
  const logRef = db().collection(PUBLISH_LOG_COLLECTION).doc();
  await db().runTransaction(async (tx) => {
    const entries = db().collection(ENTRIES_COLLECTION);
    const [snapshot, draftUsers, publishedUsers] = await Promise.all([
      tx.get(ref),
      tx.get(entries.where('draft.series.key', '==', key)),
      tx.get(entries.where('published.series.key', '==', key)),
    ]);
    if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '연재 정보가 없습니다.');
    if (versionOf(snapshot) !== baseVersion) {
      throw new ApiError(409, 'SERIES_CONFLICT', '다른 곳에서 이 연재 정보를 먼저 바꿨습니다. 다시 불러오세요.');
    }
    const users = new Set([...draftUsers.docs, ...publishedUsers.docs].map((docSnap) => docSnap.id));
    if (users.size > 0) {
      throw new ApiError(409, 'SERIES_IN_USE', `이 key를 쓰는 글이 ${users.size}편 있습니다. 글을 먼저 지우거나 옮기세요.`);
    }
    const title = typeof snapshot.get('title') === 'string' ? snapshot.get('title') : key;
    tx.delete(ref);
    tx.set(logRef, seriesLogRow('delete', key, `연재 정보 지우기: ${title}(${key})`, []));
  });
  await afterCommit({ key, logId: logRef.id, publishedIds: [] });
  return { deleted: true };
}
