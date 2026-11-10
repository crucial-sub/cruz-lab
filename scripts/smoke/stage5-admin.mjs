// 재건 5단계 관리자 앱 스모크 테스트 (Plan 8.1, PR-A 몫: T1~T4)
//
// 실행: node --env-file=.env scripts/smoke/stage5-admin.mjs [--base http://localhost:4329]
//
// - 개발 서버(localhost)에 요청한다. 시험 글(제목·slug에 stage5-test), 시험 publishLog 줄, 시험 인증 사용자만 만든다.
//   끝에(실패해도 finally에서) 모두 지운다. 기존 글·사용자 초안은 읽기만 한다.
// - 세션: Admin SDK createCustomToken(ADMIN_UID) → Identity Toolkit signInWithCustomToken → POST /api/admin/session
// - 확인하는 것:
//   1. 관리자 앱 진입(/admin/**)과 로그인 화면(관리자 틀, 사전 안내)
//   2. 목록 API의 isEmptyDraft·readers30·publicPath
//   3. publishLog 부수 결과 칸(purge·backup·assetUsage·title), 출간 기록 API(쪽 넘기기·검사)
//   4. 초안 버리기 뒤 "발행 뒤 변경" 없음(D15 2)
//   5. 알림 계산과 다시 시도 API(로컬 퍼지는 skipped라 실패를 지우지 않는다)
//   6. 관리자가 아닌 계정의 세션 요청 → 403 → 그 인증 사용자 삭제(D4)
//   7. 공개 입구(D4): 푸터 "관리"(nofollow), 관리자 전용 "고치기"는 기본 hidden, 관리자 표시 스크립트, Set-Cookie 없음
// - PR-B~PR-E가 자산 목록·설정·분류·연재·리비전 검사를 더한다(Plan 8.1).

import process from 'node:process';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { initAdmin, parseArgs } from '../migrate/lib/admin.mjs';

const args = parseArgs();
const BASE = (typeof args.base === 'string' ? args.base : 'http://localhost:4329').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const TEST_MARK = 'stage5-test';

const failures = [];
let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
  return Boolean(condition);
}

// 이 실행이 만든 것 (정리 대상)
const created = { entryIds: new Set(), logIds: new Set(), userIds: new Set() };

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
  return { status: response.status, headers: response.headers, json, text };
}

async function page(path, { cookie = true } = {}) {
  const headers = cookie && sessionCookie ? { Cookie: `cruz_admin=${sessionCookie}` } : {};
  const response = await fetch(`${BASE}${path}`, { headers, redirect: 'manual' });
  const text = response.status >= 300 && response.status < 400 ? '' : await response.text();
  return { status: response.status, headers: response.headers, text };
}

// Google API 호출을 몇 번 다시 해 본다(네트워크가 잠깐 끊기는 환경, 작업 문서 4절)
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

// 커스텀 토큰으로 ID 토큰을 받는다
async function idTokenFor(uid) {
  return withRetry('ID 토큰', () => idTokenOnce(uid));
}

async function idTokenOnce(uid) {
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
}

// ───────────── 단계 ─────────────

// 1. 관리자 세션
async function signIn() {
  const adminUid = process.env.ADMIN_UID;
  if (!adminUid) throw new Error('.env에 ADMIN_UID가 필요합니다.');
  const response = await api('POST', '/api/admin/session', { body: { idToken: await idTokenFor(adminUid) }, cookie: false });
  check(response.status === 204, `세션 발급: 204여야 한다 (${response.status} ${response.text})`);
  const match = (response.headers.get('set-cookie') ?? '').match(/cruz_admin=([^;]+)/);
  if (!match) throw new Error('세션 쿠키가 없다');
  sessionCookie = match[1];
}

// 2. 관리자 앱 진입과 로그인 화면 (T1·T4)
async function checkPages() {
  for (const path of ['/admin', '/admin/log', '/admin/edit/abc', '/admin/unknown/page', '/admin?status=draft']) {
    const res = await page(path);
    check(res.status === 200, `${path}: 200이어야 한다 (${res.status})`);
    check((res.headers.get('cache-control') ?? '').includes('no-store'), `${path}: no-store가 없다`);
    check(/<astro-island[^>]*component-url="[^"]*AdminApp/.test(res.text), `${path}: AdminApp 섬이 없다`);
    // 에디터 JS 청크(1.8 MB)는 앱이 에디터 화면에 들어갈 때만 받는다(D9). 빌드 결과는 에디터 CSS(<link>)를 같이 싣는다(작업 문서 5절)
    check(!/EditorApp[^"'<>\s]*\.js/.test(res.text), `${path}: 첫 HTML이 에디터 JS를 참조한다`);
    check(res.text.includes('name="robots" content="noindex"'), `${path}: noindex가 없다`);
  }
  const noCookie = await page('/admin/log', { cookie: false });
  check(noCookie.status === 302 && noCookie.headers.get('location') === '/admin/login?next=%2Fadmin%2Flog', `쿠키 없는 /admin/log: 로그인으로 302 (${noCookie.status} ${noCookie.headers.get('location')})`);

  const login = await page('/admin/login', { cookie: false });
  check(login.status === 200, `/admin/login: 200이어야 한다 (${login.status})`);
  check(login.text.includes('블로그 관리자 전용 화면입니다'), '로그인 화면: 사전 안내가 없다');
  check(login.text.includes('Google로 로그인') && login.text.includes('블로그로 돌아가기'), '로그인 화면: 단추·돌아가기 링크가 없다');
  check(login.text.includes('name="robots" content="noindex"'), '로그인 화면: noindex가 없다');
  check(!login.text.includes('site-footer') && !login.text.includes('site-header'), '로그인 화면: 공개 헤더·푸터가 있다(관리자 틀이어야 한다)');
}

// 2-1. 공개 입구 (T4): 쿠키 없이 읽는다
async function checkPublicEntrance(items) {
  const post = items.find((item) => item.kind === 'post' && item.status === 'published' && item.publicPath);
  const project = items.find((item) => item.kind === 'project' && item.status === 'published' && item.publicPath);
  const targets = [
    { path: '/', entry: null },
    { path: '/about', entry: null },
    ...(post ? [{ path: post.publicPath, entry: post }] : []),
    ...(project ? [{ path: project.publicPath, entry: project }] : []),
  ];
  for (const { path, entry } of targets) {
    const res = await page(encodeURI(path), { cookie: false });
    check(res.status === 200, `${path}: 200 (${res.status})`);
    check(!res.headers.get('set-cookie'), `${path}: Set-Cookie가 있다`);
    check(/<a href="\/admin" rel="nofollow"[^>]*>\s*관리\s*<\/a>/.test(res.text), `${path}: 푸터 "관리" 링크(nofollow)가 없다`);
    check(res.text.includes('cruz-admin-hint') && res.text.includes('[data-admin-only]'), `${path}: 관리자 표시 스크립트가 없다`);
    // 태그만 본다(인라인 스크립트 안의 '[data-admin-only]' 글자는 빼고)
    const adminOnly = res.text.match(/<(?:a|button|span|div)\b[^<>]*\sdata-admin-only[\s>][^<>]*>?/g) ?? [];
    check(adminOnly.every((tag) => /\shidden(\s|>|=)/.test(tag)), `${path}: 관리자 전용 요소가 hidden이 아니다`);
    if (entry) {
      const edit = adminOnly.find((tag) => tag.includes(`href="/admin/edit/${entry.id}"`));
      check(Boolean(edit), `${path}: "고치기" 링크가 없다`);
    } else {
      check(adminOnly.length === 0, `${path}: 글이 아닌 페이지에 관리자 전용 요소가 있다`);
    }
  }
}

// 3. 목록 API 새 칸 (T2)
async function checkList() {
  const res = await api('GET', '/api/admin/posts');
  check(res.status === 200, `목록: 200 (${res.status})`);
  const items = res.json?.items ?? [];
  check(items.length > 0, '목록이 비었다');
  check(items.every((item) => typeof item.isEmptyDraft === 'boolean'), '목록: isEmptyDraft가 불리언이 아니다');
  check(items.every((item) => item.readers30 === null), '목록: readers30은 PR-D 전까지 null');
  check(
    items.every((item) => (item.status === 'draft' ? item.publicPath === null : true)),
    '목록: 초안에 publicPath가 있다',
  );
  check(
    items.filter((item) => item.status === 'published').every((item) => typeof item.publicPath === 'string' && item.publicPath.startsWith('/')),
    '목록: 발행 글에 publicPath가 없다',
  );
  check(items.every((item) => !item.isEmptyDraft || (item.status === 'draft' && !item.title.trim())), '목록: 빈 초안 판정이 상태·제목과 맞지 않는다');
  return items;
}

function draftContent(overrides = {}) {
  return {
    title: `${TEST_MARK} 출간 기록 ${RUN_ID}`,
    description: '재건 5단계 관리자 앱 스모크 테스트용 글이다. 곧 지운다.',
    slug: `${TEST_MARK}-${RUN_ID}`,
    category: 'retrospective',
    tags: [],
    series: null,
    cover: { kind: 'generated' },
    markdown: '스모크 테스트 본문이다.',
    editorJson: null,
    ...overrides,
  };
}

async function logsFor(db, entryId) {
  const snapshot = await db.collection('publishLog').where('entryId', '==', entryId).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => a.at.toMillis() - b.at.toMillis());
}

// 4. 발행·버리기·숨김·출간 기록·알림·다시 시도·삭제 (T3)
async function publishLogFlow(db) {
  const createdRes = await api('POST', '/api/admin/posts', { body: { kind: 'post' } });
  check(createdRes.status === 201, `시험 글 생성: 201 (${createdRes.status})`);
  const id = createdRes.json?.id;
  if (!id) throw new Error(`시험 글 생성 실패: ${createdRes.text}`);
  created.entryIds.add(id);

  let list = await api('GET', '/api/admin/posts');
  check(list.json?.items?.find((item) => item.id === id)?.isEmptyDraft === true, '새 빈 초안: isEmptyDraft가 참이어야 한다');

  const save1 = await api('PUT', `/api/admin/posts/${id}/draft`, { body: { baseVersion: 1, device: TEST_MARK, draft: draftContent() } });
  check(save1.status === 200, `초안 저장: 200 (${save1.status} ${save1.text})`);
  list = await api('GET', '/api/admin/posts');
  check(list.json?.items?.find((item) => item.id === id)?.isEmptyDraft === false, '내용 있는 초안: isEmptyDraft가 거짓이어야 한다');

  const publish = await api('POST', `/api/admin/posts/${id}/publish`, { body: { draftVersion: save1.json?.version } });
  check(publish.status === 200, `발행: 200 (${publish.status} ${publish.text})`);
  let logs = await logsFor(db, id);
  const publishRow = logs.find((row) => row.action === 'publish');
  check(publishRow?.title === draftContent().title, `발행 줄: title이 없다 (${publishRow?.title})`);
  check(publishRow?.purge === publish.json?.purge && publishRow?.backup === publish.json?.backup, `발행 줄: purge·backup이 응답과 다르다 (${publishRow?.purge}/${publishRow?.backup})`);
  check(publishRow?.assetUsage === 'ok', `발행 줄: assetUsage ok (${publishRow?.assetUsage})`);
  check(publishRow?.revision === 1, '발행 줄: revision 1');

  list = await api('GET', '/api/admin/posts');
  const listed = list.json?.items?.find((item) => item.id === id);
  check(listed?.publicPath === `/blog/${draftContent().slug}`, `발행 뒤 publicPath (${listed?.publicPath})`);

  // 초안 버리기 뒤 "발행 뒤 변경"이 없다 (D15 2)
  const save2 = await api('PUT', `/api/admin/posts/${id}/draft`, {
    body: { baseVersion: save1.json?.version, device: TEST_MARK, draft: draftContent({ title: `${TEST_MARK} 고친 제목 ${RUN_ID}` }) },
  });
  check(save2.status === 200, `두 번째 저장: 200 (${save2.status})`);
  const changed = await api('GET', `/api/admin/posts/${id}`);
  check(changed.json?.hasUnpublishedChanges === true, '저장 뒤 발행 뒤 변경 있음');
  const discard = await api('POST', `/api/admin/posts/${id}/draft/discard`, { body: { baseVersion: save2.json?.version } });
  check(discard.status === 200, `초안 버리기: 200 (${discard.status} ${discard.text})`);
  const discarded = await api('GET', `/api/admin/posts/${id}`);
  check(discarded.json?.hasUnpublishedChanges === false, '초안 버리기 뒤 발행 뒤 변경이 없어야 한다');
  check(discarded.json?.published?.fromDraftVersion === discarded.json?.draft?.version, 'fromDraftVersion = 새 초안 버전');
  check(discarded.json?.published?.revision === 1, '초안 버리기는 리비전을 바꾸지 않는다');
  const revisions = await db.collection('entries').doc(id).collection('revisions').get();
  check(revisions.size === 1 && revisions.docs[0].get('fromDraftVersion') === save1.json?.version, '리비전 문서는 바꾸지 않는다');

  // 숨김: 퍼지 결과를 그 줄에 적는다
  const hide = await api('POST', `/api/admin/posts/${id}/visibility`, { body: { visible: false } });
  check(hide.status === 200 && hide.json?.status === 'hidden', `숨김: 200 (${hide.status})`);
  logs = await logsFor(db, id);
  const hideRow = logs.find((row) => row.action === 'hide');
  check(hideRow?.purge === hide.json?.purge && hideRow?.title === draftContent().title, `숨김 줄: purge·title (${hideRow?.purge}/${hideRow?.title})`);
  check(hideRow?.backup === undefined, '숨김 줄: 백업 알림은 하지 않는다');
  const listHidden = await api('GET', '/api/admin/posts');
  check(listHidden.json?.items?.find((item) => item.id === id)?.publicPath === `/blog/${draftContent().slug}`, '숨김 글도 publicPath를 준다');

  // 출간 기록 API
  const first = await api('GET', '/api/admin/publish-log');
  check(first.status === 200 && Array.isArray(first.json?.items), `출간 기록: 200 (${first.status})`);
  check(first.json?.items?.[0]?.entryId === id && first.json.items[0].action === 'hide', '출간 기록: 최신 줄이 먼저다');
  check(first.json?.items?.every((row) => typeof row.at === 'string' && 'purge' in row && Array.isArray(row.retried)), '출간 기록: 줄 모양');
  const one = await api('GET', '/api/admin/publish-log?limit=1');
  check(one.json?.items?.length === 1 && typeof one.json?.nextBefore === 'string', `limit=1: 한 줄과 nextBefore (${one.text.slice(0, 120)})`);
  const second = await api('GET', `/api/admin/publish-log?limit=1&before=${one.json?.nextBefore}`);
  check(second.json?.items?.[0]?.id && second.json.items[0].id !== one.json.items[0].id, '다음 쪽은 다른 줄이다');
  check(second.json?.items?.[0]?.entryId === id && second.json.items[0].action === 'publish', '다음 쪽: 발행 줄');
  const badBefore = await api('GET', '/api/admin/publish-log?before=a/b');
  check(badBefore.status === 400, `틀린 before: 400 (${badBefore.status})`);
  const missingBefore = await api('GET', `/api/admin/publish-log?before=${TEST_MARK}-none-${RUN_ID}`);
  check(missingBefore.status === 400, `없는 before: 400 (${missingBefore.status})`);
  const badLimit = await api('GET', '/api/admin/publish-log?limit=500');
  check(badLimit.status === 400, `큰 limit: 400 (${badLimit.status})`);

  // 알림: 시험 실패 줄 → 띠 → 다시 시도(로컬 skipped라 남는다) → 성공 줄 → 사라짐
  const failedRef = await db.collection('publishLog').add({
    entryId: id,
    action: 'publish',
    slug: draftContent().slug,
    title: draftContent().title,
    at: Timestamp.now(),
    purge: 'failed',
    backup: 'failed',
    assetUsage: 'ok',
  });
  created.logIds.add(failedRef.id);
  let alerts = await api('GET', '/api/admin/publish-log?alerts=1');
  check(alerts.json?.alerts?.purge?.some((alert) => alert.entryId === id), '알림: 캐시 비우기 실패에 시험 글이 있다');
  check(alerts.json?.alerts?.backup?.some((alert) => alert.entryId === id), '알림: 백업 알림 실패에 시험 글이 있다');

  const retryPurge = await api('POST', `/api/admin/posts/${id}/retry`, { body: { purge: true } });
  check(retryPurge.status === 200 && ['ok', 'skipped', 'failed'].includes(retryPurge.json?.purge), `다시 비우기: 200 (${retryPurge.status} ${retryPurge.text})`);
  check(retryPurge.json?.backup === undefined, '다시 비우기: 백업은 하지 않는다');
  const retryRow = (await logsFor(db, id)).find((row) => row.action === 'retry');
  check(retryRow?.retried?.join() === 'purge' && retryRow?.purge === retryPurge.json?.purge && retryRow?.title, `retry 줄 (${JSON.stringify(retryRow?.retried)})`);
  alerts = await api('GET', '/api/admin/publish-log?alerts=1');
  if (retryPurge.json?.purge === 'skipped') {
    check(alerts.json?.alerts?.purge?.some((alert) => alert.entryId === id), '알림: skipped 다시 시도는 실패를 지우지 않는다');
  }
  const okRef = await db.collection('publishLog').add({
    entryId: id,
    action: 'retry',
    slug: draftContent().slug,
    title: draftContent().title,
    at: Timestamp.now(),
    retried: ['purge'],
    purge: 'ok',
  });
  created.logIds.add(okRef.id);
  alerts = await api('GET', '/api/admin/publish-log?alerts=1');
  check(!alerts.json?.alerts?.purge?.some((alert) => alert.entryId === id), '알림: 성공 줄 뒤 캐시 실패가 사라진다');
  check(alerts.json?.alerts?.backup?.some((alert) => alert.entryId === id), '알림: 백업 실패는 남는다');

  const retryBackup = await api('POST', `/api/admin/posts/${id}/retry`, { body: { backup: true } });
  check(retryBackup.status === 200 && ['dispatched', 'skipped', 'failed'].includes(retryBackup.json?.backup), `다시 알리기: 200 (${retryBackup.status})`);

  const retryEmpty = await api('POST', `/api/admin/posts/${id}/retry`, { body: {} });
  check(retryEmpty.status === 400, `다시 시도 빈 요청: 400 (${retryEmpty.status})`);
  const retryForeign = await api('POST', `/api/admin/posts/${id}/retry`, { body: { purge: true }, origin: 'https://evil.example' });
  check(retryForeign.status === 403, `다시 시도 다른 Origin: 403 (${retryForeign.status})`);
  const retryNone = await api('POST', `/api/admin/posts/${TEST_MARK}-none-${RUN_ID}/retry`, { body: { purge: true } });
  check(retryNone.status === 404, `글·기록 없는 다시 시도: 404 (${retryNone.status})`);
  const noCookie = await api('GET', '/api/admin/publish-log', { cookie: false });
  check(noCookie.status === 401, `쿠키 없는 출간 기록: 401 (${noCookie.status})`);

  // 삭제: 부수 결과와 제목을 남긴다. 지운 글도 다시 시도할 수 있다(기록의 제목을 쓴다)
  const del = await api('DELETE', `/api/admin/posts/${id}`, { body: { confirm: id } });
  check(del.status === 200, `시험 글 삭제: 200 (${del.status})`);
  logs = await logsFor(db, id);
  const deleteRow = logs.find((row) => row.action === 'delete');
  check(deleteRow?.title === draftContent().title, `삭제 줄: title (${deleteRow?.title})`);
  check(deleteRow?.purge === del.json?.purge && deleteRow?.backup === del.json?.backup && deleteRow?.assetUsage === 'ok', '삭제 줄: 부수 결과');
  const retryDeleted = await api('POST', `/api/admin/posts/${id}/retry`, { body: { purge: true } });
  check(retryDeleted.status === 200, `지운 글 다시 비우기: 200 (${retryDeleted.status})`);
  const lastRow = (await logsFor(db, id)).at(-1);
  check(lastRow?.action === 'retry' && lastRow?.title === draftContent().title, '지운 글 retry 줄: 기록의 제목');
}

// 5. 관리자가 아닌 계정 (D4): 403 → 그 인증 사용자 삭제
async function rejectNonAdmin() {
  const uid = `${TEST_MARK}-${RUN_ID}`;
  created.userIds.add(uid);
  await withRetry('시험 사용자 만들기', () =>
    getAuth().createUser({ uid, email: `${uid}@example.com`, emailVerified: true, displayName: TEST_MARK }),
  );
  const idToken = await idTokenFor(uid);
  const res = await api('POST', '/api/admin/session', { body: { idToken }, cookie: false });
  check(res.status === 403 && res.json?.error?.code === 'NOT_ADMIN', `비관리자 세션: 403 NOT_ADMIN (${res.status} ${res.text})`);
  check(res.json?.error?.details?.authRecordDeleted === true, '비관리자 세션: authRecordDeleted가 참이어야 한다');
  check(!res.headers.get('set-cookie'), '비관리자 세션: 쿠키를 주면 안 된다');
  const gone = await withRetry('시험 사용자 확인', async () => {
    try {
      await getAuth().getUser(uid);
      return false;
    } catch (error) {
      if (error?.code === 'auth/user-not-found') return true;
      throw error;
    }
  });
  check(gone, '비관리자 인증 사용자가 남았다');

  // 관리자 UID는 그대로다
  const admin = await withRetry('관리자 확인', () => getAuth().getUser(process.env.ADMIN_UID));
  check(admin.uid === process.env.ADMIN_UID, '관리자 인증 사용자가 없다');
}

async function signOut() {
  const response = await api('DELETE', '/api/admin/session');
  check(response.status === 204, `로그아웃: 204 (${response.status})`);
}

// 정리 한 단계. 네트워크 끊김에 다시 시도하고, 그래도 실패하면 기록만 하고 다음 단계로 간다
async function cleanupStep(label, run) {
  try {
    await withRetry(label, run);
  } catch (error) {
    failures.push(`${label}에 실패했다 (${error instanceof Error ? error.message : error})`);
  }
}

// 남은 시험 데이터를 지운다 (한 단계가 실패해도 끝까지 한다)
// - 일부러 넣은 실패 줄을 먼저 지운다. 남으면 관리자 앱에 가짜 알림 띠가 7일 동안 보인다.
async function cleanup(db) {
  const leftovers = [];
  for (const logId of created.logIds) {
    await cleanupStep(`시험 줄 정리 ${logId}`, async () => {
      const ref = db.collection('publishLog').doc(logId);
      if ((await ref.get()).exists) await ref.delete();
    });
  }
  for (const id of created.entryIds) {
    await cleanupStep(`시험 글 정리 ${id}`, async () => {
      const ref = db.collection('entries').doc(id);
      if ((await ref.get()).exists) {
        leftovers.push(`entries/${id}`);
        await db.recursiveDelete(ref);
      }
    });
    await cleanupStep(`시험 글의 기록 정리 ${id}`, async () => {
      const logs = await db.collection('publishLog').where('entryId', '==', id).get();
      for (const log of logs.docs) await log.ref.delete();
    });
  }
  await cleanupStep('없는 글 기록 정리', async () => {
    const noneLogs = await db.collection('publishLog').where('entryId', '==', `${TEST_MARK}-none-${RUN_ID}`).get();
    for (const log of noneLogs.docs) await log.ref.delete();
  });
  for (const uid of created.userIds) {
    try {
      await withRetry('시험 사용자 정리', async () => {
        try {
          await getAuth().deleteUser(uid);
          leftovers.push(`auth/${uid}`);
        } catch (error) {
          if (error?.code !== 'auth/user-not-found') throw error;
          // 이미 지웠다(정상)
        }
      });
    } catch (error) {
      failures.push(`시험 사용자를 지우지 못했다: ${uid} (${error instanceof Error ? error.message : error})`);
    }
  }
  return leftovers;
}

async function main() {
  const { db } = initAdmin();
  console.log(`기준 ${BASE}, 실행 ID ${RUN_ID}`);
  const [entriesBefore, logBefore] = await withRetry('처음 수 세기', () =>
    Promise.all([db.collection('entries').count().get(), db.collection('publishLog').count().get()]),
  );

  // Ctrl+C로 멈춰도 시험 데이터를 지우고 끝낸다(finally는 신호로 끝날 때 돌지 않는다)
  process.once('SIGINT', () => {
    console.log('중단 신호: 시험 데이터를 지우고 끝낸다');
    cleanup(db).finally(() => process.exit(130));
  });

  let leftovers = [];
  try {
    await signIn();
    await checkPages();
    const items = await checkList();
    console.log(`목록 ${items.length}행, 빈 초안 ${items.filter((item) => item.isEmptyDraft).length}편`);
    await checkPublicEntrance(items);
    await publishLogFlow(db);
    await rejectNonAdmin();
    await signOut();
  } catch (error) {
    failures.push(`중단: ${error instanceof Error ? error.stack : String(error)}`);
  } finally {
    leftovers = await cleanup(db);
  }

  const [entriesAfter, logAfter] = await withRetry('끝 수 세기', () =>
    Promise.all([db.collection('entries').count().get(), db.collection('publishLog').count().get()]),
  );
  check(entriesAfter.data().count === entriesBefore.data().count, `entries 수가 처음과 다르다 (${entriesBefore.data().count} → ${entriesAfter.data().count})`);
  check(logAfter.data().count === logBefore.data().count, `publishLog 수가 처음과 다르다 (${logBefore.data().count} → ${logAfter.data().count})`);
  if (leftovers.length > 0) console.log(`정리 단계가 지운 남은 데이터: ${leftovers.join(', ')}`);

  console.log(`검사 ${checks}건, 실패 ${failures.length}건`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = failures.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
