// 이미지 회전·좌우반전 스모크 테스트 (이미지 회전·좌우반전 작업, 사용자 결정 2026-11-12)
//
// 실행: node --env-file=.env scripts/smoke/image-transform.mjs [--base http://localhost:4335]
//
// - 개발 서버(localhost)에 요청한다. 시험 이미지(파일 이름에 stage5-test)와 시험 글(제목·slug에 stage5-test)만 만든다.
//   끝에(실패해도 finally에서) 모두 지운다. 기존 글·자산은 읽기만 한다.
// - 세션: Admin SDK createCustomToken(ADMIN_UID) → Identity Toolkit signInWithCustomToken → POST /api/admin/session
// - 확인하는 것:
//   1. 사분면 이미지 A를 올린다(2400×1800, 변형 파일 4개로 실제 사진과 같은 양). 오른쪽 90° → 새 자산 B(1800×2400, derivedFrom A, 왼위가 파랑)
//   2. B를 왼쪽 90° → A를 준다(새 파일 없음). A를 다시 오른쪽 90° → 같은 B를 준다
//   3. B를 좌우반전 → C(원본 A 기준 "뒤집고 270°", 왼위가 빨강). A의 파생 자산은 B·C 둘뿐이다
//   4. 거절: 없는 자산 404, 모르는 단추 400, 옛 이미지 422(문서를 바꾸지 않는다), 세션 없음 401, 다른 Origin 403
//   5. B(폭 300)와 C를 넣은 시험 초안을 저장하면 usedBy가 B·C로 간다. 그 본문을 공개 페이지와 같은 렌더러
//      (renderMarkdown + Firestore의 실제 자산 문서)로 그리면 B·C 주소, srcset, 돌린 비율의 width·height가 나온다.
//      발행하지 않는다: main 병합 뒤라 운영 사이트가 entries를 읽는다. 발행하면 시험 글이 www.cruzlab.dev에 잠깐 보인다.
//   6. 정리 시험 실행: B·C를 글이 쓰는 동안 원본 A는 지우지 않는다(kept). 글을 지우면 셋 다 지울 수 있다

import { createHash } from 'node:crypto';
import process from 'node:process';
import { getAuth } from 'firebase-admin/auth';
import sharp from 'sharp';
import { renderMarkdown } from '../../src/lib/content/markdown.ts';
import { initAdmin, parseArgs } from '../migrate/lib/admin.mjs';

const args = parseArgs();
const BASE = (typeof args.base === 'string' ? args.base : 'http://localhost:4335').replace(
  /\/$/,
  '',
);
const ORIGIN = new URL(BASE).origin;
const RUN_ID = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, '')
  .slice(0, 14);
const TEST_MARK = 'stage5-test';

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

// ───────────── 이미지 도구 ─────────────

const RGB = { red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], white: [255, 255, 255] };

// 사분면 png: 왼위 빨강, 오른위 초록, 왼아래 파랑, 오른아래 흰색
async function quadrantPng(width, height) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const top = y < height / 2;
      const left = x < width / 2;
      const color = top ? (left ? 'red' : 'green') : left ? 'blue' : 'white';
      raw.set(RGB[color], (y * width + x) * 3);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

// 주소의 그림에서 (fx, fy) 비율 자리의 가까운 색 이름
async function colorAtUrl(url, fx, fy) {
  const response = await withRetry('그림 받기', async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${res.status}`);
    return res;
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const index =
    (Math.floor(info.height * fy) * info.width + Math.floor(info.width * fx)) * info.channels;
  const pixel = [data[index], data[index + 1], data[index + 2]];
  let best = '';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [name, rgb] of Object.entries(RGB)) {
    const distance = rgb.reduce((sum, value, channel) => sum + (value - pixel[channel]) ** 2, 0);
    if (distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return best;
}

// 시험 이미지 A를 올린다(업로드 주소 → PUT → finalize)
async function uploadQuadrant() {
  const png = await quadrantPng(2400, 1800);
  const sha256 = createHash('sha256').update(png).digest('hex');
  const urlResponse = await api('POST', '/api/admin/assets/upload-url', {
    body: {
      fileName: `${TEST_MARK}-rotate-${RUN_ID}.png`,
      contentType: 'image/png',
      bytes: png.length,
      sha256,
    },
  });
  const { assetId, uploadUrl, requiredHeaders, existing } = urlResponse.json ?? {};
  if (existing)
    throw new Error(
      `같은 해시의 자산이 이미 있다: ${existing.id} (지난 실행의 시험 자산일 수 있다)`,
    );
  if (!assetId) throw new Error(`업로드 주소 실패: ${urlResponse.text}`);
  created.assetIds.add(assetId);
  await withRetry('시험 이미지 PUT', async () => {
    const put = await fetch(uploadUrl, { method: 'PUT', headers: requiredHeaders, body: png });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
  });
  const finalize = await api('POST', `/api/admin/assets/${assetId}/finalize`);
  if (finalize.status !== 200) throw new Error(`finalize 실패: ${finalize.text}`);
  return finalize.json.asset;
}

async function transform(id, op, options = {}) {
  const started = Date.now();
  const response = await api('POST', `/api/admin/assets/${encodeURIComponent(id)}/transform`, {
    body: { op },
    ...options,
  });
  if (response.json?.asset?.id) created.assetIds.add(response.json.asset.id);
  // 서버의 단계별 시간(Server-Timing: read·dl·img·up·write·total)
  const timing = (response.headers.get('server-timing') ?? '')
    .split(',')
    .map((part) => part.trim().match(/^([\w-]+).*?dur=([\d.]+)/))
    .filter(Boolean)
    .map((match) => `${match[1]} ${Math.round(Number(match[2]))}`)
    .join(' · ');
  return { ...response, ms: Date.now() - started, timing };
}

// ───────────── 단계 ─────────────

// 1~3. 돌리기·되돌아오기·다시 쓰기·뒤집기
async function checkTransforms(db) {
  const a = await uploadQuadrant();
  check(a.width === 2400 && a.height === 1800, `A 크기 2400×1800 (${a.width}×${a.height})`);

  const toB = await transform(a.id, 'rotate-right');
  const b = toB.json?.asset;
  console.log(`A → 오른쪽 90° (새 자산): ${toB.ms}ms (서버 ${toB.timing})`);
  check(
    toB.status === 200 && b && b.id !== a.id,
    `오른쪽 90°: 200, 새 자산 (${toB.status} ${toB.text.slice(0, 160)})`,
  );
  check(
    b?.derivedFrom === a.id && b?.transform?.rotate === 90 && b?.transform?.flip === false,
    'B: derivedFrom A, 90°',
  );
  check(
    b?.width === 1800 && b?.height === 2400 && b?.variants?.max?.width === 1800,
    `B: 1800×2400 (${b?.width}×${b?.height})`,
  );
  check(
    b?.variants?.w480?.width === 480 &&
      b?.variants?.w480?.height === 640 &&
      b?.variants?.w1600?.width === 1600,
    'B: w480 변형 480×640, w1600 있음',
  );
  check(
    b?.status === 'ready' &&
      b?.contentType === 'image/webp' &&
      b?.usedBy?.length === 0 &&
      b?.orphanedAt,
    'B: ready, webp, 아직 고아',
  );
  if (b) {
    check((await colorAtUrl(b.url, 0.1, 0.1)) === 'blue', 'B 왼위: 파랑(옛 왼아래)');
    check((await colorAtUrl(b.url, 0.9, 0.1)) === 'red', 'B 오른위: 빨강(옛 왼위)');
  }

  const back = await transform(b.id, 'rotate-left');
  console.log(`B → 왼쪽 90° (원본으로): ${back.ms}ms (서버 ${back.timing})`);
  check(
    back.status === 200 && back.json?.asset?.id === a.id && back.json?.asset?.url === a.url,
    `B를 왼쪽 90°: A를 준다 (${back.json?.asset?.id})`,
  );

  const again = await transform(a.id, 'rotate-right');
  console.log(`A → 오른쪽 90° (다시 쓰기): ${again.ms}ms (서버 ${again.timing})`);
  check(
    again.status === 200 && again.json?.asset?.id === b.id,
    `A를 다시 오른쪽 90°: 같은 B (${again.json?.asset?.id})`,
  );

  const toC = await transform(b.id, 'flip-horizontal');
  const c = toC.json?.asset;
  console.log(`B → 좌우반전 (새 자산): ${toC.ms}ms (서버 ${toC.timing})`);
  check(
    toC.status === 200 && c && c.id !== a.id && c.id !== b.id,
    `B를 좌우반전: 새 자산 C (${toC.status})`,
  );
  check(
    c?.derivedFrom === a.id && c?.transform?.rotate === 270 && c?.transform?.flip === true,
    `C: 원본 A 기준 "뒤집고 270°" (${JSON.stringify(c?.transform)})`,
  );
  check(c?.width === 1800 && c?.height === 2400, 'C: 1800×2400');
  if (c) check((await colorAtUrl(c.url, 0.1, 0.1)) === 'red', 'C 왼위: 빨강');

  const derived = await withRetry('파생 자산 세기', () =>
    db.collection('assets').where('derivedFrom', '==', a.id).get(),
  );
  check(derived.size === 2, `A의 파생 자산: B·C 둘 (${derived.size})`);
  const aDoc = (await db.collection('assets').doc(a.id).get()).data();
  check(!aDoc?.derivedFrom && !aDoc?.transform && aDoc?.url === a.url, 'A 문서: 바뀌지 않음');
  return { a, b, c };
}

// 4. 거절
async function checkRejections(db, a) {
  check(
    (await transform(`${TEST_MARK}-none-${RUN_ID}`, 'rotate-right')).status === 404,
    '없는 자산: 404',
  );
  const badOp = await transform(a.id, 'flip-vertical');
  check(
    badOp.status === 400 && badOp.json?.error?.code === 'INVALID_REQUEST',
    `모르는 단추: 400 (${badOp.status})`,
  );
  check(
    (await transform(a.id, 'rotate-right', { cookie: false })).status === 401,
    '세션 없음: 401',
  );
  check(
    (await transform(a.id, 'rotate-right', { origin: 'https://evil.example' })).status === 403,
    '다른 Origin: 403',
  );

  const legacy = await withRetry('옛 자산 찾기', () =>
    db.collection('assets').where('legacy', '==', true).limit(1).get(),
  );
  if (legacy.empty) {
    console.log('옛 자산이 없어 422 시험을 건너뛴다');
    return;
  }
  const legacyDoc = legacy.docs[0];
  const before = JSON.stringify(legacyDoc.data());
  const rejected = await transform(legacyDoc.id, 'rotate-right');
  check(
    rejected.status === 422 && rejected.json?.error?.code === 'NOT_TRANSFORMABLE',
    `옛 이미지: 422 (${rejected.status} ${rejected.text.slice(0, 120)})`,
  );
  const after = JSON.stringify((await db.collection('assets').doc(legacyDoc.id).get()).data());
  check(before === after, '옛 이미지 문서: 바뀌지 않음');
  const derivedFromLegacy = await db
    .collection('assets')
    .where('derivedFrom', '==', legacyDoc.id)
    .get();
  check(derivedFromLegacy.empty, '옛 이미지의 파생 자산: 없음');
}

// HTML 속성 값의 &를 되돌린다(rehype-stringify는 &#x26;으로 쓴다)
function unescapeAttr(value) {
  return value.replaceAll('&#x26;', '&').replaceAll('&amp;', '&');
}

// 자산 문서 → 렌더용 자산 (src/lib/server/entries.ts toRenderAsset과 같은 모양)
function toRenderAsset(data) {
  const pick = (variant) =>
    variant ? { url: variant.url, width: variant.width, height: variant.height } : undefined;
  const variants = data?.variants;
  if (!variants?.max) return { variants: null };
  const result = { max: pick(variants.max) };
  for (const key of ['w480', 'w960', 'w1600']) if (variants[key]) result[key] = pick(variants[key]);
  return { variants: result };
}

// 5~6. 저장한 초안의 공개 렌더, 정리
async function checkRenderAndPurge(db, bucketName, { a, b, c }) {
  const slug = `${TEST_MARK}-rotate-${RUN_ID}`;
  const createdRes = await api('POST', '/api/admin/posts', { body: { kind: 'post' } });
  const id = createdRes.json?.id;
  if (!id) throw new Error(`시험 글 생성 실패: ${createdRes.text}`);
  created.entryIds.add(id);
  const draft = {
    title: `${TEST_MARK} 회전 ${RUN_ID}`,
    description: '이미지 회전·좌우반전 스모크 시험 글이다. 곧 지운다.',
    slug,
    category: 'retrospective',
    tags: [],
    series: null,
    cover: { kind: 'generated' },
    markdown: `회전 시험\n\n<img src="${b.url}" alt="오른쪽 90°" width="300">\n\n![뒤집고 270°](${c.url})`,
    editorJson: null,
  };
  const save = await api('PUT', `/api/admin/posts/${id}/draft`, {
    body: { baseVersion: 1, device: TEST_MARK, draft },
  });
  check(
    save.status === 200 && save.json?.assetUsage === 'ok',
    `시험 초안 저장: 200, 자산 기록 ok (${save.status})`,
  );
  const stored = await api('GET', `/api/admin/posts/${id}`);
  check(
    stored.json?.status === 'draft' && stored.json?.published === null,
    '시험 글: 발행하지 않은 초안',
  );

  // 공개 페이지와 같은 렌더러로 그린다(자산은 Firestore의 실제 문서)
  const docs = await Promise.all(
    [b, c].map((asset) => db.collection('assets').doc(asset.id).get()),
  );
  const byId = new Map(docs.map((docSnap) => [docSnap.id, toRenderAsset(docSnap.data())]));
  const { html } = renderMarkdown(stored.json.draft.markdown, {
    assets: { byId, bucket: bucketName },
  });
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  const attr = (tag, name) => {
    const found = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
    return found ? unescapeAttr(found[1]) : null;
  };
  const bTag = images.find((tag) => attr(tag, 'src') === b.url);
  const cTag = images.find((tag) => attr(tag, 'src') === c.url);
  check(Boolean(bTag), `공개 렌더: B 주소 그대로 (${images.length}개 img)`);
  check(Boolean(cTag), '공개 렌더: C 주소 그대로');
  check(
    attr(bTag ?? '', 'width') === '300' && attr(bTag ?? '', 'height') === '400',
    `B: 폭 300, 돌린 비율의 높이 400 (${attr(bTag ?? '', 'width')}×${attr(bTag ?? '', 'height')})`,
  );
  check(
    (attr(bTag ?? '', 'srcset') ?? '').includes(`${b.variants.w480.url} 480w`),
    'B: srcset에 B의 w480',
  );
  check(
    attr(cTag ?? '', 'width') === '1800' && attr(cTag ?? '', 'height') === '2400',
    `C: 1800×2400 (${attr(cTag ?? '', 'width')}×${attr(cTag ?? '', 'height')})`,
  );
  check(!unescapeAttr(html).includes(a.url), '공개 렌더: 원본 A 주소 없음');

  const usage = await Promise.all(
    [a, b, c].map((asset) => db.collection('assets').doc(asset.id).get()),
  );
  check(
    usage[1].get('usedBy')?.includes(id) && usage[2].get('usedBy')?.includes(id),
    'B·C usedBy에 시험 글',
  );
  check((usage[0].get('usedBy') ?? []).length === 0, 'A usedBy: 비어 있음');

  const dry = await api('POST', '/api/admin/assets/purge', {
    body: { dryRun: true, minOrphanDays: 0, ids: [a.id, b.id, c.id] },
  });
  check(
    dry.status === 200 && dry.json?.candidates?.length === 0,
    `정리 시험 실행: 후보 없음 (${dry.text.slice(0, 200)})`,
  );
  check(
    dry.json?.kept?.some((row) => row.id === a.id),
    '정리 시험 실행: 원본 A는 kept(파생 자산이 쓰인다)',
  );

  const del = await api('DELETE', `/api/admin/posts/${id}`, { body: { confirm: id } });
  check(del.status === 200, `시험 글 삭제: 200 (${del.status})`);
  const purge = await api('POST', '/api/admin/assets/purge', {
    body: { dryRun: false, minOrphanDays: 0, ids: [a.id, b.id, c.id] },
  });
  const deleted = purge.json?.deleted ?? [];
  check(
    purge.status === 200 && [a.id, b.id, c.id].every((assetId) => deleted.includes(assetId)),
    `글 삭제 뒤 A·B·C 지우기 (${purge.text.slice(0, 200)})`,
  );
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
  // 추적한 자산과, 그 자산에서 만든 파생 자산(응답을 못 받은 경우)을 지운다
  const assetIds = new Set(created.assetIds);
  for (const id of created.assetIds) {
    const derived = await db.collection('assets').where('derivedFrom', '==', id).get();
    for (const docSnap of derived.docs) assetIds.add(docSnap.id);
  }
  for (const id of assetIds) {
    try {
      const [files] = await bucket.getFiles({ prefix: `assets/${id}/` });
      if (files.length > 0) {
        leftovers.push(`Storage assets/${id}/ ${files.length}개`);
        await bucket.deleteFiles({ prefix: `assets/${id}/` });
      }
      const ref = db.collection('assets').doc(id);
      if ((await ref.get()).exists) {
        leftovers.push(`assets/${id}`);
        await ref.delete();
      }
    } catch (error) {
      failures.push(`시험 자산 정리 실패 ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return leftovers;
}

async function main() {
  const { db, bucket, bucketName } = initAdmin();
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
    const assets = await checkTransforms(db);
    await checkRejections(db, assets.a);
    await checkRenderAndPurge(db, bucketName, assets);
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
  console.log(`정리에서 지운 남은 것: ${leftovers.length === 0 ? '없음' : leftovers.join(', ')}`);
  console.log(`검사 ${checks - failures.length}/${checks} 통과`);
  for (const failure of failures) console.log(`  실패: ${failure}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

await main();
