// 재건 2단계 마이그레이션: 옛 posts → entries, seriesMeta, assets(legacy) (Plan 5절)
//
// 실행 (저장소 루트에서):
//   node --env-file=.env scripts/migrate/stage2-entries.mjs                 # 시험 실행(기본). 아무것도 쓰지 않는다
//   node --env-file=.env scripts/migrate/stage2-entries.mjs --apply         # 실제 실행. B1 덤프를 먼저 쓴다
//   node --env-file=.env scripts/migrate/stage2-entries.mjs --apply --propagate-deletes  # 운영에서 지운 글을 entries에서도 지운다
//   --report <파일>  보고서를 파일에도 쓴다
//
// 원칙
// - 옛 posts·series에는 쓰지 않는다. 쓰기 대상은 entries(+revisions), seriesMeta, assets 3개뿐이다.
// - 어느 쪽 변경도 자동으로 덮지 않는다(Plan 5.4). 충돌은 보고만 한다.
// - 매핑 표에 맞지 않는 글이 하나라도 있으면 아무것도 쓰지 않고 멈춘다.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ASSET_PATH_PREFIX, collectContentStoragePaths, legacyAssetId } from '../../src/lib/asset-refs.ts';
import { assetDocSchema, entryDocSchema, seriesMetaSchema } from '../../src/lib/entry-schema.ts';
import {
  MappingError,
  decideSync,
  legacySourceUpdatedAt,
  legacyToEntry,
  parseMapping,
  resolveSeriesAssignments,
} from '../../src/lib/migrate/legacy-to-entry.ts';
import { getCategoryLabel, normalizeTags, stripTitlePrefix } from '../../src/lib/taxonomy.ts';
import {
  ASSETS,
  ChunkedBatch,
  ENTRIES,
  ENTRY_TOMBSTONES,
  LEGACY_POSTS,
  LEGACY_SERIES,
  PUBLISH_LOG,
  SERIES_META,
  hashDocData,
  initAdmin,
  parseArgs,
  serializeValue,
  toDate,
  writeDump,
} from './lib/admin.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MAPPING_PATH = path.join(SCRIPT_DIR, 'stage2-mapping.json');
// 이 스크립트가 쓸 수 있는 컬렉션 (Plan 5.1)
const WRITE_TARGETS = [ENTRIES, SERIES_META, ASSETS];

const args = parseArgs();
const APPLY = args.apply === true;
const PROPAGATE_DELETES = args['propagate-deletes'] === true;
const REPORT_FILE = typeof args.report === 'string' ? args.report : null;

const lines = [];
const out = (line = '') => lines.push(line);

// 옛 posts 문서 → 변환 함수 입력 (시각은 Date로)
function toLegacyData(raw) {
  return {
    ...raw,
    pubDate: toDate(raw.pubDate),
    updatedDate: toDate(raw.updatedDate),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// entries 문서 → 재동기화 판정 입력
function toSyncState(entry) {
  return {
    status: entry.status,
    draftVersion: entry.draft?.version ?? 0,
    revision: entry.published?.revision ?? 0,
    legacy: entry.legacy
      ? {
          sourceUpdatedAt: entry.legacy.sourceUpdatedAt,
          syncedDraftVersion: entry.legacy.syncedDraftVersion,
          syncedRevision: entry.legacy.syncedRevision,
          syncedStatus: entry.legacy.syncedStatus,
        }
      : null,
  };
}

// 다운로드 토큰으로 Firebase 다운로드 URL을 만든다 (파일 메타데이터는 바꾸지 않는다)
function downloadUrlFor(bucketName, file) {
  const tokens = file.metadata?.metadata?.firebaseStorageDownloadTokens;
  if (!tokens) return '';
  const token = String(tokens).split(',')[0];
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
}

// 두 값이 직렬화했을 때 같은지
function sameValue(a, b) {
  return JSON.stringify(serializeValue(a)) === JSON.stringify(serializeValue(b));
}

function mdCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function main() {
  const startedAt = new Date();
  const { db, bucket, bucketName } = initAdmin();
  const mapping = parseMapping(JSON.parse(await fs.readFile(MAPPING_PATH, 'utf8')));
  const warnings = [];
  const errors = [];

  // 1. 읽기 (모두 읽기 전용)
  const [postsSnap, seriesSnap, entriesSnap, tombstoneSnap, assetsSnap, seriesMetaSnap, [files]] = await Promise.all([
    db.collection(LEGACY_POSTS).get(),
    db.collection(LEGACY_SERIES).get(),
    db.collection(ENTRIES).get(),
    db.collection(ENTRY_TOMBSTONES).get(),
    db.collection(ASSETS).get(),
    db.collection(SERIES_META).get(),
    bucket.getFiles(),
  ]);

  const legacyPosts = postsSnap.docs.map((docSnap) => ({ id: docSnap.id, data: toLegacyData(docSnap.data()) }));
  const legacySeries = seriesSnap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      slug: typeof data.slug === 'string' ? data.slug : undefined,
      name: typeof data.name === 'string' ? data.name : '',
      description: typeof data.description === 'string' ? data.description : '',
      postIds: Array.isArray(data.postIds) ? data.postIds.filter((value) => typeof value === 'string') : [],
    };
  });
  const entriesById = new Map(entriesSnap.docs.map((docSnap) => [docSnap.id, docSnap.data()]));
  const tombstoneIds = new Set(tombstoneSnap.docs.map((docSnap) => docSnap.id));
  const assetsById = new Map(assetsSnap.docs.map((docSnap) => [docSnap.id, docSnap.data()]));
  const seriesMetaById = new Map(seriesMetaSnap.docs.map((docSnap) => [docSnap.id, docSnap.data()]));
  const legacyById = new Map(legacyPosts.map((post) => [post.id, post]));

  // 매핑 표가 가리키는 글이 실제로 있는지
  const excludedIds = new Set(mapping.exclude.map((item) => item.id));
  for (const item of mapping.exclude) {
    const target = legacyById.get(item.id);
    if (!target) warnings.push(`제외 목록의 글이 없습니다: ${item.id}`);
    else if (item.title && item.title !== target.data.title) warnings.push(`제외 목록의 제목이 다릅니다: ${item.id}`);
  }
  for (const [postId, override] of Object.entries(mapping.postOverrides)) {
    const target = legacyById.get(postId);
    if (!target) warnings.push(`글별 예외의 글이 없습니다: ${postId}`);
    else if (override.title && override.title !== target.data.title) warnings.push(`글별 예외의 제목이 다릅니다: ${postId}`);
  }

  const includedPosts = legacyPosts.filter((post) => !excludedIds.has(post.id));

  // 2. 연재 배정
  let seriesResolution;
  try {
    seriesResolution = resolveSeriesAssignments(includedPosts, legacySeries, mapping);
    warnings.push(...seriesResolution.warnings);
  } catch (error) {
    if (error instanceof MappingError) errors.push(error.message);
    else throw error;
  }

  // Storage 파일 → legacy 자산 후보
  const legacyFiles = files.filter((file) => !file.name.startsWith(ASSET_PATH_PREFIX) && !file.name.endsWith('/'));
  const legacyPathSet = new Set(legacyFiles.map((file) => file.name));
  const resolveAssetId = (storagePath) => (legacyPathSet.has(storagePath) ? legacyAssetId(storagePath) : null);

  // 3. 모든 글을 먼저 변환해 본다. 하나라도 실패하면 아무것도 쓰지 않는다
  const now = new Date();
  const baseCtx = (postId) => ({
    mapping,
    series: seriesResolution?.assignments.get(postId) ?? null,
    bucket: bucketName,
    resolveAssetId,
    now,
  });
  const previews = new Map();
  for (const post of includedPosts) {
    try {
      previews.set(post.id, legacyToEntry(post, baseCtx(post.id)));
    } catch (error) {
      if (error instanceof MappingError) errors.push(error.message);
      else throw error;
    }
  }

  // 4. 판정
  const decisions = [];
  for (const post of legacyPosts) {
    const entry = entriesById.get(post.id) ?? null;
    const decision = decideSync({
      legacyUpdatedAt: legacySourceUpdatedAt(post.data) ?? new Date(0),
      entry: entry ? toSyncState(entry) : null,
      tombstone: tombstoneIds.has(post.id),
      excluded: excludedIds.has(post.id),
    });
    decisions.push({ id: post.id, decision, post, entry });
  }
  for (const [entryId, entry] of entriesById) {
    if (!entry.legacy?.postId) continue; // 새 관리자로 만든 글은 건드리지 않는다
    if (legacyById.has(entry.legacy.postId)) continue;
    decisions.push({ id: entryId, decision: 'delete-candidate', post: null, entry });
  }

  // 판정별 쓸 문서 계산
  const writes = { create: [], update: [] };
  for (const item of decisions) {
    if (item.decision === 'create') {
      const data = previews.get(item.id);
      if (data) writes.create.push({ id: item.id, data });
    }
    if (item.decision === 'update') {
      const previous = item.entry;
      try {
        const data = legacyToEntry(item.post, {
          ...baseCtx(item.id),
          previous: { draftVersion: previous.draft.version, revision: previous.published?.revision ?? 0 },
        });
        // slug가 바뀌었으면 예전 공개 slug를 slugHistory에 남긴다
        const history = new Set(Array.isArray(previous.slugHistory) ? previous.slugHistory : []);
        const oldSlug = previous.published?.slug;
        if (oldSlug && oldSlug !== data.draft.slug) history.add(oldSlug);
        history.delete(data.draft.slug);
        data.slugHistory = [...history];
        writes.update.push({ id: item.id, data });
      } catch (error) {
        if (error instanceof MappingError) errors.push(error.message);
        else throw error;
      }
    }
  }

  // 마이그레이션 뒤 entries의 모습 (자산 usedBy 계산용)
  const finalEntries = new Map(entriesById);
  for (const item of [...writes.create, ...writes.update]) finalEntries.set(item.id, item.data);
  if (PROPAGATE_DELETES) {
    for (const item of decisions) if (item.decision === 'delete-candidate') finalEntries.delete(item.id);
  }

  // 5. seriesMeta
  const seriesMetaWrites = [];
  for (const [key, meta] of seriesResolution?.meta ?? []) {
    const parsed = seriesMetaSchema.safeParse(meta);
    if (!parsed.success) {
      errors.push(`seriesMeta/${key}가 스키마에 맞지 않습니다: ${parsed.error.message}`);
      continue;
    }
    if (!sameValue(seriesMetaById.get(key), parsed.data)) seriesMetaWrites.push({ id: key, data: parsed.data });
  }

  // 6. legacy 자산
  const usage = new Map(); // 경로 → 글 ID 집합
  for (const [entryId, entry] of finalEntries) {
    for (const content of [entry.draft, entry.published]) {
      if (!content) continue;
      for (const storagePath of collectContentStoragePaths(content, bucketName)) {
        if (!usage.has(storagePath)) usage.set(storagePath, new Set());
        usage.get(storagePath).add(entryId);
      }
    }
  }
  const assetWrites = [];
  const unusedFiles = [];
  let assetsUnchanged = 0;
  for (const file of legacyFiles) {
    const id = legacyAssetId(file.name);
    const existing = assetsById.get(id);
    const usedBy = [...(usage.get(file.name) ?? [])].sort();
    const url = downloadUrlFor(bucketName, file);
    if (!url) warnings.push(`다운로드 토큰이 없는 파일: ${file.name}`);
    const desired = {
      storagePath: file.name,
      url,
      contentType: file.metadata?.contentType || 'application/octet-stream',
      bytes: Number(file.metadata?.size ?? 0),
      sha256: null,
      variants: null,
      status: 'ready',
      legacy: true,
      usedBy,
      // legacy 자산에는 고아 표시를 하지 않는다(Plan D6). 보고서에만 적는다
      orphanedAt: existing?.orphanedAt ?? null,
      uploadedAt: existing?.uploadedAt ?? new Date(file.metadata?.timeCreated ?? Date.now()),
    };
    if (usedBy.length === 0) unusedFiles.push(file.name);
    const parsed = assetDocSchema.safeParse(desired);
    if (!parsed.success) {
      errors.push(`assets/${id}가 스키마에 맞지 않습니다: ${parsed.error.message}`);
      continue;
    }
    if (existing && sameValue(existing, desired)) assetsUnchanged += 1;
    else assetWrites.push({ id, data: desired, existed: Boolean(existing) });
  }
  const missingFiles = [...usage.keys()].filter(
    (storagePath) => !legacyPathSet.has(storagePath) && !storagePath.startsWith(ASSET_PATH_PREFIX),
  );
  for (const storagePath of missingFiles) warnings.push(`글이 가리키지만 Storage에 없는 파일: ${storagePath}`);

  // 판정별 수
  const counts = {};
  for (const item of decisions) counts[item.decision] = (counts[item.decision] ?? 0) + 1;
  const createdPublished = writes.create.filter((item) => item.data.status === 'published').length;

  // ===== 보고서 =====
  out(`# 재건 2단계 마이그레이션 보고서 (${APPLY ? '실제 실행' : '시험 실행'})`);
  out();
  out(`- 시각: ${startedAt.toISOString()}`);
  out(`- 매핑 표 버전: ${mapping.mappingVersion}`);
  out(`- 옛 posts ${legacyPosts.length}개, 옛 series ${legacySeries.length}개, 기존 entries ${entriesById.size}개`);
  out(`- 삭제 전파: ${PROPAGATE_DELETES ? '켬' : '끔(보고만)'}`);
  out();
  out('## 1. 판정별 수');
  out();
  out('| 판정 | 수 |');
  out('|---|---|');
  for (const key of ['create', 'update', 'skip', 'conflict', 'skip-deleted-in-rebuild', 'delete-candidate', 'exclude']) {
    out(`| ${key} | ${counts[key] ?? 0} |`);
  }
  out();
  out(`생성 ${writes.create.length}편 중 발행 ${createdPublished}, 초안 ${writes.create.length - createdPublished}.`);
  out();
  const notable = decisions.filter((item) => !['create', 'skip'].includes(item.decision));
  if (notable.length > 0) {
    out('| 문서 ID | 판정 | 제목 |');
    out('|---|---|---|');
    for (const item of notable) {
      out(`| ${item.id} | ${item.decision} | ${mdCell(item.post?.data.title ?? item.entry?.draft?.title)} |`);
    }
    out();
  }

  // 보고서 대상: 쓸 글. 쓸 글이 없으면(재실행) 변환 미리보기 전체
  const writeItems = [...writes.create, ...writes.update];
  const reportItems = writeItems.length > 0 ? writeItems : [...previews].map(([id, data]) => ({ id, data }));
  const allTargets = reportItems.map((item) => item.data);

  out('## 2. 카테고리별 수');
  out();
  out('| 카테고리 | 표시 이름 | 편 수 |');
  out('|---|---|---|');
  const byCategory = new Map();
  for (const entry of allTargets) byCategory.set(entry.draft.category, (byCategory.get(entry.draft.category) ?? 0) + 1);
  for (const [key, count] of [...byCategory].sort((a, b) => b[1] - a[1])) {
    out(`| ${key} | ${getCategoryLabel(key)} | ${count} |`);
  }
  out();

  out('## 3. 태그 전후');
  out();
  const rawTagCounts = new Map();
  const newTagCounts = new Map();
  for (const post of includedPosts) {
    for (const tag of Array.isArray(post.data.tags) ? post.data.tags : []) {
      rawTagCounts.set(tag, (rawTagCounts.get(tag) ?? 0) + 1);
    }
  }
  for (const entry of allTargets) for (const tag of entry.draft.tags) newTagCounts.set(tag, (newTagCounts.get(tag) ?? 0) + 1);
  out(`옛 태그 ${rawTagCounts.size}종 → 새 태그 ${newTagCounts.size}종`);
  out();
  out('| 옛 태그 | 편 수 | 정규화 결과 |');
  out('|---|---|---|');
  for (const [tag, count] of [...rawTagCounts].sort((a, b) => b[1] - a[1])) {
    const [normalized] = normalizeTags([tag]);
    out(`| ${mdCell(tag)} | ${count} | ${normalized ? `\`${normalized}\`` : '(카테고리와 같은 뜻이라 뺌)'} |`);
  }
  out();
  out('| 새 태그 | 편 수 |');
  out('|---|---|');
  for (const [tag, count] of [...newTagCounts].sort((a, b) => b[1] - a[1])) out(`| \`${tag}\` | ${count} |`);
  out();
  const untagged = allTargets.filter((entry) => entry.draft.tags.length === 0);
  out(`태그 없는 글 ${untagged.length}편: ${untagged.map((entry) => `「${entry.draft.title}」`).join(', ') || '없음'}`);
  out();
  const overridden = Object.keys(mapping.postOverrides);
  out(`글별 예외 ${overridden.length}건: ${overridden.map((id) => `${id}(「${legacyById.get(id)?.data.title ?? '?'}」)`).join(', ')}`);
  out();

  out('## 4. 연재');
  out();
  for (const [key, meta] of seriesResolution?.meta ?? []) {
    const members = allTargets
      .filter((entry) => entry.draft.series?.key === key)
      .sort((a, b) => a.draft.series.order - b.draft.series.order);
    out(`### \`${key}\` — ${meta.title} (${members.length}편)`);
    out();
    if (meta.description) out(`설명: ${meta.description}`);
    out();
    out('| 순서 | 제목 | slug |');
    out('|---|---|---|');
    for (const entry of members) out(`| ${entry.draft.series.order} | ${mdCell(entry.draft.title)} | ${mdCell(entry.draft.slug)} |`);
    out();
  }
  out(`seriesMeta 쓰기: ${seriesMetaWrites.length}건 (${seriesMetaWrites.map((item) => item.id).join(', ') || '없음'})`);
  out();

  out('## 5. 제목 변환 전후 (전체)');
  out();
  out('| 문서 ID | 상태 | 옛 제목 | 새 제목 | 카테고리 | 태그 |');
  out('|---|---|---|---|---|---|');
  const rows = [...reportItems].sort((a, b) => a.data.draft.title.localeCompare(b.data.draft.title, 'ko'));
  for (const { id, data } of rows) {
    const before = legacyById.get(id)?.data.title ?? '';
    out(
      `| ${id} | ${data.status} | ${mdCell(before)} | ${mdCell(data.draft.title)} | ${data.draft.category} | ${data.draft.tags.join(', ')} |`,
    );
  }
  out();
  const prefixMismatch = rows.filter(({ id, data }) => stripTitlePrefix(legacyById.get(id)?.data.title ?? '').trim() !== data.draft.title);
  if (prefixMismatch.length > 0) warnings.push(`제목 변환이 접두사 제거와 다른 글 ${prefixMismatch.length}편`);

  out('## 6. 자산(legacy)');
  out();
  out(`- Storage 파일 ${files.length}개 (legacy 대상 ${legacyFiles.length}개, assets/ ${files.length - legacyFiles.length}개)`);
  out(`- assets 문서 쓰기: 새로 ${assetWrites.filter((item) => !item.existed).length}, 갱신 ${assetWrites.filter((item) => item.existed).length}, 같음 ${assetsUnchanged}`);
  out(`- 어느 글도 쓰지 않는 파일 ${unusedFiles.length}개 (legacy라 고아 표시를 하지 않는다. 병합 전에는 정리하지 않는다):`);
  out();
  for (const name of unusedFiles.sort()) out(`  - \`${name}\``);
  out();

  out('## 7. 경고와 오류');
  out();
  out(`- 오류 ${errors.length}건`);
  for (const message of errors) out(`  - ${message}`);
  out(`- 경고 ${warnings.length}건`);
  for (const message of warnings) out(`  - ${message}`);
  out();

  if (errors.length > 0) {
    out('**오류가 있어 아무것도 쓰지 않았다.**');
    await finish(1);
    return;
  }

  if (!APPLY) {
    out('시험 실행이다. 아무것도 쓰지 않았다. 실제 실행은 `--apply`.');
    await finish(0);
    return;
  }

  // ===== 실제 실행 =====
  // B1 덤프 (실패하면 예외로 멈춘다)
  const dump = await writeDump(
    db,
    [LEGACY_POSTS, LEGACY_SERIES, ENTRIES, SERIES_META, ASSETS, ENTRY_TOMBSTONES, PUBLISH_LOG],
    'stage2-migrate',
  );
  out('## 8. 실제 실행 결과');
  out();
  out(`- B1 덤프: \`${dump.dir}\` (${Object.entries(dump.counts).map(([name, count]) => `${name} ${count}`).join(', ')})`);

  // 옛 posts 해시 (실행 전)
  const beforeHashes = new Map(postsSnap.docs.map((docSnap) => [docSnap.id, hashDocData(docSnap.data())]));

  const batch = new ChunkedBatch(db, WRITE_TARGETS);
  for (const item of writes.create) {
    const ref = db.collection(ENTRIES).doc(item.id);
    await batch.op('create', ref, item.data);
    if (item.data.published) {
      await batch.op('set', ref.collection('revisions').doc(String(item.data.published.revision)), {
        ...item.data.published,
        publishedAt: item.data.lastPublishedAt,
      });
    }
  }
  for (const item of writes.update) {
    const ref = db.collection(ENTRIES).doc(item.id);
    await batch.op('set', ref, item.data);
    if (item.data.published) {
      await batch.op('set', ref.collection('revisions').doc(String(item.data.published.revision)), {
        ...item.data.published,
        publishedAt: item.data.lastPublishedAt,
      });
    }
  }
  for (const item of seriesMetaWrites) await batch.op('set', db.collection(SERIES_META).doc(item.id), item.data);
  for (const item of assetWrites) await batch.op('set', db.collection(ASSETS).doc(item.id), item.data);
  await batch.flush();

  let deleted = 0;
  if (PROPAGATE_DELETES) {
    for (const item of decisions.filter((entry) => entry.decision === 'delete-candidate')) {
      const ref = db.collection(ENTRIES).doc(item.id);
      batch.check(ref);
      await db.recursiveDelete(ref);
      deleted += 1;
    }
  }
  out(`- 쓴 문서 ${batch.total}개 (entries 생성 ${writes.create.length}, 갱신 ${writes.update.length}, seriesMeta ${seriesMetaWrites.length}, assets ${assetWrites.length}), 삭제 ${deleted}`);

  // 7. 다시 읽어 스키마 검증
  const afterEntries = await db.collection(ENTRIES).get();
  const invalid = [];
  for (const docSnap of afterEntries.docs) {
    const parsed = entryDocSchema.safeParse(docSnap.data());
    if (!parsed.success) invalid.push(`${docSnap.id}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  out(`- entries ${afterEntries.size}개 스키마 검증: 실패 ${invalid.length}`);
  for (const message of invalid) out(`  - ${message}`);

  // 8. 수 맞추기
  const migratedCount = afterEntries.docs.filter((docSnap) => docSnap.data().legacy?.postId).length;
  const expected = legacyPosts.length - excludedIds.size - (counts['skip-deleted-in-rebuild'] ?? 0);
  out(`- 수 맞추기: 옛 글 ${legacyPosts.length} − 제외 ${excludedIds.size} − rebuild 삭제 ${counts['skip-deleted-in-rebuild'] ?? 0} = ${expected}, legacy 표지가 있는 entries ${migratedCount} → ${expected === migratedCount ? '일치' : '불일치'}`);

  // 9. 옛 posts 해시 비교
  const afterPosts = await db.collection(LEGACY_POSTS).get();
  const changedPosts = afterPosts.docs.filter((docSnap) => beforeHashes.get(docSnap.id) !== hashDocData(docSnap.data()));
  const goneOrNew = afterPosts.size !== beforeHashes.size;
  out(`- 옛 posts 해시: ${changedPosts.length === 0 && !goneOrNew ? '실행 전후 같음' : `다름 ${changedPosts.length}건${goneOrNew ? ', 문서 수가 바뀜' : ''} (운영 CMS가 실행 중에 썼는지 확인)`}`);
  out();

  const reportPath = path.join(dump.dir, 'report.md');
  await fs.writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');
  out(`보고서: \`${reportPath}\``);
  await finish(invalid.length > 0 || expected !== migratedCount ? 1 : 0);
}

async function finish(code) {
  const text = `${lines.join('\n')}\n`;
  process.stdout.write(text);
  if (REPORT_FILE) await fs.writeFile(REPORT_FILE, text, 'utf8');
  process.exitCode = code;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
