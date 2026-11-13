// 글 목록 여러 편 삭제 스모크 테스트 (2026-11-12 여러 편 삭제 작업)
//
// 실행: node --env-file=.env scripts/smoke/admin-bulk-delete.mjs [--base http://localhost:4341]
//
// - 개발 서버(localhost)에 요청한다. 시험 이미지(파일 이름에 stage5-test)와 시험 초안(제목·slug에 stage5-test)만 만든다.
//   끝에(실패해도 finally에서) 모두 지운다. 기존 글·자산은 읽기만 한다. 발행하지 않는다(운영 사이트가 entries를 읽는다).
// - 세션: Admin SDK createCustomToken(ADMIN_UID) → Identity Toolkit signInWithCustomToken → POST /api/admin/session
// - 화면과 같은 함수(src/admin/home/bulk-select.ts의 runBulkDelete)로 기존 DELETE /api/admin/posts/{id}를 3편씩 부른다.
// - 확인하는 것:
//   1. 시험 초안 6편(그중 2편은 시험 이미지를 쓴다)을 만든다. 저장 뒤 이미지 usedBy에 두 글이 있다
//   2. 7편 + 없는 ID 1편 + 일부러 틀린 요청 1편을 한 번에 지운다:
//      한 번에 3편까지만 보낸다, 없는 ID(404)는 지운 것, 틀린 요청(400)은 실패로 남고 나머지는 끝까지 지운다
//   3. 지운 글마다 한 편 삭제와 같은 부수 처리: entries 문서 없음, publishLog delete 줄 1개(title·purge·backup·assetUsage 칸),
//      이미지 usedBy에서 빠짐
//   4. 실패한 1편을 다시 지우면 지워진다(화면의 "삭제를 다시 누르면 그 글만 다시")
//   5. 끝에 운영 데이터 수(entries·publishLog·assets)가 처음과 같다

import { createHash } from 'node:crypto';
import process from 'node:process';
import { getAuth } from 'firebase-admin/auth';
import sharp from 'sharp';
import { runBulkDelete } from '../../src/admin/home/bulk-select.ts';
import { initAdmin, parseArgs } from '../migrate/lib/admin.mjs';

const args = parseArgs();
const BASE = (typeof args.base === 'string' ? args.base : 'http://localhost:4341').replace(
  /\/$/,
  '',
);
const ORIGIN = new URL(BASE).origin;
const RUN_ID = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, '')
  .slice(0, 14);
const TEST_MARK = 'stage5-test';
// 만드는 시험 초안 수
const DRAFT_COUNT = 6;

const failures = [];
let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
  return Boolean(condition);
}

// 이 실행이 만든 것 (정리 대상)
const created = { entryIds: new Set(), assetIds: new Set() };

// ───────────── HTTP 도구 ─────────────

let sessionCookie = '';

async function api(method, path, { body, origin = ORIGIN, cookie = true } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (cookie && sessionCookie) headers.Cookie = `cruz_admin=${sessionCookie}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
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
  return { status: response.status, json, text, headers: response.headers };
}

// Google API 호출을 몇 번 다시 해 본다(네트워크가 잠깐 끊기는 환경)
async function withRetry(label, run, tries = 4) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  (${label} 다시 시도 ${attempt}/${tries}: ${message.slice(0, 80)})`);
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
  throw lastError;
}

async function idTokenFor(uid) {
  return withRetry('ID 토큰', async () => {
    const apiKey = process.env.PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) throw new Error('.env에 PUBLIC_FIREBASE_API_KEY가 필요합니다.');
    const customToken = await getAuth().createCustomToken(uid);
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );
    const json = await response.json();
    if (!json.idToken) throw new Error(`signInWithCustomToken 실패: ${response.status}`);
    return json.idToken;
  });
}

async function signIn() {
  const adminUid = process.env.ADMIN_UID;
  if (!adminUid) throw new Error('.env에 ADMIN_UID가 필요합니다.');
  const response = await api('POST', '/api/admin/session', {
    body: { idToken: await idTokenFor(adminUid) },
    cookie: false,
  });
  check(response.status === 204, `세션 발급: 204 (${response.status} ${response.text})`);
  const match = (response.headers.get('set-cookie') ?? '').match(/cruz_admin=([^;]+)/);
  if (!match) throw new Error('세션 쿠키가 없다');
  sessionCookie = match[1];
}

// API 응답을 화면의 apiRequest처럼 오류로 바꾼다(runBulkDelete가 status로 판단한다)
class SmokeApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ───────────── 시험 데이터 ─────────────

// 시험 이미지 1장을 올린다(업로드 주소 → PUT → finalize). Node로 올린다(버킷 CORS는 임의 포트의 브라우저 PUT을 막는다)
async function uploadTestImage() {
  // 초록 바탕 64×40. 첫 줄 앞 픽셀에 실행 ID 글자 값을 넣어 실행마다 해시가 다르게 한다
  // (같은 해시면 서버가 기존 자산을 준다)
  const width = 64;
  const height = 40;
  const raw = Buffer.alloc(width * height * 3);
  for (let index = 0; index < width * height; index += 1) raw.set([30, 160, 110], index * 3);
  Buffer.from(`${TEST_MARK}-${RUN_ID}`).copy(raw, 0);
  const salted = await sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
  const sha256 = createHash('sha256').update(salted).digest('hex');
  const urlResponse = await api('POST', '/api/admin/assets/upload-url', {
    body: {
      fileName: `${TEST_MARK}-bulk-${RUN_ID}.png`,
      contentType: 'image/png',
      bytes: salted.length,
      sha256,
    },
  });
  const { assetId, uploadUrl, requiredHeaders, existing } = urlResponse.json ?? {};
  if (existing) throw new Error(`같은 해시의 자산이 이미 있다: ${existing.id}`);
  if (!assetId) throw new Error(`업로드 주소 실패: ${urlResponse.text}`);
  created.assetIds.add(assetId);
  await withRetry('시험 이미지 PUT', async () => {
    const put = await fetch(uploadUrl, { method: 'PUT', headers: requiredHeaders, body: salted });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
  });
  const finalize = await api('POST', `/api/admin/assets/${assetId}/finalize`);
  if (finalize.status !== 200) throw new Error(`finalize 실패: ${finalize.text}`);
  return finalize.json.asset;
}

// 시험 초안 1편을 만든다. image가 있으면 본문에 넣는다
async function createTestDraft(index, image) {
  const createdRes = await api('POST', '/api/admin/posts', { body: { kind: 'post' } });
  const id = createdRes.json?.id;
  if (!id) throw new Error(`시험 글 생성 실패: ${createdRes.text}`);
  created.entryIds.add(id);
  const draft = {
    title: `${TEST_MARK} 여러 편 삭제 ${index} ${RUN_ID}`,
    description: '여러 편 삭제 스모크 시험 글이다. 곧 지운다.',
    slug: `${TEST_MARK}-bulk-${index}-${RUN_ID}`,
    category: 'retrospective',
    tags: [],
    series: null,
    cover: { kind: 'generated' },
    markdown: image
      ? `여러 편 삭제 시험 ${index}\n\n![시험 이미지](${image.url})`
      : `여러 편 삭제 시험 ${index}`,
    editorJson: null,
  };
  const save = await api('PUT', `/api/admin/posts/${id}/draft`, {
    body: { baseVersion: 1, device: TEST_MARK, draft },
  });
  check(
    save.status === 200 && save.json?.assetUsage === 'ok',
    `시험 초안 ${index} 저장: 200, 자산 기록 ok (${save.status} ${save.text.slice(0, 120)})`,
  );
  return id;
}

// ───────────── 검사 ─────────────

async function checkBulkDelete(db) {
  const image = await uploadTestImage();
  const ids = [];
  for (let index = 1; index <= DRAFT_COUNT; index += 1) {
    ids.push(await createTestDraft(index, index <= 2 ? image : null));
  }
  const usedBefore = (await db.collection('assets').doc(image.id).get()).get('usedBy') ?? [];
  check(
    ids.slice(0, 2).every((id) => usedBefore.includes(id)),
    `저장 뒤 이미지 usedBy에 시험 글 2편 (${usedBefore.length}개)`,
  );

  // 목록 API에 초안으로 보인다(화면이 고르는 대상)
  const list = await api('GET', '/api/admin/posts');
  const listed = (list.json?.items ?? []).filter((item) => ids.includes(item.id));
  check(
    listed.length === DRAFT_COUNT && listed.every((item) => item.status === 'draft'),
    `목록 API: 시험 초안 ${DRAFT_COUNT}편이 초안으로 보인다 (${listed.length})`,
  );

  // 없는 ID(404)와 일부러 틀린 요청(confirm이 다름 → 400)을 섞는다
  const missingId = `${TEST_MARK}-missing-${RUN_ID}`;
  const badId = ids[3];
  const targets = [...ids.slice(0, 3), missingId, badId, ...ids.slice(4)];

  let inFlight = 0;
  let maxInFlight = 0;
  const durations = [];
  const progress = [];
  const deletedSeen = [];
  const started = Date.now();
  const result = await runBulkDelete(
    targets,
    async (id) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const begin = Date.now();
      try {
        const response = await api('DELETE', `/api/admin/posts/${encodeURIComponent(id)}`, {
          body: { confirm: id === badId ? `${id}-틀림` : id },
        });
        if (response.status !== 200) {
          throw new SmokeApiError(response.status, response.json?.error?.message ?? response.text);
        }
      } finally {
        durations.push(Date.now() - begin);
        inFlight -= 1;
      }
    },
    {
      isFatal: (error) => error instanceof SmokeApiError && error.status === 401,
      isAlreadyGone: (error) => error instanceof SmokeApiError && error.status === 404,
      describe: (error) => (error instanceof Error ? error.message : String(error)),
      onProgress: (done, total) => progress.push(`${done}/${total}`),
      onDeleted: (id) => deletedSeen.push(id),
    },
  );
  const elapsed = Date.now() - started;
  const sorted = [...durations].sort((a, b) => a - b);
  console.log(
    `  ${targets.length}편 요청: 전체 ${elapsed}ms, 한 편 ${sorted[0]}~${sorted.at(-1)}ms (가운데 ${sorted[Math.floor(sorted.length / 2)]}ms)`,
  );

  check(maxInFlight === 3, `한 번에 3편까지만 보낸다 (최대 ${maxInFlight})`);
  check(
    progress.length === targets.length && progress.at(-1) === `${targets.length}/${targets.length}`,
    `한 편마다 진행 알림 (${progress.join(' ')})`,
  );
  const expectedDeleted = targets.filter((id) => id !== badId);
  check(
    JSON.stringify(result.deleted) === JSON.stringify(expectedDeleted),
    `지운 글: 틀린 요청 1편만 빼고 받은 순서대로, 없는 ID는 지운 것 (${result.deleted.length})`,
  );
  check(
    result.failed.length === 1 && result.failed[0].id === badId,
    `실패 1편: 틀린 요청 (${JSON.stringify(result.failed)})`,
  );
  check(result.remaining.length === 0 && result.fatal === null, '멈춤 없음, 남은 글 없음');
  check(
    deletedSeen.length === expectedDeleted.length,
    `지운 직후 알림이 지운 수만큼 (${deletedSeen.length})`,
  );

  // 지운 글마다 한 편 삭제와 같은 부수 처리
  for (const id of ids.filter((value) => value !== badId)) await checkDeletedEntry(db, id);
  const usedAfter = (await db.collection('assets').doc(image.id).get()).get('usedBy') ?? [];
  check(
    ids.slice(0, 2).every((id) => !usedAfter.includes(id)),
    `지운 뒤 이미지 usedBy에서 시험 글이 빠짐 (${usedAfter.length}개)`,
  );
  const missingLogs = await db.collection('publishLog').where('entryId', '==', missingId).get();
  check(missingLogs.empty, '없는 ID는 publishLog 줄을 만들지 않는다');

  // 실패한 글은 남아 있다. 다시 지우면 지워진다
  check((await db.collection('entries').doc(badId).get()).exists, '실패한 글은 그대로 남는다');
  const retry = await runBulkDelete(
    [badId],
    async (id) => {
      const response = await api('DELETE', `/api/admin/posts/${encodeURIComponent(id)}`, {
        body: { confirm: id },
      });
      if (response.status !== 200)
        throw new SmokeApiError(response.status, response.json?.error?.message ?? response.text);
    },
    {
      isFatal: () => false,
      isAlreadyGone: (error) => error instanceof SmokeApiError && error.status === 404,
      describe: (error) => (error instanceof Error ? error.message : String(error)),
    },
  );
  check(
    retry.deleted.length === 1 && retry.failed.length === 0,
    `실패한 1편 다시 지우기 (${JSON.stringify(retry)})`,
  );
  await checkDeletedEntry(db, badId);

  // 세션 없이 지우면 401이다(화면은 멈추고 로그인 화면으로 간다)
  const noSession = await api('DELETE', `/api/admin/posts/${encodeURIComponent(missingId)}`, {
    body: { confirm: missingId },
    cookie: false,
  });
  check(noSession.status === 401, `세션 없는 삭제: 401 (${noSession.status})`);
}

// 지운 글 하나의 부수 처리: 문서 없음, publishLog delete 줄 1개와 부수 결과 칸
async function checkDeletedEntry(db, id) {
  check(!(await db.collection('entries').doc(id).get()).exists, `entries/${id} 없음`);
  const logs = await db.collection('publishLog').where('entryId', '==', id).get();
  const deletes = logs.docs.filter((docSnap) => docSnap.get('action') === 'delete');
  check(deletes.length === 1, `publishLog delete 줄 1개: ${id} (${deletes.length})`);
  const row = deletes[0]?.data() ?? {};
  check(
    typeof row.title === 'string' && row.title.includes(TEST_MARK),
    `delete 줄 title: ${row.title}`,
  );
  // 로컬은 CDN 퍼지를 건너뛰고(skipped), 백업 토큰이 없으면 skipped다. 칸이 있는 것만 본다
  check(
    ['ok', 'skipped', 'failed'].includes(row.purge),
    `delete 줄 purge 칸: ${id} (${row.purge})`,
  );
  check(
    ['dispatched', 'skipped', 'failed'].includes(row.backup),
    `delete 줄 backup 칸: ${id} (${row.backup})`,
  );
  check(row.assetUsage === 'ok', `delete 줄 assetUsage ok: ${id} (${row.assetUsage})`);
}

// ───────────── 정리 ─────────────

async function cleanup(db, bucket) {
  const leftovers = [];
  for (const id of created.entryIds) {
    try {
      const ref = db.collection('entries').doc(id);
      if ((await ref.get()).exists) {
        leftovers.push(`entries/${id}`);
        await db.recursiveDelete(ref);
      }
      const logs = await db.collection('publishLog').where('entryId', '==', id).get();
      for (const log of logs.docs) await log.ref.delete();
    } catch (error) {
      failures.push(`시험 글 정리 실패 ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  for (const id of created.assetIds) {
    try {
      const [files] = await bucket.getFiles({ prefix: `assets/${id}/` });
      if (files.length > 0) await bucket.deleteFiles({ prefix: `assets/${id}/` });
      const ref = db.collection('assets').doc(id);
      if ((await ref.get()).exists) await ref.delete();
    } catch (error) {
      failures.push(`시험 자산 정리 실패 ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return leftovers;
}

async function main() {
  const { db, bucket } = initAdmin();
  console.log(`기준 ${BASE}, 실행 ID ${RUN_ID}`);
  const counted = () =>
    Promise.all(
      ['entries', 'publishLog', 'assets'].map((name) => db.collection(name).count().get()),
    );
  const before = (await withRetry('처음 수 세기', counted)).map((snap) => snap.data().count);

  process.once('SIGINT', () => {
    console.log('중단 신호: 시험 데이터를 지우고 끝낸다');
    cleanup(db, bucket).finally(() => process.exit(130));
  });

  let leftovers = [];
  try {
    await signIn();
    await checkBulkDelete(db);
  } catch (error) {
    failures.push(`중단: ${error instanceof Error ? error.stack : error}`);
  } finally {
    leftovers = await cleanup(db, bucket);
  }

  const after = (await withRetry('끝 수 세기', counted)).map((snap) => snap.data().count);
  check(
    before.every((value, index) => value === after[index]),
    `운영 데이터 수가 처음과 같다 (entries·publishLog·assets ${before.join('/')} → ${after.join('/')})`,
  );
  console.log(`정리에서 지운 남은 글: ${leftovers.length === 0 ? '없음' : leftovers.join(', ')}`);
  console.log(`검사 ${checks - failures.length}/${checks} 통과`);
  for (const failure of failures) console.log(`  실패: ${failure}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

await main();
