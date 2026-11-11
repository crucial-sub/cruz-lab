// 분류(카테고리·태그) 데이터 읽기·바꾸기 (재건 5단계 D1)
// - 카테고리 목록은 settings/taxonomy 문서다. 없거나 읽지 못하면 코드 기본값(taxonomy.ts CATEGORIES 10개)을 쓴다.
// - 공개 페이지는 getTaxonomy()를 쓴다(메모리 60초, 읽기 실패면 기본값).
//   관리자 쓰기는 getTaxonomy({ strict: true })를 쓴다(읽기 실패면 503, 깨진 문서면 500). 기본값으로 검사하면
//   화면에서 만든 카테고리를 쓰는 초안이 저장되지 않기 때문이다.
// - 바꾸기는 트랜잭션 하나다: 분류 문서(version + 1) + 대상 글의 초안·발행본 + publishLog 한 줄.
//   커밋 뒤 대상 발행 글의 공개 캐시와 목록 캐시를 비우고, 백업 저장소에 한 번 알린다.
// - 글의 분류를 바꾸면 초안 version을 1 올린다. 열린 에디터가 옛 분류로 덮어쓰지 않고 충돌(409)을 받게 한다.
//   "발행 뒤 변경"이 없던 글은 발행본도 같이 바꾸므로 fromDraftVersion도 같이 올린다. 리비전은 만들지 않는다.

import { Timestamp, type DocumentData, type DocumentReference, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { nextVersionsForBulkEdit } from '@/lib/entry-rules';
import { entryDocSchema, taxonomyDocSchema, toDateValue, type EntryDoc } from '@/lib/entry-schema';
import {
  addAlias,
  categoryLabelIn,
  checkCategoryKey,
  checkCategoryLabel,
  defaultTaxonomy,
  hasCategoryIn,
  normalizeTag,
  removeAliasesTo,
  removeAliasFrom,
  replaceTag,
  type TaxonomyData,
} from '@/lib/taxonomy';
import { ApiError, zodIssues } from './api-response';
import { notifyContentChanged, type BackupResult } from './backup-dispatch';
import { purgePublicCacheMany, type PurgeResult } from './cdn-purge';
import { ENTRIES_COLLECTION, PUBLISH_LOG_COLLECTION } from './entries';
import { getServerDb } from './firebase-server';
import { invalidateMemo, memoize } from './memo-cache';
import { recordSideEffects } from './publish-log';

export const SETTINGS_COLLECTION = 'settings';
export const TAXONOMY_DOC_ID = 'taxonomy';
// 분류 줄의 entryId. 글 하나가 아니라 분류 전체의 기록이다(알림 띠·다시 시도가 이 값으로 묶는다)
export const TAXONOMY_LOG_ENTRY_ID = 'taxonomy';

// 공개 데이터 메모와 같은 접두사를 쓴다. 발행·숨김·삭제 퍼지(invalidateEntriesCache)가 같이 비운다
const TAXONOMY_MEMO_KEY = 'entries:taxonomy';

export interface TaxonomyState extends TaxonomyData {
  version: number; // 문서가 없으면 0
  updatedAt: string | null;
  stored: boolean; // 문서가 있는지(첫 저장 전이면 false)
}

type LoadResult = { state: TaxonomyState; problem: null } | { state: TaxonomyState; problem: 'invalid' };

function taxonomyRef() {
  return getServerDb().collection(SETTINGS_COLLECTION).doc(TAXONOMY_DOC_ID);
}

function defaultState(): TaxonomyState {
  return { ...defaultTaxonomy(), version: 0, updatedAt: null, stored: false };
}

// 저장된 문서 → 상태. 없으면 기본값, 깨졌으면 기본값과 'invalid'
function parseTaxonomyDoc(exists: boolean, data: DocumentData | undefined): LoadResult {
  if (!exists) return { state: defaultState(), problem: null };
  const result = taxonomyDocSchema.safeParse(data);
  if (!result.success) {
    console.error('[taxonomy] settings/taxonomy가 스키마와 맞지 않습니다', zodIssues(result.error));
    return { state: defaultState(), problem: 'invalid' };
  }
  const doc = result.data;
  return {
    state: {
      categories: doc.categories.map((category) => ({ ...category, synonymTags: [...category.synonymTags] })),
      categoryAliases: { ...doc.categoryAliases },
      tagAliases: { ...doc.tagAliases },
      version: doc.version,
      updatedAt: toDateValue(doc.updatedAt).toISOString(),
      stored: true,
    },
    problem: null,
  };
}

async function loadTaxonomy(): Promise<LoadResult> {
  const snapshot = await taxonomyRef().get();
  return parseTaxonomyDoc(snapshot.exists, snapshot.data());
}

// 분류 데이터
// - strict가 아니면(공개 페이지): 메모리 60초. 읽기 실패·깨진 문서면 코드 기본값.
// - strict면(관리자 쓰기 검사): 메모를 쓰지 않고 매번 읽는다. 다른 서버 인스턴스에서 방금 만든 카테고리를
//   낡은 메모 때문에 "목록에 없음"으로 거절하지 않게 한다. 읽기 실패 503, 깨진 문서 500.
// - fresh면(OG 이미지): 메모를 쓰지 않고 읽는다. 읽기 실패·깨진 문서면 코드 기본값. OG는 CDN이 하루 저장하므로
//   다른 인스턴스의 낡은 메모로 그린 그림이 남으면 안 된다(PR-B 리뷰 S4).
export async function getTaxonomy(options: { strict?: boolean; fresh?: boolean } = {}): Promise<TaxonomyData> {
  if (options.fresh && !options.strict) {
    try {
      return (await loadTaxonomy()).state;
    } catch (error) {
      console.error('[taxonomy] 분류 목록 읽기 실패. 코드 기본값을 쓴다', error);
      return defaultTaxonomy();
    }
  }
  if (options.strict) {
    let loaded: LoadResult;
    try {
      loaded = await loadTaxonomy();
    } catch (error) {
      console.error('[taxonomy] 분류 목록 읽기 실패', error);
      throw new ApiError(503, 'TAXONOMY_UNAVAILABLE', '분류 목록을 읽지 못했습니다. 잠시 뒤 다시 시도하세요.');
    }
    if (loaded.problem) throw new ApiError(500, 'CORRUPT_TAXONOMY', 'settings/taxonomy 문서가 스키마와 맞지 않습니다.');
    return loaded.state;
  }
  try {
    return (await memoize(TAXONOMY_MEMO_KEY, loadTaxonomy)).state;
  } catch (error) {
    console.error('[taxonomy] 분류 목록 읽기 실패. 코드 기본값을 쓴다', error);
    return defaultTaxonomy();
  }
}

// 초안 저장용 분류 (PR-B 리뷰 S6)
// - 메모 없이 읽는다. 읽기 실패·깨진 문서면 코드 기본값과 reliable: false를 돌려준다.
//   그때 저장 API는 카테고리 목록 검사를 하지 않는다(초안 저장을 막지 않는다. 발행은 strict로 다시 본다).
export async function getTaxonomyForDraft(): Promise<{ taxonomy: TaxonomyData; reliable: boolean }> {
  try {
    const loaded = await loadTaxonomy();
    return { taxonomy: loaded.state, reliable: loaded.problem === null };
  } catch (error) {
    console.error('[taxonomy] 초안 저장용 분류 읽기 실패. 코드 기본값으로 저장한다', error);
    return { taxonomy: defaultTaxonomy(), reliable: false };
  }
}

// ───────────── 관리자 화면용 읽기 ─────────────

export interface TaxonomyCategoryRow {
  key: string;
  label: string;
  synonymTags: string[];
  entryCount: number; // 초안이나 발행본에서 이 카테고리를 쓰는 글(지우기 조건)
  publishedCount: number; // 공개 중인 글
}

export interface TaxonomyTagRow {
  tag: string;
  entryCount: number;
  publishedCount: number;
}

// 분류에 필요한 칸만 읽는다(본문 없음)
const ENTRY_TAXONOMY_FIELDS = [
  'kind',
  'status',
  'draft.title',
  'draft.category',
  'draft.tags',
  'published.title',
  'published.category',
  'published.tags',
];

interface EntryTaxonomyFacts {
  id: string;
  title: string;
  status: string;
  kind: string;
  categories: Set<string>; // 초안 + 발행본
  tags: Set<string>;
  publicCategory: string | null; // 공개 중인 발행본의 값
  publicTags: string[];
}

function factsOf(docSnap: QueryDocumentSnapshot<DocumentData>): EntryTaxonomyFacts {
  const data = docSnap.data();
  const draft = data.draft ?? {};
  const published = data.published ?? null;
  const categories = new Set<string>();
  const tags = new Set<string>();
  for (const source of [draft, published]) {
    if (!source) continue;
    if (typeof source.category === 'string') categories.add(source.category);
    if (Array.isArray(source.tags)) for (const tag of source.tags) if (typeof tag === 'string') tags.add(tag);
  }
  const isPublic = data.status === 'published' && published;
  return {
    id: docSnap.id,
    title: (typeof published?.title === 'string' && published.title) || (typeof draft.title === 'string' ? draft.title : ''),
    status: typeof data.status === 'string' ? data.status : 'draft',
    kind: typeof data.kind === 'string' ? data.kind : 'post',
    categories,
    tags,
    publicCategory: isPublic && typeof published.category === 'string' ? published.category : null,
    publicTags: isPublic && Array.isArray(published.tags) ? published.tags.filter((tag: unknown) => typeof tag === 'string') : [],
  };
}

// 분류 화면 데이터: 카테고리(글 수), 태그(글 수), 별칭, version
// - 메모를 쓰지 않는다(바로 앞의 바꾸기 결과가 보여야 한다).
export async function readTaxonomyForAdmin() {
  const [loaded, snapshot] = await Promise.all([loadTaxonomy(), getServerDb().collection(ENTRIES_COLLECTION).select(...ENTRY_TAXONOMY_FIELDS).get()]);
  if (loaded.problem) throw new ApiError(500, 'CORRUPT_TAXONOMY', 'settings/taxonomy 문서가 스키마와 맞지 않습니다.');
  const facts = snapshot.docs.map(factsOf);

  const categoryRows: TaxonomyCategoryRow[] = loaded.state.categories.map((category) => ({
    ...category,
    entryCount: facts.filter((fact) => fact.categories.has(category.key)).length,
    publishedCount: facts.filter((fact) => fact.publicCategory === category.key).length,
  }));
  // 목록에 없는 key를 쓰는 글(문서를 지웠거나 손으로 고친 경우). 화면이 경고로 보인다
  const unknownCategories = [...new Set(facts.flatMap((fact) => [...fact.categories]))]
    .filter((key) => !hasCategoryIn(loaded.state, key))
    .sort();

  const tagCounts = new Map<string, TaxonomyTagRow>();
  for (const fact of facts) {
    for (const tag of fact.tags) {
      const row = tagCounts.get(tag) ?? { tag, entryCount: 0, publishedCount: 0 };
      row.entryCount += 1;
      if (fact.publicTags.includes(tag)) row.publishedCount += 1;
      tagCounts.set(tag, row);
    }
  }
  const tags = [...tagCounts.values()].sort((a, b) => b.entryCount - a.entryCount || a.tag.localeCompare(b.tag, 'ko'));

  return {
    version: loaded.state.version,
    stored: loaded.state.stored,
    updatedAt: loaded.state.updatedAt,
    categories: categoryRows,
    unknownCategories,
    categoryAliases: loaded.state.categoryAliases,
    tagAliases: loaded.state.tagAliases,
    tags,
  };
}

// ───────────── 바꾸기 공통 ─────────────

// 바꾸기 대상 글 하나 (화면의 확인 창에 보인다)
export interface AffectedEntry {
  id: string;
  title: string;
  status: string;
  kind: string;
}

interface EntryChange {
  ref: DocumentReference;
  id: string;
  entry: EntryDoc;
  // 바꿀 내용: 초안·발행본의 category 또는 tags
  draft: { category?: string | null; tags?: string[] };
  published: { category?: string | null; tags?: string[] } | null;
}

interface MutationPlan {
  next: TaxonomyData;
  changes: EntryChange[];
  // 글은 바꾸지 않지만 공개 캐시를 비울 글(카테고리 이름 바꾸기)
  purgeOnly?: string[];
  log: {
    action: 'category' | 'recategorize' | 'retag';
    op: string;
    title: string;
    slug: string;
    from: string | null;
    to: string | null;
    previous?: Record<string, { draft: string | null; published: string | null }>;
  };
}

export interface MutationResult {
  version: number;
  affected: AffectedEntry[];
  purge: PurgeResult | null;
  backup: BackupResult | null;
  logId: string | null;
}

function parseEntry(docSnap: QueryDocumentSnapshot<DocumentData> | DocumentData, id: string): EntryDoc {
  const data = 'data' in docSnap && typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
  const result = entryDocSchema.safeParse(data);
  if (!result.success) {
    throw new ApiError(500, 'CORRUPT_ENTRY', `저장된 글 문서가 스키마와 맞지 않습니다: ${id}`, zodIssues(result.error));
  }
  return result.data;
}

function affectedOf(change: EntryChange): AffectedEntry {
  return {
    id: change.id,
    title: change.entry.published?.title || change.entry.draft.title,
    status: change.entry.status,
    kind: change.entry.kind,
  };
}

// 트랜잭션 안에서 조건에 맞는 글을 모은다(초안 조건 + 발행본 조건, ID로 합친다)
async function collectEntriesInTx(
  tx: Transaction,
  field: 'category' | 'tags',
  value: string,
): Promise<Array<{ ref: DocumentReference; id: string; entry: EntryDoc }>> {
  const entries = getServerDb().collection(ENTRIES_COLLECTION);
  const operator = field === 'tags' ? 'array-contains' : '==';
  const [draftSnap, publishedSnap] = await Promise.all([
    tx.get(entries.where(`draft.${field}`, operator, value)),
    tx.get(entries.where(`published.${field}`, operator, value)),
  ]);
  const byId = new Map<string, { ref: DocumentReference; id: string; entry: EntryDoc }>();
  for (const docSnap of [...draftSnap.docs, ...publishedSnap.docs]) {
    if (!byId.has(docSnap.id)) byId.set(docSnap.id, { ref: docSnap.ref, id: docSnap.id, entry: parseEntry(docSnap, docSnap.id) });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// 트랜잭션 안에서 글 ID 목록을 읽는다(글 옮기기). 없는 글은 404
async function readEntriesByIdInTx(tx: Transaction, ids: readonly string[]) {
  const entries = getServerDb().collection(ENTRIES_COLLECTION);
  const refs = ids.map((id) => entries.doc(id));
  const snapshots = refs.length > 0 ? await tx.getAll(...refs) : [];
  return snapshots.map((snapshot) => {
    if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', `글이 없습니다: ${snapshot.id}`);
    return { ref: snapshot.ref, id: snapshot.id, entry: parseEntry(snapshot.data() ?? {}, snapshot.id) };
  });
}

// 분류 문서를 트랜잭션 안에서 읽는다. baseVersion이 다르면 409
async function readTaxonomyInTx(tx: Transaction, baseVersion: number): Promise<TaxonomyState> {
  const snapshot = await tx.get(taxonomyRef());
  const loaded = parseTaxonomyDoc(snapshot.exists, snapshot.data());
  if (loaded.problem) throw new ApiError(500, 'CORRUPT_TAXONOMY', 'settings/taxonomy 문서가 스키마와 맞지 않습니다.');
  if (loaded.state.version !== baseVersion) {
    throw new ApiError(409, 'TAXONOMY_CONFLICT', '다른 곳에서 분류를 먼저 바꿨습니다. 화면을 다시 불러오세요.', {
      version: loaded.state.version,
    });
  }
  return loaded.state;
}

// 바꾸기를 실행한다. dryRun이면 대상 글만 계산하고 쓰지 않는다
async function runMutation(
  baseVersion: number,
  dryRun: boolean,
  build: (tx: Transaction, current: TaxonomyState) => Promise<MutationPlan>,
): Promise<MutationResult> {
  const now = new Date();
  const db = getServerDb();
  const outcome = await db.runTransaction(async (tx) => {
    const current = await readTaxonomyInTx(tx, baseVersion);
    const plan = await build(tx, current);
    const affected = plan.changes.map(affectedOf);
    if (dryRun) return { version: current.version, affected, publishedIds: [] as string[], logId: null };

    // 공개 중인 글만 캐시를 비운다(숨김·초안은 공개 주소가 없다). 기록 줄에도 남긴다(다시 비우기 대상)
    const publishedIds = [
      ...new Set([
        ...plan.changes.filter((change) => change.entry.status === 'published').map((change) => change.id),
        ...(plan.purgeOnly ?? []),
      ]),
    ];
    const nextDoc = {
      categories: plan.next.categories,
      categoryAliases: plan.next.categoryAliases,
      tagAliases: plan.next.tagAliases,
      version: current.version + 1,
      updatedAt: now,
    };
    const checked = taxonomyDocSchema.safeParse(nextDoc);
    if (!checked.success) {
      throw new ApiError(500, 'INVALID_RESULT', '쓰려는 분류 문서가 스키마와 맞지 않습니다.', zodIssues(checked.error));
    }

    // 글 바꾸기: 초안·발행본의 분류 칸과 version (리비전·updatedAt은 그대로)
    for (const change of plan.changes) {
      const versions = nextVersionsForBulkEdit(change.entry.draft.version, change.entry.published);
      const draft = { ...change.entry.draft, ...change.draft, version: versions.draftVersion };
      const published = change.entry.published
        ? { ...change.entry.published, ...(change.published ?? {}), fromDraftVersion: versions.fromDraftVersion ?? change.entry.published.fromDraftVersion }
        : null;
      const result = entryDocSchema.safeParse({ ...change.entry, draft, published });
      if (!result.success) {
        throw new ApiError(500, 'INVALID_RESULT', `쓰려는 글 문서가 스키마와 맞지 않습니다: ${change.id}`, zodIssues(result.error));
      }
      const update: Record<string, unknown> = { 'draft.version': versions.draftVersion };
      for (const [field, value] of Object.entries(change.draft)) update[`draft.${field}`] = value;
      if (published && change.entry.published) {
        update['published.fromDraftVersion'] = published.fromDraftVersion;
        for (const [field, value] of Object.entries(change.published ?? {})) update[`published.${field}`] = value;
      }
      tx.update(change.ref, update);
    }

    tx.set(taxonomyRef(), nextDoc);
    const logRef = db.collection(PUBLISH_LOG_COLLECTION).doc();
    tx.set(logRef, {
      entryId: TAXONOMY_LOG_ENTRY_ID,
      action: plan.log.action,
      op: plan.log.op,
      slug: plan.log.slug,
      title: plan.log.title,
      at: Timestamp.fromDate(now),
      from: plan.log.from,
      to: plan.log.to,
      affected: affected.map((item) => item.id),
      purged: publishedIds,
      ...(plan.log.previous ? { previous: plan.log.previous } : {}),
    });
    return { version: nextDoc.version, affected, publishedIds, logId: logRef.id };
  });

  if (dryRun) return { version: outcome.version, affected: outcome.affected, purge: null, backup: null, logId: null };

  // 커밋 뒤: 이 인스턴스의 분류 메모, 공개 캐시, 백업 알림. 실패해도 바꾸기는 성공이다
  invalidateMemo(TAXONOMY_MEMO_KEY);
  const [purge, backup] = await Promise.all([
    purgePublicCacheMany(outcome.publishedIds),
    outcome.affected.length > 0
      ? notifyContentChanged({ entryId: outcome.affected[0].id, action: 'publish' })
      : Promise.resolve<BackupResult>('skipped'),
  ]);
  await recordSideEffects(outcome.logId, { purge, ...(outcome.affected.length > 0 ? { backup } : {}) });
  return { version: outcome.version, affected: outcome.affected, purge, backup: outcome.affected.length > 0 ? backup : null, logId: outcome.logId };
}

function invalidInput(field: string, message: string): ApiError {
  return new ApiError(400, 'INVALID_REQUEST', message, [{ field, message }]);
}

// ───────────── 카테고리 ─────────────

export type CategoryOperation =
  | { op: 'create'; key: string; label: string }
  | { op: 'rename'; key: string; label: string }
  | { op: 'rekey'; key: string; newKey: string } // 주소 key 바꾸기. newKey가 이미 있으면 400(합치기는 merge, PR-B 리뷰 B1)
  | { op: 'merge'; key: string; into: string } // 합치기: key의 글을 into로 옮기고 key를 지운다
  | { op: 'delete'; key: string }
  | { op: 'move'; ids: string[]; to: string }; // 글 옮기기

export async function changeCategories(input: CategoryOperation & { baseVersion: number; dryRun?: boolean }): Promise<MutationResult> {
  return runMutation(input.baseVersion, input.dryRun ?? false, async (tx, current) => {
    const categories = current.categories.map((category) => ({ ...category, synonymTags: [...category.synonymTags] }));
    switch (input.op) {
      case 'create': {
        const label = input.label.trim();
        const issue = checkCategoryKey(current, input.key) ?? checkCategoryLabel(current, label);
        if (issue) throw invalidInput(issue.field, issue.message);
        return {
          next: {
            categories: [...categories, { key: input.key, label, synonymTags: [] }],
            // 옛 key 별칭이었던 값을 새 카테고리로 쓰면 그 별칭은 지운다(그 주소가 새 카테고리다)
            categoryAliases: removeAliasFrom(current.categoryAliases, input.key),
            tagAliases: current.tagAliases,
          },
          changes: [],
          log: { action: 'category', op: 'create', title: `카테고리 만들기: ${label}(${input.key})`, slug: input.key, from: null, to: input.key },
        };
      }
      case 'rename': {
        const target = categories.find((category) => category.key === input.key);
        if (!target) throw new ApiError(404, 'NOT_FOUND', '카테고리가 없습니다.');
        const label = input.label.trim();
        const issue = checkCategoryLabel(current, label, input.key);
        if (issue) throw invalidInput(issue.field, issue.message);
        const before = target.label;
        target.label = label;
        // 이름은 글 문서에 없다. 글은 바꾸지 않고, 그 카테고리 글의 공개 캐시만 비운다(글 상세가 이름을 보인다)
        const users = await collectEntriesInTx(tx, 'category', input.key);
        return {
          next: { categories, categoryAliases: current.categoryAliases, tagAliases: current.tagAliases },
          changes: [],
          purgeOnly: users.filter((user) => user.entry.status === 'published').map((user) => user.id),
          log: { action: 'category', op: 'rename', title: `카테고리 이름 바꾸기: ${before} → ${label}`, slug: input.key, from: before, to: label },
        };
      }
      case 'rekey':
      case 'merge': {
        const source = categories.find((category) => category.key === input.key);
        if (!source) throw new ApiError(404, 'NOT_FOUND', '카테고리가 없습니다.');
        const merging = input.op === 'merge';
        const newKey = input.op === 'merge' ? input.into : input.newKey;
        if (newKey === input.key) throw invalidInput('key', '같은 카테고리입니다');
        if (merging) {
          if (!hasCategoryIn(current, newKey)) throw invalidInput('into', '합칠 카테고리가 목록에 없습니다');
        } else {
          const issue = checkCategoryKey(current, newKey);
          if (issue) {
            throw invalidInput(
              issue.field,
              hasCategoryIn(current, newKey) ? '이미 있는 key입니다. 합치려면 "다른 카테고리로 합치기"를 쓰세요' : issue.message,
            );
          }
        }
        const users = await collectEntriesInTx(tx, 'category', input.key);
        const changes: EntryChange[] = users.map((user) => ({
          ...user,
          draft: user.entry.draft.category === input.key ? { category: newKey } : {},
          published: user.entry.published?.category === input.key ? { category: newKey } : null,
        }));
        let nextCategories;
        if (merging) {
          // 합치기: 옮긴 뒤 옛 카테고리를 지운다. 동의어 태그는 남는 카테고리로 옮긴다
          nextCategories = categories
            .filter((category) => category.key !== input.key)
            .map((category) =>
              category.key === newKey
                ? { ...category, synonymTags: [...new Set([...category.synonymTags, ...source.synonymTags])] }
                : category,
            );
        } else {
          nextCategories = categories.map((category) => (category.key === input.key ? { ...category, key: newKey } : category));
        }
        const targetLabel = merging ? categoryLabelIn(current, newKey) : source.label;
        return {
          next: { categories: nextCategories, categoryAliases: addAlias(current.categoryAliases, input.key, newKey), tagAliases: current.tagAliases },
          changes,
          log: {
            action: 'category',
            op: merging ? 'merge' : 'rekey',
            title: merging
              ? `카테고리 합치기: ${source.label}(${input.key}) → ${targetLabel}(${newKey})`
              : `카테고리 주소 key 바꾸기: ${source.label} ${input.key} → ${newKey}`,
            slug: newKey,
            from: input.key,
            to: newKey,
          },
        };
      }
      case 'delete': {
        const target = categories.find((category) => category.key === input.key);
        if (!target) throw new ApiError(404, 'NOT_FOUND', '카테고리가 없습니다.');
        const users = await collectEntriesInTx(tx, 'category', input.key);
        if (users.length > 0) {
          throw new ApiError(409, 'CATEGORY_IN_USE', `이 카테고리를 쓰는 글이 ${users.length}편 있습니다. 먼저 옮기세요.`, {
            entries: users.map((user) => ({ id: user.id, title: user.entry.published?.title || user.entry.draft.title })),
          });
        }
        if (categories.length <= 1) throw new ApiError(409, 'LAST_CATEGORY', '마지막 카테고리는 지울 수 없습니다.');
        return {
          next: {
            categories: categories.filter((category) => category.key !== input.key),
            categoryAliases: removeAliasesTo(current.categoryAliases, input.key),
            tagAliases: current.tagAliases,
          },
          changes: [],
          log: { action: 'category', op: 'delete', title: `카테고리 지우기: ${target.label}(${input.key})`, slug: input.key, from: input.key, to: null },
        };
      }
      case 'move': {
        if (!hasCategoryIn(current, input.to)) throw invalidInput('to', '목록에 없는 카테고리입니다');
        const ids = [...new Set(input.ids)];
        if (ids.length === 0) throw invalidInput('ids', '옮길 글이 없습니다');
        const users = await readEntriesByIdInTx(tx, ids);
        const previous: Record<string, { draft: string | null; published: string | null }> = {};
        const changes: EntryChange[] = [];
        for (const user of users) {
          // 되돌리기 근거: 초안과 발행본의 옛 값을 함께 남긴다(PR-B 리뷰 S7)
          previous[user.id] = { draft: user.entry.draft.category, published: user.entry.published?.category ?? null };
          const draftSame = user.entry.draft.category === input.to;
          const publishedSame = !user.entry.published || user.entry.published.category === input.to;
          if (draftSame && publishedSame) continue; // 이미 그 카테고리다
          changes.push({ ...user, draft: { category: input.to }, published: user.entry.published ? { category: input.to } : null });
        }
        const label = categoryLabelIn(current, input.to);
        return {
          next: { categories, categoryAliases: current.categoryAliases, tagAliases: current.tagAliases },
          changes,
          log: { action: 'recategorize', op: 'move', title: `글 옮기기 → ${label}(${input.to})`, slug: input.to, from: null, to: input.to, previous },
        };
      }
    }
  });
}

// ───────────── 태그 ─────────────

// 태그 이름 바꾸기·합치기: from을 쓰는 모든 글의 초안·발행본에서 to로 바꾼다. to가 이미 있으면 합친다
export async function renameTag(input: { from: string; to: string; baseVersion: number; dryRun?: boolean }): Promise<MutationResult> {
  return runMutation(input.baseVersion, input.dryRun ?? false, async (tx, current) => {
    const from = input.from;
    // 새 이름은 코드 규칙으로만 정규화한다. 데이터 별칭을 따르면 되돌리기(b → a, 별칭 a → b)가 "같은 이름"이 된다.
    // 새 이름이 옛 별칭이었으면 addAlias가 그 줄을 지운다(다시 살아 있는 태그다)
    const to = normalizeTag(input.to);
    if (!from) throw invalidInput('from', '바꿀 태그가 필요합니다');
    if (!to) throw invalidInput('to', '새 태그 이름이 필요합니다');
    if (to === from) throw invalidInput('to', '같은 이름입니다');
    if (to.length > 100) throw invalidInput('to', '태그는 100자까지입니다');
    if (current.categories.some((category) => category.synonymTags.includes(to))) {
      throw invalidInput('to', '카테고리와 같은 뜻의 태그는 쓸 수 없습니다');
    }
    const users = await collectEntriesInTx(tx, 'tags', from);
    if (users.length === 0) throw new ApiError(404, 'NOT_FOUND', '이 태그를 쓰는 글이 없습니다.');
    const changes: EntryChange[] = users.map((user) => ({
      ...user,
      draft: user.entry.draft.tags.includes(from) ? { tags: replaceTag(user.entry.draft.tags, from, to) } : {},
      published: user.entry.published?.tags.includes(from) ? { tags: replaceTag(user.entry.published.tags, from, to) } : null,
    }));
    const merging = (await collectEntriesInTx(tx, 'tags', to)).length > 0;
    return {
      next: { categories: current.categories, categoryAliases: current.categoryAliases, tagAliases: addAlias(current.tagAliases, from, to) },
      changes,
      log: {
        action: 'retag',
        op: merging ? 'merge' : 'rename',
        title: `태그 ${merging ? '합치기' : '이름 바꾸기'}: ${from} → ${to}`,
        slug: to,
        from,
        to,
      },
    };
  });
}
