// 재건 2단계 관리자 API 스모크 테스트 (Plan 10.3)
//
// 실행: node --env-file=.env scripts/smoke/stage2-api.mjs [--base http://localhost:4321] [--read-only]
//
// - --read-only: 세션 발급, 인증·출처 검사, 목록 조회, 로그아웃만 한다. Firestore·Storage에 쓰지 않는다.
// - 개발 서버(localhost)에 요청한다. 시험 글과 시험 자산만 만들고 끝에 모두 지운다.
// - 기존 글은 읽기만 한다. 저장·발행·삭제하지 않는다.
// - 세션: Admin SDK createCustomToken(ADMIN_UID) → Identity Toolkit signInWithCustomToken → POST /api/admin/session
// - 실패해도 finally에서 시험 데이터(글, revisions, publishLog, 자산 문서, Storage assets/{id}/)를 지운다.

import { createHash } from 'node:crypto';
import process from 'node:process';
import { getAuth } from 'firebase-admin/auth';
import sharp from 'sharp';
import { initAdmin, parseArgs } from '../migrate/lib/admin.mjs';

const args = parseArgs();
const BASE = (typeof args.base === 'string' ? args.base : 'http://localhost:4321').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const READ_ONLY = Boolean(args['read-only']);
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

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

// 관리자 API 요청. 기본으로 같은 Origin과 세션 쿠키를 붙인다
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
  return { status: response.status, headers: response.headers, json, text };
}

// 공개 페이지 요청 (쿠키 없음)
async function publicGet(path) {
  const response = await fetch(`${BASE}${encodeURI(path)}`, { redirect: 'manual' });
  const text = response.status >= 300 && response.status < 400 ? '' : await response.text();
  return { status: response.status, headers: response.headers, text };
}

// ───────────── 단계 ─────────────

// 1. 세션 쿠키 받기
async function signIn() {
  const adminUid = process.env.ADMIN_UID;
  const apiKey = process.env.PUBLIC_FIREBASE_API_KEY;
  if (!adminUid || !apiKey) throw new Error('.env에 ADMIN_UID와 PUBLIC_FIREBASE_API_KEY가 필요합니다.');

  const customToken = await getAuth().createCustomToken(adminUid);
  const signInResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const signIn = await signInResponse.json();
  if (!signIn.idToken) throw new Error(`signInWithCustomToken 실패: ${signInResponse.status}`);

  // 다른 Origin에서는 세션을 주지 않는다
  const foreign = await api('POST', '/api/admin/session', { body: { idToken: signIn.idToken }, origin: 'https://evil.example', cookie: false });
  check(foreign.status === 403, `세션 발급(다른 Origin): 403이어야 한다 (${foreign.status})`);

  const response = await api('POST', '/api/admin/session', { body: { idToken: signIn.idToken }, cookie: false });
  check(response.status === 204, `세션 발급: 204여야 한다 (${response.status} ${response.text})`);
  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/cruz_admin=([^;]+)/);
  if (!match) throw new Error('세션 쿠키가 없다');
  sessionCookie = match[1];
  check(/HttpOnly/i.test(setCookie), '세션 쿠키: HttpOnly가 없다');
  check(/SameSite=Lax/i.test(setCookie), '세션 쿠키: SameSite=Lax가 없다');
  check(/Path=\//i.test(setCookie), '세션 쿠키: Path=/가 없다');
  check(/Max-Age=1209600/i.test(setCookie), '세션 쿠키: 만료가 14일이 아니다');
  if (ORIGIN.startsWith('https:')) check(/Secure/i.test(setCookie), '세션 쿠키: https인데 Secure가 없다');

  const session = await api('GET', '/api/admin/session');
  check(session.status === 200 && session.json?.uid === adminUid, `GET 세션: uid가 다르다 (${session.status})`);
  check(session.headers.get('cache-control') === 'no-store', 'GET 세션: Cache-Control no-store가 없다');
}

// 2. 인증·출처 검사
async function checkGuards() {
  const noCookie = await api('GET', '/api/admin/posts', { cookie: false });
  check(noCookie.status === 401 && noCookie.json?.error?.code === 'UNAUTHENTICATED', `쿠키 없는 API: 401이어야 한다 (${noCookie.status})`);

  const page = await fetch(`${BASE}/admin`, { redirect: 'manual' });
  check(page.status === 302, `쿠키 없는 /admin: 302여야 한다 (${page.status})`);
  check(page.headers.get('location') === '/admin/login?next=%2Fadmin', `쿠키 없는 /admin: 이동 주소가 다르다 (${page.headers.get('location')})`);

  const pageWithCookie = await fetch(`${BASE}/admin`, { headers: { Cookie: `cruz_admin=${sessionCookie}` }, redirect: 'manual' });
  check(pageWithCookie.status === 200, `쿠키 있는 /admin: 200이어야 한다 (${pageWithCookie.status})`);
  check((pageWithCookie.headers.get('cache-control') ?? '').includes('no-store'), '관리자 페이지: no-store가 없다');

  const login = await fetch(`${BASE}/admin/login`, { redirect: 'manual' });
  check(login.status === 200, `/admin/login: 200이어야 한다 (${login.status})`);

  const badCookie = await fetch(`${BASE}/api/admin/posts`, { headers: { Cookie: 'cruz_admin=forged' } });
  check(badCookie.status === 401, `위조 쿠키: 401이어야 한다 (${badCookie.status})`);

  const foreign = await api('POST', '/api/admin/posts', { body: { kind: 'post' }, origin: 'https://evil.example' });
  check(foreign.status === 403 && foreign.json?.error?.code === 'ORIGIN_MISMATCH', `다른 Origin 쓰기: 403이어야 한다 (${foreign.status})`);

  const noOrigin = await api('POST', '/api/admin/posts', { body: { kind: 'post' }, origin: null });
  check(noOrigin.status === 403, `Origin 없는 쓰기: 403이어야 한다 (${noOrigin.status})`);

  const badQuery = await api('GET', '/api/admin/posts?status=unlisted');
  check(badQuery.status === 400, `틀린 status 조건: 400이어야 한다 (${badQuery.status})`);
}

// 새 글을 만들고 ID를 기록한다
async function createEntry(kind) {
  const response = await api('POST', '/api/admin/posts', { body: { kind } });
  check(response.status === 201 && response.json?.draft?.version === 1, `${kind} 생성: 201, version 1이어야 한다 (${response.status})`);
  if (!response.json?.id) throw new Error(`${kind} 생성 실패: ${response.text}`);
  created.entryIds.add(response.json.id);
  return response.json.id;
}

// 초안을 저장하고 새 버전을 돌려준다
async function saveDraft(id, baseVersion, draft) {
  const response = await api('PUT', `/api/admin/posts/${id}/draft`, {
    body: { baseVersion, device: 'stage2-smoke', draft },
  });
  check(response.status === 200, `초안 저장(v${baseVersion}): 200이어야 한다 (${response.status} ${response.text})`);
  return response.json?.version;
}

function draftContent(overrides = {}) {
  return {
    title: `스모크 시험 글 ${RUN_ID}`,
    description: '재건 2단계 API 스모크 테스트용 글이다. 곧 지운다.',
    slug: `stage2-smoke-${RUN_ID}`,
    category: 'retrospective',
    tags: ['Stage2 Smoke'],
    series: null,
    cover: { kind: 'generated' },
    markdown: '스모크 테스트 본문이다.',
    editorJson: null,
    ...overrides,
  };
}

// 3. 시험 이미지 업로드 (2000×1200 PNG, EXIF 포함)
async function uploadImage(db, bucket) {
  const png = await sharp({ create: { width: 2000, height: 1200, channels: 3, background: { r: 30, g: 120, b: 200 } } })
    .withExif({ IFD0: { Copyright: `stage2-smoke-${RUN_ID}` } })
    .png()
    .toBuffer();
  const sha256 = createHash('sha256').update(png).digest('hex');
  const body = { fileName: `stage2-smoke-${RUN_ID}.png`, contentType: 'image/png', bytes: png.length, sha256 };

  const svg = await api('POST', '/api/admin/assets/upload-url', { body: { ...body, contentType: 'image/svg+xml' } });
  check(svg.status === 400, `svg 업로드 주소: 400이어야 한다 (${svg.status})`);

  const urlResponse = await api('POST', '/api/admin/assets/upload-url', { body });
  check(urlResponse.status === 200 && urlResponse.json?.uploadUrl, `업로드 주소: 200이어야 한다 (${urlResponse.status} ${urlResponse.text})`);
  const { assetId, uploadUrl, requiredHeaders } = urlResponse.json;
  created.assetIds.add(assetId);

  const missing = await api('POST', `/api/admin/assets/${assetId}/finalize`);
  check(missing.status === 422 && missing.json?.error?.code === 'UPLOAD_MISSING', `올리기 전 finalize: 422여야 한다 (${missing.status})`);

  const put = await fetch(uploadUrl, { method: 'PUT', headers: requiredHeaders, body: png });
  check(put.ok, `서명 URL PUT: 2xx여야 한다 (${put.status})`);

  const finalize = await api('POST', `/api/admin/assets/${assetId}/finalize`);
  check(finalize.status === 200 && finalize.json?.asset?.status === 'ready', `finalize: ready여야 한다 (${finalize.status} ${finalize.text})`);
  const asset = finalize.json.asset;
  const variants = asset.variants ?? {};
  check(variants.w480?.width === 480 && variants.w960?.width === 960 && variants.w1600?.width === 1600, 'finalize: 변형 3종(480·960·1600)이 없다');
  check(variants.max?.width === 2000 && asset.url === variants.max.url, 'finalize: 최대 변형(2000)이 본문 주소가 아니다');
  check(asset.contentType === 'image/webp', `finalize: 형식이 webp가 아니다 (${asset.contentType})`);

  // 변형은 webp이고 EXIF가 없다. 원본은 지워졌다
  const variantBuffer = Buffer.from(await (await fetch(variants.w960.url)).arrayBuffer());
  const variantMeta = await sharp(variantBuffer).metadata();
  check(variantMeta.format === 'webp' && variantMeta.width === 960, `w960: webp 960px이 아니다 (${variantMeta.format} ${variantMeta.width})`);
  check(!variantMeta.exif, 'w960: EXIF가 남아 있다');
  const [originalExists] = await bucket.file(`assets/${assetId}/original.png`).exists();
  check(!originalExists, '원본이 지워지지 않았다');

  const again = await api('POST', `/api/admin/assets/${assetId}/finalize`);
  check(again.status === 200 && again.json?.asset?.url === asset.url, 'finalize 재호출: 같은 자산이어야 한다(멱등)');

  const duplicate = await api('POST', '/api/admin/assets/upload-url', { body });
  check(duplicate.json?.existing?.id === assetId, '같은 해시 업로드 주소: existing을 돌려줘야 한다');

  const doc = await db.collection('assets').doc(assetId).get();
  check(doc.get('legacy') === false && doc.get('usedBy').length === 0, '새 자산: legacy false, usedBy []여야 한다');
  return asset;
}

// 4. 시험 post: 저장·충돌·검사·발행·숨김·slug 바꾸기·초안 버리기
async function postFlow(db, asset) {
  const id = await createEntry('post');
  let version = 1;

  // 설명 없이 저장 → 발행하면 422
  version = await saveDraft(id, version, draftContent({ description: '' }));
  check(version === 2, `초안 저장 뒤 version 2여야 한다 (${version})`);

  const stale = await api('PUT', `/api/admin/posts/${id}/draft`, { body: { baseVersion: 1, device: 'other', draft: draftContent() } });
  check(stale.status === 409 && stale.json?.error?.code === 'DRAFT_CONFLICT', `낡은 baseVersion: 409여야 한다 (${stale.status})`);
  check(stale.json?.error?.details?.version === 2 && stale.json?.error?.details?.device === 'stage2-smoke', '409 details: 서버 초안 버전·기기가 없다');

  const tooMany = await api('PUT', `/api/admin/posts/${id}/draft`, { body: { baseVersion: version, device: null, draft: draftContent({ tags: ['a', 'b', 'c', 'd'] }) } });
  check(tooMany.status === 400, `태그 4개: 400이어야 한다 (${tooMany.status})`);

  const invalid = await api('POST', `/api/admin/posts/${id}/publish`, { body: { draftVersion: version } });
  check(invalid.status === 422 && invalid.json?.error?.details?.some((issue) => issue.field === 'description'), `설명 없는 발행: 422여야 한다 (${invalid.status})`);

  const wrongVersion = await api('POST', `/api/admin/posts/${id}/publish`, { body: { draftVersion: 1 } });
  check(wrongVersion.status === 409, `다른 draftVersion 발행: 409여야 한다 (${wrongVersion.status})`);

  const visibilityDraft = await api('POST', `/api/admin/posts/${id}/visibility`, { body: { visible: false } });
  check(visibilityDraft.status === 409, `draft 숨김: 409여야 한다 (${visibilityDraft.status})`);

  // 이미지를 본문에 넣고 저장 → usedBy에 글 ID
  version = await saveDraft(id, version, draftContent({ markdown: `스모크 테스트 본문이다.\n\n![시험 이미지](${asset.url})\n` }));
  const assetDoc = await db.collection('assets').doc(asset.id).get();
  check(assetDoc.get('usedBy').includes(id), '초안 저장 뒤 자산 usedBy에 글 ID가 없다');

  const entry = await api('GET', `/api/admin/posts/${id}`);
  check(entry.status === 200 && entry.json?.draft?.tags?.[0] === 'stage2-smoke', `한 편 읽기: 태그가 정규화되지 않았다 (${JSON.stringify(entry.json?.draft?.tags)})`);

  // 발행
  const publish = await api('POST', `/api/admin/posts/${id}/publish`, { body: { draftVersion: version } });
  check(publish.status === 200 && publish.json?.revision === 1 && publish.json?.status === 'published', `발행: 200, revision 1이어야 한다 (${publish.status} ${publish.text})`);
  check(['ok', 'skipped'].includes(publish.json?.purge), `발행: purge 값이 이상하다 (${publish.json?.purge})`);
  const slug = draftContent().slug;
  check(publish.json?.publicUrl === `${ORIGIN}/blog/${slug}`, `발행: publicUrl이 다르다 (${publish.json?.publicUrl})`);

  const page = await publicGet(`/blog/${slug}`);
  check(page.status === 200 && page.text.includes(draftContent().title), `발행 뒤 /blog/<slug>: 200이어야 한다 (${page.status})`);
  check(!page.headers.get('set-cookie'), '공개 글 응답에 Set-Cookie가 있다');
  const list = await publicGet('/blog');
  check(list.text.includes(id), '발행 뒤 /blog 목록에 시험 글이 없다');

  const revision = await db.collection('entries').doc(id).collection('revisions').doc('1').get();
  check(revision.exists && revision.get('slug') === slug, 'revisions/1이 없다');

  // 숨김 → 404, 다시 보임 → 200
  const hide = await api('POST', `/api/admin/posts/${id}/visibility`, { body: { visible: false } });
  check(hide.status === 200 && hide.json?.status === 'hidden', `숨김: hidden이어야 한다 (${hide.status})`);
  check((await publicGet(`/blog/${slug}`)).status === 404, '숨김 뒤 /blog/<slug>: 404여야 한다');
  const hideAgain = await api('POST', `/api/admin/posts/${id}/visibility`, { body: { visible: false } });
  check(hideAgain.json?.changed === false, '이미 숨긴 글 숨김: changed false여야 한다');
  const unhide = await api('POST', `/api/admin/posts/${id}/visibility`, { body: { visible: true } });
  check(unhide.status === 200 && unhide.json?.status === 'published', `다시 보임: published여야 한다 (${unhide.status})`);
  check((await publicGet(`/blog/${slug}`)).status === 200, '다시 보임 뒤 /blog/<slug>: 200이어야 한다');

  // slug 바꿔 다시 발행 → 옛 slug는 301
  const newSlug = `${slug}-v2`;
  version = await saveDraft(id, version, draftContent({ slug: newSlug, markdown: `바뀐 본문이다.\n\n![시험 이미지](${asset.url})\n` }));
  const listItem = (await api('GET', '/api/admin/posts?q=stage2-smoke')).json?.items?.find((item) => item.id === id);
  check(listItem?.hasUnpublishedChanges === true, '고친 뒤 목록: hasUnpublishedChanges true여야 한다');
  const republish = await api('POST', `/api/admin/posts/${id}/publish`, { body: { draftVersion: version } });
  check(republish.status === 200 && republish.json?.revision === 2, `다시 발행: revision 2여야 한다 (${republish.status})`);
  const oldSlugPage = await publicGet(`/blog/${slug}`);
  check(oldSlugPage.status === 301 && decodeURI(oldSlugPage.headers.get('location') ?? '').endsWith(`/blog/${newSlug}`), `옛 slug: 301이어야 한다 (${oldSlugPage.status} ${oldSlugPage.headers.get('location')})`);

  // 초안 버리기: 고친 제목이 발행본 제목으로 돌아간다
  version = await saveDraft(id, version, draftContent({ slug: newSlug, title: '버릴 제목' }));
  const discard = await api('POST', `/api/admin/posts/${id}/draft/discard`, { body: { baseVersion: version } });
  check(discard.status === 200 && discard.json?.version === version + 1, `초안 버리기: 200, version+1이어야 한다 (${discard.status})`);
  const afterDiscard = await api('GET', `/api/admin/posts/${id}`);
  check(afterDiscard.json?.draft?.title === draftContent().title && afterDiscard.json?.hasUnpublishedChanges === true, '초안 버리기 뒤 제목이 발행본과 다르다');
  check(afterDiscard.json?.slugHistory?.includes(slug), 'slugHistory에 옛 slug가 없다');

  return { id, slug: newSlug };
}

// 5. slug 유일성: 같은 slug로 다른 글을 발행하면 422
async function duplicateSlugFlow(slug) {
  const id = await createEntry('post');
  const version = await saveDraft(id, 1, draftContent({ slug, title: '중복 slug 시험' }));
  const publish = await api('POST', `/api/admin/posts/${id}/publish`, { body: { draftVersion: version } });
  check(publish.status === 422 && publish.json?.error?.details?.some((issue) => issue.field === 'slug'), `중복 slug 발행: 422여야 한다 (${publish.status})`);
  return id;
}

// 6. note: 발행해도 /blog에 없다
async function noteFlow() {
  const id = await createEntry('note');
  const version = await saveDraft(id, 1, draftContent({ title: '', description: '', slug: '', category: null, tags: [], markdown: '스모크 노트 본문이다.' }));
  const publish = await api('POST', `/api/admin/posts/${id}/publish`, { body: { draftVersion: version } });
  check(publish.status === 200 && publish.json?.publicUrl === null, `note 발행: 200, publicUrl null이어야 한다 (${publish.status} ${publish.text})`);
  const entry = await api('GET', `/api/admin/posts/${id}`);
  const slug = entry.json?.published?.slug ?? '';
  check(/^note-\d{8}-\d{4}$/.test(slug), `note slug 형식이 다르다 (${slug})`);
  check((await publicGet(`/blog/${slug}`)).status === 404, 'note /blog/<slug>: 404여야 한다');
  check(!(await publicGet('/blog')).text.includes(id), 'note가 /blog 목록에 있다');
  return id;
}

// 7. 삭제와 자산 정리
async function deleteAndPurgeFlow(db, bucket, postId, asset, otherIds) {
  const wrong = await api('DELETE', `/api/admin/posts/${postId}`, { body: { confirm: 'nope' } });
  check(wrong.status === 400, `틀린 confirm 삭제: 400이어야 한다 (${wrong.status})`);

  const remove = await api('DELETE', `/api/admin/posts/${postId}`, { body: { confirm: postId } });
  check(remove.status === 200 && remove.json?.deleted === true && remove.json?.orphanedAssets === 1, `삭제: 200, orphanedAssets 1이어야 한다 (${remove.status} ${remove.text})`);
  const gone = await db.collection('entries').doc(postId).get();
  const revisions = await db.collection('entries').doc(postId).collection('revisions').get();
  check(!gone.exists && revisions.empty, '삭제 뒤 문서나 revisions가 남았다');
  check((await api('GET', `/api/admin/posts/${postId}`)).status === 404, '삭제 뒤 한 편 읽기: 404여야 한다');
  const tombstone = await db.collection('entryTombstones').doc(postId).get();
  check(!tombstone.exists, '새로 만든 글인데 삭제 표지가 생겼다');

  const assetDoc = await db.collection('assets').doc(asset.id).get();
  check(assetDoc.get('usedBy').length === 0 && assetDoc.get('orphanedAt'), '삭제 뒤 자산에 고아 표시가 없다');

  // 기본 정리(7일)에는 방금 고아가 된 자산과 legacy 자산이 없다
  const defaultDry = await api('POST', '/api/admin/assets/purge', { body: {} });
  check(defaultDry.status === 200 && defaultDry.json?.dryRun === true, `기본 정리: 시험 실행이어야 한다 (${defaultDry.status})`);
  check(!defaultDry.json?.candidates?.some((candidate) => candidate.id === asset.id), '기본 정리: 7일이 안 된 자산이 후보에 있다');
  check(!defaultDry.json?.candidates?.some((candidate) => candidate.legacy), '기본 정리: legacy 자산이 후보에 있다');

  const dry = await api('POST', '/api/admin/assets/purge', { body: { dryRun: true, minOrphanDays: 0, ids: [asset.id] } });
  check(dry.json?.candidates?.some((candidate) => candidate.id === asset.id) && dry.json?.deleted?.length === 0, `정리 시험 실행: 시험 자산이 후보에 있어야 한다 (${dry.text})`);

  for (const id of otherIds) {
    const response = await api('DELETE', `/api/admin/posts/${id}`, { body: { confirm: id } });
    check(response.status === 200, `시험 글 삭제(${id}): 200이어야 한다 (${response.status})`);
  }

  const purge = await api('POST', '/api/admin/assets/purge', { body: { dryRun: false, minOrphanDays: 0, ids: [asset.id] } });
  check(purge.json?.deleted?.includes(asset.id), `정리 실제 실행: 시험 자산을 지워야 한다 (${purge.text})`);
  const [files] = await bucket.getFiles({ prefix: `assets/${asset.id}/` });
  check(files.length === 0, `정리 뒤 Storage 파일이 남았다 (${files.length})`);
  check(!(await db.collection('assets').doc(asset.id).get()).exists, '정리 뒤 자산 문서가 남았다');
}

// 8. 로그아웃: 쿠키를 지우는 Set-Cookie
async function signOut() {
  const response = await api('DELETE', '/api/admin/session');
  check(response.status === 204, `로그아웃: 204여야 한다 (${response.status})`);
  check(/cruz_admin=;|cruz_admin=deleted|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(response.headers.get('set-cookie') ?? ''), '로그아웃: 쿠키를 지우는 Set-Cookie가 없다');
}

// 남은 시험 데이터를 지운다 (실패해도 끝까지 한다)
async function cleanup(db, bucket) {
  const leftovers = [];
  for (const id of created.entryIds) {
    const ref = db.collection('entries').doc(id);
    if ((await ref.get()).exists) {
      leftovers.push(`entries/${id}`);
      await db.recursiveDelete(ref);
    }
    const logs = await db.collection('publishLog').where('entryId', '==', id).get();
    for (const log of logs.docs) await log.ref.delete();
  }
  for (const id of created.assetIds) {
    const ref = db.collection('assets').doc(id);
    if ((await ref.get()).exists) {
      leftovers.push(`assets/${id}`);
      await ref.delete();
    }
    const [files] = await bucket.getFiles({ prefix: `assets/${id}/` });
    if (files.length > 0) {
      leftovers.push(`Storage assets/${id}/ ${files.length}개`);
      await bucket.deleteFiles({ prefix: `assets/${id}/` });
    }
  }
  return leftovers;
}

async function main() {
  const { db, bucket } = initAdmin();
  console.log(`기준 ${BASE}, 실행 ID ${RUN_ID}`);

  const before = await db.collection('entries').count().get();
  let leftovers = [];
  try {
    await signIn();
    await checkGuards();

    const listBefore = await api('GET', '/api/admin/posts');
    check(listBefore.status === 200 && listBefore.json?.counts, `목록: 200이어야 한다 (${listBefore.status})`);
    check(listBefore.json?.items?.every((item) => !('markdown' in item)), '목록에 본문이 있다');
    console.log(`목록 수: ${JSON.stringify(listBefore.json?.counts)}`);

    // --read-only면 쓰기 단계를 건너뛴다
    if (!READ_ONLY) {
      const asset = await uploadImage(db, bucket);
      const { id: postId, slug } = await postFlow(db, asset);
      const duplicateId = await duplicateSlugFlow(slug);
      const noteId = await noteFlow();
      await deleteAndPurgeFlow(db, bucket, postId, asset, [duplicateId, noteId]);

      const listAfter = await api('GET', '/api/admin/posts');
      check(JSON.stringify(listAfter.json?.counts) === JSON.stringify(listBefore.json?.counts), `끝난 뒤 목록 수가 처음과 다르다 (${JSON.stringify(listAfter.json?.counts)})`);
    }
    await signOut();
  } catch (error) {
    failures.push(`중단: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    leftovers = await cleanup(db, bucket);
  }

  const after = await db.collection('entries').count().get();
  check(after.data().count === before.data().count, `entries 수가 처음과 다르다 (${before.data().count} → ${after.data().count})`);
  if (leftovers.length > 0) console.log(`정리 단계가 지운 남은 데이터: ${leftovers.join(', ')}`);

  console.log(`검사 ${checks}건, 실패 ${failures.length}건`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = failures.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
