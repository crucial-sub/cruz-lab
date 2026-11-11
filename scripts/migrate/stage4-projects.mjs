// 재건 4단계 프로젝트 글 이전: 저장소 파일 → entries(kind project), seriesMeta.project, assets (Plan D1 a, 7절, 9.2)
//
// 실행 (저장소 루트에서):
//   node --env-file=.env scripts/migrate/stage4-projects.mjs                                  # 시험 실행(기본). 읽기만 한다
//   node --env-file=.env scripts/migrate/stage4-projects.mjs --apply --base http://localhost:4327
//       # 실제 실행. 덤프를 먼저 쓴다. 이미지는 개발 서버의 자산 API로 올린다(2단계 흐름: sha256 → upload-url → PUT → finalize)
//   node --env-file=.env scripts/migrate/stage4-projects.mjs --rollback --manifest <migration.json>   # 되돌리기 시험 실행
//   node --env-file=.env scripts/migrate/stage4-projects.mjs --rollback --apply --manifest <migration.json>
//       # 되돌리기. 덤프를 쓴 뒤 지운다. migration.json은 실제 실행이 덤프 폴더에 남긴 기록이다.
//       # 기록에 있는 "새로 올린 자산"·"새로 만든 seriesMeta"만 지운다. 기록이 없으면 글과 project 칸만 지우고
//       # 자산은 usedBy만 고친다(고아 표시 → 7일 뒤 정리). 이전 뒤 에디터로 고친 글은 --include-edited가 있어야 지운다.
//   --source-root <checkout 루트>  원본(src/content/projects, src/assets/img/projects)을 읽을 저장소. 기본은 이 저장소다.
//                                   4단계 PR-C가 원본을 지운 뒤에 다시 돌릴 때는 main checkout을 준다(Plan 7절, 감사 문서 11.3).
//   --report <파일>  보고서를 파일에도 쓴다
//
// 원칙
// - 쓰기 대상은 entries(+revisions), seriesMeta, assets 3개뿐이다. 옛 posts·series·콘텐츠 컬렉션은 건드리지 않는다.
// - 문서 ID는 project-<프로젝트 key>-<글 slug>로 고정이다. 다시 돌려도 같은 문서다(멱등).
// - 에디터로 고친 글은 덮지 않는다. 원본도 바뀌었으면 충돌로 보고한다(2단계 5.4 재동기화와 같은 규칙).
// - 원본 하나라도 규칙에 맞지 않으면 아무것도 쓰지 않고 멈춘다.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import sharp from 'sharp';
import { assetIdFromStoragePath, collectContentStoragePaths } from '../../src/lib/asset-refs.ts';
import { MAX_IMAGE_BYTES } from '../../src/lib/asset-rules.ts';
import { entryDocSchema, seriesMetaSchema } from '../../src/lib/entry-schema.ts';
import {
  ProjectSourceError,
  collectInternalLinks,
  findProjectSourceCollisions,
  planProjectRollback,
  collectProjectImageRefs,
  decideProjectSync,
  parseProjectMetaFile,
  parseProjectPostFile,
  projectEntryId,
  projectPostToEntry,
  projectSourceHash,
  rewriteProjectImages,
} from '../../src/lib/migrate/project-to-entry.ts';
import {
  ASSETS,
  ChunkedBatch,
  ENTRIES,
  ENTRY_TOMBSTONES,
  PUBLISH_LOG,
  SERIES_META,
  initAdmin,
  parseArgs,
  serializeValue,
  writeDump,
} from './lib/admin.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
// 이 스크립트가 쓸 수 있는 컬렉션 (2단계 Plan 5.1과 같은 3개)
const WRITE_TARGETS = [ENTRIES, SERIES_META, ASSETS];
const PROJECTS_DIR = 'src/content/projects';
const PLACEHOLDER_URL = 'about:blank#upload-pending';

const args = parseArgs();
const APPLY = args.apply === true;
const ROLLBACK = args.rollback === true;
const BASE = typeof args.base === 'string' ? args.base.replace(/\/$/, '') : null;
const SOURCE_ROOT = path.resolve(
  typeof args['source-root'] === 'string' ? args['source-root'] : REPO_ROOT,
);
const REPORT_FILE = typeof args.report === 'string' ? args.report : null;
// 되돌리기: 이전 실행이 덤프 폴더에 남긴 기록(migration.json). 쉼표로 여러 개. 없으면 자산·seriesMeta 문서를 지우지 않는다
const MANIFESTS = typeof args.manifest === 'string' ? args.manifest.split(',').filter(Boolean) : [];
// 되돌리기: 이전 뒤 에디터로 고친 글도 지운다(기본은 빼고 알린다)
const INCLUDE_EDITED = args['include-edited'] === true;
// 실제 실행이 덤프 폴더에 쓰는 기록 파일 이름 (writeDump의 manifest.json과 다르다)
const MIGRATION_RECORD = 'migration.json';

// Firestore 'in'·'array-contains-any' 조건은 값 30개까지다. 나눠서 묻는다
function chunks(values, size = 30) {
  const result = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

const lines = [];
const out = (line = '') => lines.push(line);

function mdCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// 두 값이 직렬화했을 때 같은지
function sameValue(a, b) {
  return JSON.stringify(serializeValue(a)) === JSON.stringify(serializeValue(b));
}

// 파일의 첫 커밋·마지막 커밋 시각 (이름이 바뀐 파일도 따라간다)
function gitDates(repoPath) {
  const output = execFileSync(
    'git',
    ['-C', SOURCE_ROOT, 'log', '--follow', '--format=%aI', '--', repoPath],
    {
      encoding: 'utf8',
    },
  ).trim();
  if (!output) throw new ProjectSourceError('git 기록이 없습니다(커밋되지 않은 파일)', repoPath);
  const dates = output.split('\n');
  return { first: new Date(dates.at(-1)), last: new Date(dates[0]) };
}

// sharp 형식 → 자산 API 형식
const CONTENT_TYPES = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
const EXTENSION_FORMATS = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.webp': 'webp',
  '.gif': 'gif',
};

// ───────────── 원본 읽기 ─────────────

async function readSources() {
  const projectsRoot = path.join(SOURCE_ROOT, PROJECTS_DIR);
  let keys;
  try {
    keys = (await fs.readdir(projectsRoot, { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .map((item) => item.name);
  } catch {
    throw new ProjectSourceError(
      `원본 폴더가 없습니다: ${projectsRoot}. --source-root로 원본이 있는 checkout을 주세요`,
    );
  }
  keys.sort();
  const projects = [];
  const posts = [];
  const images = new Map(); // repoPath → { buffer, sha256, contentType, width, height, pages }
  for (const key of keys) {
    const dir = path.join(projectsRoot, key);
    const files = (await fs.readdir(dir))
      .filter((name) => name.endsWith('.md') || name.endsWith('.mdx'))
      .sort();
    if (!files.includes('project.md'))
      throw new ProjectSourceError('project.md가 없습니다', `${PROJECTS_DIR}/${key}`);
    const metaPath = `${PROJECTS_DIR}/${key}/project.md`;
    projects.push(
      parseProjectMetaFile(await fs.readFile(path.join(dir, 'project.md'), 'utf8'), key, metaPath),
    );
    for (const name of files) {
      if (name === 'project.md') continue;
      const repoPath = `${PROJECTS_DIR}/${key}/${name}`;
      if (name.endsWith('.mdx'))
        throw new ProjectSourceError(
          'mdx 글은 옮기지 않는다(본문을 그대로 그릴 수 없다)',
          repoPath,
        );
      const bytes = await fs.readFile(path.join(dir, name));
      const post = parseProjectPostFile(
        bytes.toString('utf8'),
        key,
        name.slice(0, -'.md'.length),
        repoPath,
      );
      const refs = collectProjectImageRefs(post.markdown, repoPath);
      for (const ref of refs) {
        if (images.has(ref.repoPath)) continue;
        const absolute = path.join(SOURCE_ROOT, ref.repoPath);
        let buffer;
        try {
          buffer = await fs.readFile(absolute);
        } catch {
          throw new ProjectSourceError(`본문 이미지 파일이 없습니다: ${ref.repoPath}`, repoPath);
        }
        const metadata = await sharp(buffer, { animated: true }).metadata();
        const expected = EXTENSION_FORMATS[path.extname(ref.repoPath).toLowerCase()];
        if (!CONTENT_TYPES[metadata.format] || metadata.format !== expected) {
          throw new ProjectSourceError(
            `이미지 형식이 확장자와 다르거나 받지 않는 형식입니다: ${ref.repoPath} (${metadata.format})`,
            repoPath,
          );
        }
        if (buffer.length > MAX_IMAGE_BYTES)
          throw new ProjectSourceError(`이미지가 한도를 넘습니다: ${ref.repoPath}`, repoPath);
        images.set(ref.repoPath, {
          buffer,
          sha256: sha256(buffer),
          contentType: CONTENT_TYPES[metadata.format],
          width: metadata.width,
          height: metadata.pageHeight ?? metadata.height,
          pages: metadata.pages ?? 1,
        });
      }
      const dates = gitDates(repoPath);
      posts.push({
        id: projectEntryId(key, post.slug),
        repoPath,
        post,
        refs,
        bytes,
        dates,
        internalLinks: collectInternalLinks(post.markdown),
        sourceHash: projectSourceHash(
          bytes,
          refs.map((ref) => ({ repoPath: ref.repoPath, sha256: images.get(ref.repoPath).sha256 })),
        ),
      });
    }
  }
  return { projects, posts, images };
}

// ───────────── 자산 API (2단계 흐름) ─────────────

let sessionCookie = '';

async function api(method, apiPath, body) {
  const headers = { Origin: new URL(BASE).origin, Cookie: `cruz_admin=${sessionCookie}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE}${apiPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

// 관리자 세션 쿠키 받기 (2단계 API 스모크와 같은 방법)
async function signIn() {
  const adminUid = process.env.ADMIN_UID;
  const apiKey = process.env.PUBLIC_FIREBASE_API_KEY;
  if (!adminUid || !apiKey)
    throw new Error('.env에 ADMIN_UID와 PUBLIC_FIREBASE_API_KEY가 필요합니다.');
  const customToken = await getAuth().createCustomToken(adminUid);
  const signInResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const signInJson = await signInResponse.json();
  if (!signInJson.idToken) throw new Error(`signInWithCustomToken 실패: ${signInResponse.status}`);
  const response = await fetch(`${BASE}/api/admin/session`, {
    method: 'POST',
    headers: { Origin: new URL(BASE).origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: signInJson.idToken }),
  });
  const match = (response.headers.get('set-cookie') ?? '').match(/cruz_admin=([^;]+)/);
  if (response.status !== 204 || !match) throw new Error(`세션 발급 실패: ${response.status}`);
  sessionCookie = match[1];
}

async function signOut() {
  if (!sessionCookie) return;
  await api('DELETE', '/api/admin/session').catch(() => {});
}

// 이미지 하나를 올린다. 같은 해시의 자산이 있으면 그것을 쓴다(멱등)
async function uploadImage(repoPath, image) {
  const fileName = path.basename(repoPath);
  const request = await api('POST', '/api/admin/assets/upload-url', {
    fileName,
    contentType: image.contentType,
    bytes: image.buffer.length,
    sha256: image.sha256,
  });
  if (request.status !== 200)
    throw new Error(`upload-url 실패(${repoPath}): ${request.status} ${request.text}`);
  if (request.json.existing) return { asset: request.json.existing, reused: true };
  const { assetId, uploadUrl, requiredHeaders } = request.json;
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: requiredHeaders,
    body: image.buffer,
  });
  if (!put.ok) throw new Error(`PUT 실패(${repoPath}): ${put.status}`);
  const finalize = await api('POST', `/api/admin/assets/${assetId}/finalize`);
  if (finalize.status !== 200 || finalize.json?.asset?.status !== 'ready') {
    throw new Error(`finalize 실패(${repoPath}): ${finalize.status} ${finalize.text}`);
  }
  return { asset: finalize.json.asset, reused: false };
}

// ───────────── 이전 ─────────────

async function migrate() {
  const startedAt = new Date();
  const { db, bucketName } = initAdmin();
  const errors = [];
  const warnings = [];

  const { projects, posts, images } = await readSources();
  const postIds = posts.map((item) => item.id);
  const imageHashes = [...new Set([...images.values()].map((image) => image.sha256))];
  // 원본 안의 문서 ID·slug 겹침(PR-C 리뷰 경미 7)
  errors.push(
    ...findProjectSourceCollisions(
      posts.map((item) => ({ key: item.post.key, slug: item.post.slug, file: item.repoPath })),
    ),
  );

  // 1. 읽기 (모두 읽기 전용)
  const queryIn = async (collection, field, values) => {
    const snaps = await Promise.all(
      chunks(values).map((part) => db.collection(collection).where(field, 'in', part).get()),
    );
    return snaps.flatMap((snap) => snap.docs);
  };
  const [entriesSnap, seriesMetaSnap, sameHashDocs, deleteLogDocs, tombstoneSnaps] =
    await Promise.all([
      db.collection(ENTRIES).get(),
      db.collection(SERIES_META).get(),
      queryIn(ASSETS, 'sha256', imageHashes),
      queryIn(PUBLISH_LOG, 'entryId', postIds),
      postIds.length > 0
        ? db.getAll(...postIds.map((id) => db.collection(ENTRY_TOMBSTONES).doc(id)))
        : Promise.resolve([]),
    ]);
  const entriesById = new Map(entriesSnap.docs.map((docSnap) => [docSnap.id, docSnap.data()]));
  // 읽은 때의 문서 시각. 갱신은 이 시각 뒤에 문서가 바뀌었으면 실패한다(PR-C 리뷰 경미 8)
  const updateTimeById = new Map(
    entriesSnap.docs.map((docSnap) => [docSnap.id, docSnap.updateTime]),
  );
  const seriesMetaById = new Map(
    seriesMetaSnap.docs.map((docSnap) => [docSnap.id, docSnap.data()]),
  );
  const readyAssetByHash = new Map();
  for (const docSnap of sameHashDocs) {
    const data = docSnap.data();
    if (data.status === 'ready' && !readyAssetByHash.has(data.sha256))
      readyAssetByHash.set(data.sha256, { id: docSnap.id, ...data });
  }
  // 에디터로 지운 글: entryTombstones(삭제 API가 projectSource 글에도 먼저 쓴다) 또는 publishLog의 delete 기록
  const deletedIds = new Set([
    ...deleteLogDocs
      .filter((docSnap) => docSnap.get('action') === 'delete')
      .map((docSnap) => docSnap.get('entryId')),
    ...tombstoneSnaps.filter((docSnap) => docSnap.exists).map((docSnap) => docSnap.id),
  ]);

  // 2. slug 충돌: 프로젝트 글 slug를 다른 글이 쓰고 있으면 안 된다(slug 공간이 하나다, 4단계 D11)
  const ownIds = new Set(postIds);
  for (const item of posts) {
    for (const [entryId, entry] of entriesById) {
      if (ownIds.has(entryId)) continue;
      const slug = item.post.slug;
      const reserved = entry.status === 'published' || entry.status === 'hidden';
      if (
        reserved &&
        (entry.published?.slug === slug || (entry.slugHistory ?? []).includes(slug))
      ) {
        errors.push(
          `slug 충돌: ${slug}를 entries/${entryId}(${entry.kind}, ${entry.status})가 쓴다`,
        );
      } else if (entry.draft?.slug === slug) {
        warnings.push(
          `초안 slug가 같다: ${slug} ← entries/${entryId}(${entry.status}). 그 초안을 발행할 때 막힌다`,
        );
      }
    }
  }

  // 3. 판정
  const decisions = posts.map((item) => {
    const entry = entriesById.get(item.id) ?? null;
    const decision = decideProjectSync({
      sourceHash: item.sourceHash,
      entry: entry
        ? {
            status: entry.status,
            draftVersion: entry.draft?.version ?? 0,
            revision: entry.published?.revision ?? 0,
            projectSource: entry.projectSource ?? null,
          }
        : null,
      deletedInRebuild: deletedIds.has(item.id),
    });
    return { ...item, entry, decision };
  });
  // 원본에 없는 이전 글(원본 파일을 지웠거나 이름을 바꿨다). 자동으로 지우지 않는다
  for (const [entryId, entry] of entriesById) {
    if (entry.projectSource && !ownIds.has(entryId)) {
      warnings.push(
        `원본에 없는 프로젝트 글: entries/${entryId} (${entry.projectSource.path}). 지우려면 사람이 정한다`,
      );
    }
  }
  const toWrite = decisions.filter(
    (item) => item.decision === 'create' || item.decision === 'update',
  );

  // 4. 이미지: 쓸 글이 쓰는 이미지만 올린다
  const neededImages = new Set(toWrite.flatMap((item) => item.refs.map((ref) => ref.repoPath)));
  const urlByRepoPath = new Map();
  const assetIdByRepoPath = new Map();
  for (const repoPath of neededImages) {
    const existing = readyAssetByHash.get(images.get(repoPath).sha256);
    if (existing) {
      urlByRepoPath.set(repoPath, existing.url);
      assetIdByRepoPath.set(repoPath, existing.id);
    }
  }

  // 5. 문서 계산 (시험 실행은 아직 없는 자산 주소를 자리 표시로 둔다)
  const now = new Date();
  const buildEntry = (item, urls) => {
    const markdown = rewriteProjectImages(item.post.markdown, urls, item.repoPath);
    return projectPostToEntry(item.post, {
      sourcePath: item.repoPath,
      sourceHash: item.sourceHash,
      markdown,
      publishedAt: item.dates.first,
      lastPublishedAt: item.dates.last,
      now,
      previous:
        item.decision === 'update'
          ? {
              draftVersion: item.entry.draft.version,
              revision: item.entry.published?.revision ?? 0,
              createdAt: item.entry.createdAt,
              publishedAt: item.entry.publishedAt,
            }
          : undefined,
    });
  };
  const previewUrls = new Map(urlByRepoPath);
  for (const repoPath of neededImages)
    if (!previewUrls.has(repoPath)) previewUrls.set(repoPath, PLACEHOLDER_URL);
  const previews = new Map();
  for (const item of toWrite) {
    try {
      const data = buildEntry(item, previewUrls);
      const parsed = entryDocSchema.safeParse(data);
      if (!parsed.success) {
        errors.push(
          `entries/${item.id}가 스키마에 맞지 않습니다: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
        );
      }
      previews.set(item.id, data);
    } catch (error) {
      if (error instanceof ProjectSourceError) errors.push(error.message);
      else throw error;
    }
  }

  // 6. seriesMeta: 프로젝트 이름·설명 + project 칸
  const seriesMetaWrites = [];
  for (const info of projects) {
    const desired = { title: info.title, description: info.description, project: info.project };
    const parsed = seriesMetaSchema.safeParse(desired);
    if (!parsed.success) {
      errors.push(`seriesMeta/${info.key}가 스키마에 맞지 않습니다: ${parsed.error.message}`);
      continue;
    }
    const existing = seriesMetaById.get(info.key);
    if (existing && !existing.project) {
      errors.push(
        `seriesMeta/${info.key}가 이미 글 연재로 쓰인다(project 칸 없음). 프로젝트 key를 바꿔야 한다`,
      );
      continue;
    }
    if (!existing) seriesMetaWrites.push({ id: info.key, data: desired, kind: 'create' });
    else if (!sameValue(existing, desired))
      seriesMetaWrites.push({ id: info.key, data: desired, kind: 'update' });
  }
  const projectKeys = new Set(projects.map((info) => info.key));
  for (const item of posts) {
    if (!projectKeys.has(item.post.key)) errors.push(`프로젝트 정보가 없는 글: ${item.repoPath}`);
  }

  // 7. 내부 링크 확인 (/blog/<slug>가 지금 발행 글인지)
  const publishedSlugs = new Map();
  for (const [entryId, entry] of entriesById) {
    if (entry.status === 'published' && entry.published?.slug)
      publishedSlugs.set(entry.published.slug, { entryId, kind: entry.kind });
  }

  // ===== 보고서 =====
  const counts = {};
  for (const item of decisions) counts[item.decision] = (counts[item.decision] ?? 0) + 1;
  out(`# 재건 4단계 프로젝트 글 이전 보고서 (${APPLY ? '실제 실행' : '시험 실행'})`);
  out();
  out(`- 시각: ${startedAt.toISOString()}`);
  out(
    `- 원본: \`${path.relative(process.cwd(), SOURCE_ROOT) || '.'}\`의 \`${PROJECTS_DIR}\` (프로젝트 ${projects.length}개, 글 ${posts.length}편, 본문 이미지 ${images.size}개)`,
  );
  out(`- 지금 entries ${entriesById.size}개, seriesMeta ${seriesMetaById.size}개`);
  out();
  out('## 1. 판정');
  out();
  out('| 판정 | 수 |');
  out('|---|---|');
  for (const key of ['create', 'update', 'skip', 'conflict', 'skip-deleted-in-rebuild'])
    out(`| ${key} | ${counts[key] ?? 0} |`);
  out();
  out('## 2. 프로젝트 (seriesMeta)');
  out();
  out('| key | 이름 | 순서 | 기간 | 기술 | GitHub | 쓰기 |');
  out('|---|---|---|---|---|---|---|');
  for (const info of [...projects].sort((a, b) => a.project.order - b.project.order)) {
    const write = seriesMetaWrites.find((item) => item.id === info.key);
    out(
      `| ${info.key} | ${mdCell(info.title)} | ${info.project.order} | ${info.project.startDate ?? '?'} ~ ${info.project.endDate ?? '?'} | ${mdCell(info.project.tech.join(', '))} | ${info.project.github ? '있음' : '없음'} | ${write ? write.kind : '같음'} |`,
    );
  }
  out();
  out(
    `설명·긴 설명·태그·기술은 project.md 값 그대로다. 표지 이미지(${projects.map((info) => `\`${path.basename(info.coverImage ?? '-')}\``).join(', ')})는 옮기지 않는다(카드·OG는 코드 커버, U14).`,
  );
  out();
  out('## 3. 글 (entries, kind project)');
  out();
  out(
    '| 문서 ID | 판정 | 주소 | Part | 제목 | 첫 발행(원본 첫 커밋) | 마지막 발행(원본 마지막 커밋) | 읽기 | 이미지 |',
  );
  out('|---|---|---|---|---|---|---|---|---|');
  for (const item of decisions) {
    const data = previews.get(item.id);
    out(
      `| ${item.id} | ${item.decision} | /projects/${item.post.key}/${item.post.slug} | ${item.post.order} | ${mdCell(item.post.title)} | ${item.dates.first.toISOString().slice(0, 10)} | ${item.dates.last.toISOString().slice(0, 10)} | ${data?.published?.readingTime ?? '-'}분 | ${item.refs.length} |`,
    );
  }
  out();
  out(
    '모두 카테고리 없음, 태그 없음, 표지는 코드 커버, 상태는 원본 `status` 그대로다. 본문은 frontmatter 뒤 그대로이고 이미지 주소만 바꾼다.',
  );
  out();
  out('## 4. 본문 이미지 → 자산');
  out();
  out('| 원본 | 형식 | 크기 | 바이트 | 움직임 | 처리 |');
  out('|---|---|---|---|---|---|');
  for (const [repoPath, image] of [...images].sort((a, b) => a[0].localeCompare(b[0]))) {
    const existing = readyAssetByHash.get(image.sha256);
    const action = !neededImages.has(repoPath)
      ? '쓸 글 없음'
      : existing
        ? `있는 자산 재사용 (${existing.id})`
        : '새로 올림';
    out(
      `| ${repoPath.replace('src/assets/img/projects/', '')} | ${image.contentType} | ${image.width}×${image.height} | ${image.buffer.length.toLocaleString('en-US')} | ${image.pages > 1 ? `${image.pages}프레임` : '-'} | ${action} |`,
    );
  }
  out();
  out(
    '올린 이미지는 2단계 변형 규칙(webp, 480·960·1600·최대 2400px, 메타데이터 제거, 움직이는 이미지는 움직이는 webp)을 따른다. 본문 주소는 최대 변형이다. 자산 usedBy에 글 ID를 적는다.',
  );
  out();
  out('### 바뀌는 본문 주소');
  out();
  for (const item of decisions) {
    if (item.refs.length === 0) continue;
    out(`- \`${item.id}\``);
    for (const ref of item.refs)
      out(
        `  - \`${ref.src}\` → ${urlByRepoPath.get(ref.repoPath) ? `\`${urlByRepoPath.get(ref.repoPath)}\`` : '올린 뒤의 최대 변형 주소'}`,
      );
  }
  out();
  out('## 5. 본문 안 내부 링크');
  out();
  const links = decisions.flatMap((item) =>
    item.internalLinks.map((link) => ({ id: item.id, link })),
  );
  if (links.length === 0) out('없음.');
  for (const { id, link } of links) {
    const blogSlug = /^\/blog\/([^/?#]+)/.exec(link)?.[1];
    const target = blogSlug ? publishedSlugs.get(decodeURIComponent(blogSlug)) : null;
    out(
      `- \`${id}\`: \`${link}\` → ${blogSlug ? (target ? `발행 글 있음(${target.entryId}, ${target.kind})` : '**발행 글 없음**') : '확인하지 않음(글 주소가 아님)'}`,
    );
    if (blogSlug && !target) warnings.push(`내부 링크의 글이 없다: ${link} (${id})`);
  }
  out();
  out('## 6. 경고와 오류');
  out();
  out(`- 오류 ${errors.length}건`);
  for (const message of errors) out(`  - ${message}`);
  out(`- 경고 ${warnings.length}건`);
  for (const message of warnings) out(`  - ${message}`);
  out();

  if (errors.length > 0) {
    out('**오류가 있어 아무것도 쓰지 않았다.**');
    return finish(1);
  }
  if (!APPLY) {
    out('시험 실행이다. 아무것도 쓰지 않았다. 실제 실행은 `--apply --base <개발 서버>`.');
    return finish(0);
  }
  if (!BASE) {
    out(
      '**실제 실행에는 `--base <개발 서버 주소>`가 필요하다(이미지를 자산 API로 올린다). 아무것도 쓰지 않았다.**',
    );
    return finish(1);
  }

  // ===== 실제 실행 =====
  const dump = await writeDump(db, [ENTRIES, SERIES_META, ASSETS, PUBLISH_LOG], 'stage4-projects');
  out('## 7. 실제 실행 결과');
  out();
  out(
    `- 덤프: \`${dump.dir}\` (${Object.entries(dump.counts)
      .map(([name, count]) => `${name} ${count}`)
      .join(', ')})`,
  );

  // 이미지 올리기
  const uploaded = [];
  if ([...neededImages].some((repoPath) => !urlByRepoPath.has(repoPath))) {
    await signIn();
    try {
      for (const repoPath of [...neededImages].sort()) {
        if (urlByRepoPath.has(repoPath)) continue;
        const { asset, reused } = await uploadImage(repoPath, images.get(repoPath));
        urlByRepoPath.set(repoPath, asset.url);
        assetIdByRepoPath.set(repoPath, asset.id);
        uploaded.push({
          repoPath,
          id: asset.id,
          reused,
          width: asset.width,
          height: asset.height,
          bytes: asset.bytes,
        });
      }
    } finally {
      await signOut();
    }
  }
  out(
    `- 이미지: 새로 올림 ${uploaded.filter((item) => !item.reused).length}, 같은 해시 재사용 ${neededImages.size - uploaded.filter((item) => !item.reused).length}`,
  );
  for (const item of uploaded)
    out(
      `  - ${item.repoPath} → assets/${item.id} (최대 변형 ${item.width}×${item.height}, ${item.bytes} 바이트${item.reused ? ', 재사용' : ''})`,
    );

  // 문서 다시 계산(실제 주소) + 검사
  const writes = [];
  for (const item of toWrite) {
    const data = buildEntry(item, urlByRepoPath);
    entryDocSchema.parse(data);
    writes.push({ item, data });
  }

  // 갱신하는 글이 원본에서 뺀 이미지(지금 쓰는 자산에서 빠지는 것). usedBy에서 글 ID를 빼고, 비면 고아 표시(PR-C 리뷰 경미 9)
  const removedUsage = new Map(); // 자산 ID → 뺄 글 ID 집합
  for (const { item, data } of writes) {
    if (item.decision !== 'update') continue;
    const before = new Set(
      [item.entry.draft, item.entry.published]
        .filter(Boolean)
        .flatMap((content) => collectContentStoragePaths(content, bucketName))
        .map(assetIdFromStoragePath),
    );
    const after = new Set(
      [data.draft, data.published]
        .filter(Boolean)
        .flatMap((content) => collectContentStoragePaths(content, bucketName))
        .map(assetIdFromStoragePath),
    );
    for (const assetId of before) {
      if (after.has(assetId)) continue;
      if (!removedUsage.has(assetId)) removedUsage.set(assetId, new Set());
      removedUsage.get(assetId).add(item.id);
    }
  }
  const removedAssetSnaps =
    removedUsage.size > 0
      ? await db.getAll(...[...removedUsage.keys()].map((id) => db.collection(ASSETS).doc(id)))
      : [];

  const batch = new ChunkedBatch(db, WRITE_TARGETS);
  for (const { item, data } of writes) {
    const ref = db.collection(ENTRIES).doc(item.id);
    // 갱신은 읽은 뒤 에디터가 저장했으면 실패한다(문서 시각 전제 조건). 만들기는 문서가 있으면 실패한다
    if (item.decision === 'create') await batch.op('create', ref, data);
    else await batch.op('update', ref, data, { lastUpdateTime: updateTimeById.get(item.id) });
    if (data.published) {
      await batch.op('set', ref.collection('revisions').doc(String(data.published.revision)), {
        ...data.published,
        publishedAt: data.lastPublishedAt,
      });
    }
  }
  for (const item of seriesMetaWrites)
    await batch.op('set', db.collection(SERIES_META).doc(item.id), item.data);
  // 자산 사용 기록: 글 ID를 usedBy에 더하고 고아 표시를 지운다
  const usage = new Map();
  for (const { item } of writes) {
    for (const ref of item.refs) {
      const assetId = assetIdByRepoPath.get(ref.repoPath);
      if (!usage.has(assetId)) usage.set(assetId, new Set());
      usage.get(assetId).add(item.id);
    }
  }
  for (const [assetId, ids] of usage) {
    await batch.op('update', db.collection(ASSETS).doc(assetId), {
      usedBy: FieldValue.arrayUnion(...ids),
      orphanedAt: null,
    });
  }
  for (const snapshot of removedAssetSnaps) {
    if (!snapshot.exists || usage.has(snapshot.id)) continue;
    const drop = removedUsage.get(snapshot.id);
    const remaining = (snapshot.get('usedBy') ?? []).filter((id) => !drop.has(id));
    await batch.op('update', snapshot.ref, {
      usedBy: remaining,
      ...(remaining.length === 0 ? { orphanedAt: new Date() } : {}),
    });
  }
  await batch.flush();
  // 되돌리기가 쓸 기록: 이 실행이 새로 올린 자산과 새로 만든 seriesMeta 문서만 지울 수 있다(PR-C 리뷰 중요 2)
  const record = {
    createdAt: new Date().toISOString(),
    sourceRoot: SOURCE_ROOT,
    entries: writes.map(({ item }) => ({ id: item.id, decision: item.decision })),
    uploadedAssetIds: uploaded.filter((item) => !item.reused).map((item) => item.id),
    createdSeriesMeta: seriesMetaWrites
      .filter((item) => item.kind === 'create')
      .map((item) => item.id),
  };
  await fs.writeFile(
    path.join(dump.dir, MIGRATION_RECORD),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  );
  out(
    `- 쓴 문서 ${batch.total}개 (entries ${writes.length}, revisions ${writes.filter(({ data }) => data.published).length}, seriesMeta ${seriesMetaWrites.length}, 자산 usedBy ${usage.size}, 원본에서 빠진 이미지 ${removedAssetSnaps.length})`,
  );
  out(
    `- 되돌리기 기록: \`${path.join(dump.dir, MIGRATION_RECORD)}\` (되돌릴 때 \`--manifest\`로 준다)`,
  );
  if (writes.some(({ item }) => item.decision === 'update')) {
    out(
      '- 갱신한 글이 있다. 이 스크립트는 CDN 캐시를 비우지 못한다. 배포된 사이트에서는 페이지가 60초, OG 이미지가 하루 동안 예전 것일 수 있다(새 배포는 빈 캐시로 시작한다).',
    );
  }

  // 다시 읽어 확인
  const after = await db.collection(ENTRIES).where('kind', '==', 'project').get();
  const invalid = after.docs
    .filter((docSnap) => !entryDocSchema.safeParse(docSnap.data()).success)
    .map((docSnap) => docSnap.id);
  const migrated = after.docs.filter((docSnap) => docSnap.get('projectSource')).length;
  const assetCheck = await Promise.all(
    [...usage.keys()].map((id) => db.collection(ASSETS).doc(id).get()),
  );
  const badAssets = assetCheck.filter(
    (docSnap) => docSnap.get('status') !== 'ready' || !(docSnap.get('usedBy') ?? []).length,
  );
  const metaAfter = await Promise.all(
    projects.map((info) => db.collection(SERIES_META).doc(info.key).get()),
  );
  out(
    `- entries kind project ${after.size}개 (이전 표지 ${migrated}), 스키마 실패 ${invalid.length}${invalid.length ? `: ${invalid.join(', ')}` : ''}`,
  );
  out(
    `- 자산 ${assetCheck.length}개: ready·usedBy 있음 ${assetCheck.length - badAssets.length}, 문제 ${badAssets.length}`,
  );
  out(
    `- seriesMeta project 칸: ${metaAfter.filter((docSnap) => docSnap.get('project')).length}/${projects.length}`,
  );
  out();
  const reportPath = path.join(dump.dir, 'report.md');
  await fs.writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');
  out(`보고서: \`${reportPath}\``);
  return finish(invalid.length > 0 || badAssets.length > 0 || migrated !== posts.length ? 1 : 0);
}

// ───────────── 되돌리기 (Plan 9.2) ─────────────

async function rollback() {
  const { db, bucket } = initAdmin();
  out(`# 재건 4단계 프로젝트 글 이전 되돌리기 (${APPLY ? '실제 실행' : '시험 실행'})`);
  out();

  // 이전 실행 기록(지울 수 있는 자산·seriesMeta 문서). 없으면 자산·문서를 지우지 않고 표시만 고친다
  const manifest = { uploadedAssetIds: [], createdSeriesMeta: [] };
  for (const file of MANIFESTS) {
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    manifest.uploadedAssetIds.push(...(record.uploadedAssetIds ?? []));
    manifest.createdSeriesMeta.push(...(record.createdSeriesMeta ?? []));
  }
  out(
    `- 이전 기록: ${MANIFESTS.length ? MANIFESTS.map((file) => `\`${file}\``).join(', ') : '없음(자산·seriesMeta 문서는 지우지 않는다)'}`,
  );

  // 이전 표지가 있는 글 (원본이 없어도 찾는다)
  const entriesSnap = await db.collection(ENTRIES).get();
  const entryStates = entriesSnap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      status: data.status,
      draftVersion: data.draft?.version ?? 0,
      revision: data.published?.revision ?? 0,
      seriesKeys: [data.draft?.series?.key, data.published?.series?.key].filter(Boolean),
      projectSource: data.projectSource ?? null,
    };
  });
  const migratedIds = entryStates.filter((entry) => entry.projectSource).map((entry) => entry.id);
  const assetDocs = (
    await Promise.all(
      chunks(migratedIds).map((part) =>
        db.collection(ASSETS).where('usedBy', 'array-contains-any', part).get(),
      ),
    )
  ).flatMap((snap) => snap.docs);
  const uniqueAssets = new Map(assetDocs.map((docSnap) => [docSnap.id, docSnap]));
  const metaSnap = await db.collection(SERIES_META).get();
  const plan = planProjectRollback({
    entries: entryStates,
    assets: [...uniqueAssets.values()].map((docSnap) => ({
      id: docSnap.id,
      legacy: docSnap.get('legacy') === true,
      usedBy: docSnap.get('usedBy') ?? [],
    })),
    seriesMetaWithProject: metaSnap.docs
      .filter((docSnap) => docSnap.get('project'))
      .map((docSnap) => docSnap.id),
    manifest: MANIFESTS.length ? manifest : null,
    includeEdited: INCLUDE_EDITED,
  });

  out(`- entries 지움: ${plan.entries.length}편 (${plan.entries.join(', ') || '없음'})`);
  if (plan.editedEntries.length > 0) {
    out(
      `- **이전 뒤 에디터로 고친 글 ${plan.editedEntries.length}편: ${plan.editedEntries.join(', ')}. ${INCLUDE_EDITED ? '함께 지운다(--include-edited).' : '지우지 않는다. 지우려면 --include-edited.'}**`,
    );
  }
  out(
    `- assets: 문서·Storage 지움 ${plan.deleteAssets.length} (${plan.deleteAssets.join(', ') || '없음'}), usedBy만 고침 ${plan.updateAssets.length}(비면 고아 표시. 7일 뒤 정리 대상)`,
  );
  out(
    `- seriesMeta: 문서 지움 ${plan.deleteSeriesMeta.length} (${plan.deleteSeriesMeta.join(', ') || '없음'}), project 칸만 지움 ${plan.clearProjectField.length} (${plan.clearProjectField.join(', ') || '없음'})`,
  );
  out();

  if (!APPLY) {
    out(
      '시험 실행이다. 아무것도 지우지 않았다. 실제 실행은 `--rollback --apply [--manifest <migration.json>]`.',
    );
    return finish(0);
  }
  const dump = await writeDump(db, [ENTRIES, SERIES_META, ASSETS], 'stage4-projects-rollback');
  out(`- 덤프: \`${dump.dir}\` (Firestore만. Storage 파일은 덤프에 없다)`);
  // 순서(PR-C 리뷰 중요 2): 글 → 자산·seriesMeta 문서 → Storage 파일.
  // 중간에 멈춰도 공개 글이 깨진 이미지를 보이지 않는다(글이 먼저 사라진다)
  const batch = new ChunkedBatch(db, WRITE_TARGETS);
  for (const id of plan.entries) {
    const ref = db.collection(ENTRIES).doc(id);
    batch.check(ref);
    await db.recursiveDelete(ref);
  }
  const now = new Date();
  for (const item of plan.updateAssets) {
    await batch.op('update', db.collection(ASSETS).doc(item.id), {
      usedBy: item.usedBy,
      ...(item.usedBy.length === 0 ? { orphanedAt: now } : {}),
    });
  }
  for (const id of plan.deleteAssets) await batch.op('delete', db.collection(ASSETS).doc(id));
  for (const id of plan.deleteSeriesMeta)
    await batch.op('delete', db.collection(SERIES_META).doc(id));
  for (const id of plan.clearProjectField) {
    await batch.op('update', db.collection(SERIES_META).doc(id), { project: FieldValue.delete() });
  }
  await batch.flush();
  for (const id of plan.deleteAssets)
    await bucket.deleteFiles({ prefix: `assets/${id}/`, force: true });
  out(
    `- 지움: entries ${plan.entries.length}, assets ${plan.deleteAssets.length}(Storage assets/<id>/ 포함), seriesMeta 문서 ${plan.deleteSeriesMeta.length}·칸 ${plan.clearProjectField.length}`,
  );
  return finish(0);
}

async function finish(code) {
  const text = `${lines.join('\n')}\n`;
  process.stdout.write(text);
  if (REPORT_FILE) await fs.writeFile(REPORT_FILE, text, 'utf8');
  process.exitCode = code;
}

(ROLLBACK ? rollback() : migrate()).catch(async (error) => {
  if (error instanceof ProjectSourceError) {
    out(`**원본 오류: ${error.message}. 아무것도 쓰지 않았다.**`);
    await finish(1);
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
