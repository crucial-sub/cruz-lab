// 재건 5단계 관리자 앱 스모크 테스트 (Plan 8.1, PR-A 몫: T1~T4, PR-B 몫: T5~T8)
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
//   8. 이미지 라이브러리(T5): 자산 목록, 시험 이미지 1장 올리기 → 쓰지 않음 → 시험 실행 → 지우기, legacy는 후보 아님
//   9. 분류(T6): 시험 카테고리 만들기(첫 저장은 기존 10개 그대로)·이름·key 바꾸기(옛 주소 301)·글 옮기기·합치기·지우기,
//      시험 태그 바꾸기(옛 주소 301)·되돌리기, 목록에 없는 카테고리 저장 거부
//   10. 연재·프로젝트(T7): 목록, 시험 프로젝트 만들기·고치기·첫 Part 발행(/projects)·지우기, kind project 새 글
//   11. 리비전(T8): 판 목록·한 판·가져오기(충돌 409)·초안 버리기로 원래대로
//   분류·연재 시험은 시험 글·시험 카테고리·시험 태그·시험 프로젝트만 쓴다. 끝에 settings/taxonomy에서 시험 값을 뺀다.
// - 설정(키맵)·독자 검사는 PR-C·PR-D가 더한다(Plan 8.1).

import { createHash } from 'node:crypto';
import process from 'node:process';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import sharp from 'sharp';
import { CATEGORIES } from '../../src/lib/taxonomy.ts';
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
const created = { entryIds: new Set(), logIds: new Set(), userIds: new Set(), assetIds: new Set(), seriesKeys: new Set() };

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
// ───────────── PR-B (T5~T8) ─────────────

// 시험 글 하나를 만들고 내용을 저장한다. 버전을 돌려준다
async function createTestEntry(kind, content) {
  const createdRes = await api('POST', '/api/admin/posts', { body: { kind } });
  check(createdRes.status === 201, `시험 ${kind} 생성: 201 (${createdRes.status} ${createdRes.text})`);
  const id = createdRes.json?.id;
  if (!id) throw new Error(`시험 글 생성 실패: ${createdRes.text}`);
  created.entryIds.add(id);
  const save = await api('PUT', `/api/admin/posts/${id}/draft`, { body: { baseVersion: 1, device: TEST_MARK, draft: content } });
  check(save.status === 200, `시험 글 저장: 200 (${save.status} ${save.text})`);
  return { id, version: save.json?.version };
}

async function publishTest(id, version) {
  const response = await api('POST', `/api/admin/posts/${id}/publish`, { body: { draftVersion: version } });
  check(response.status === 200, `시험 글 발행: 200 (${response.status} ${response.text})`);
  return response.json;
}

async function entryOf(id) {
  return (await api('GET', `/api/admin/posts/${id}`)).json;
}

// 8. 이미지 라이브러리 (T5, D12)
async function checkAssets(db, bucket) {
  const total = (await withRetry('자산 수', () => db.collection('assets').count().get())).data().count;
  const list = await api('GET', '/api/admin/assets');
  check(list.status === 200 && Array.isArray(list.json?.items), `자산 목록: 200 (${list.status})`);
  const items = list.json?.items ?? [];
  check(items.length === total, `자산 목록: 문서 수와 같다 (${items.length}/${total})`);
  check(items.every((item) => typeof item.id === 'string' && typeof item.thumbUrl === 'string' && Array.isArray(item.usedBy) && ['image', 'video'].includes(item.kind)), '자산 목록: 줄 모양');
  const times = items.map((item) => item.uploadedAt ?? '');
  check(times.every((value, index) => index === 0 || times[index - 1] >= value), '자산 목록: 올린 때 최신순');
  check(items.filter((item) => item.legacy && item.variants.length === 0).every((item) => item.thumbUrl === item.url), 'legacy 썸네일은 원본 주소다');
  check(items.filter((item) => !item.legacy && item.variants.some((variant) => variant.name === 'w480')).every((item) => item.thumbUrl === item.variants.find((variant) => variant.name === 'w480').url), '새 자산 썸네일은 w480이다');
  const unusedLegacy = items.filter((item) => item.legacy && item.usedBy.length === 0);
  console.log(`자산 ${items.length}개, 쓰지 않는 legacy ${unusedLegacy.length}개`);
  const noCookie = await api('GET', '/api/admin/assets', { cookie: false });
  check(noCookie.status === 401, `자산 목록: 쿠키 없으면 401 (${noCookie.status})`);

  // 시험 이미지 1장: 올리기 → 목록에 "쓰지 않음" → 시험 실행 → 지우기
  const png = await sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 200, g: 80, b: 40 } } }).png().toBuffer();
  const sha256 = createHash('sha256').update(png).digest('hex');
  const urlResponse = await api('POST', '/api/admin/assets/upload-url', {
    body: { fileName: `${TEST_MARK}-${RUN_ID}.png`, contentType: 'image/png', bytes: png.length, sha256 },
  });
  check(urlResponse.status === 200 && urlResponse.json?.uploadUrl, `시험 이미지 업로드 주소: 200 (${urlResponse.status} ${urlResponse.text})`);
  const { assetId, uploadUrl, requiredHeaders } = urlResponse.json ?? {};
  if (!assetId) return;
  created.assetIds.add(assetId);
  await withRetry('시험 이미지 PUT', async () => {
    const put = await fetch(uploadUrl, { method: 'PUT', headers: requiredHeaders, body: png });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
  });
  const finalize = await api('POST', `/api/admin/assets/${assetId}/finalize`);
  check(finalize.status === 200 && finalize.json?.asset?.status === 'ready', `시험 이미지 finalize: 200 (${finalize.status} ${finalize.text})`);
  const after = (await api('GET', '/api/admin/assets')).json?.items ?? [];
  const mine = after.find((item) => item.id === assetId);
  check(mine && mine.usedBy.length === 0 && mine.orphanedAt && !mine.legacy && mine.kind === 'image', '시험 이미지: 목록 맨 앞쪽, 쓰지 않음·고아 표시');
  check(after[0]?.id === assetId, '시험 이미지: 가장 최근에 올린 자산이다');
  if (unusedLegacy[0]) {
    const legacyDry = await api('POST', '/api/admin/assets/purge', { body: { dryRun: true, minOrphanDays: 0, ids: [unusedLegacy[0].id] } });
    check(legacyDry.status === 200 && legacyDry.json?.candidates?.length === 0, 'legacy는 정리 후보가 아니다(main 병합 뒤)');
  }
  const dry = await api('POST', '/api/admin/assets/purge', { body: { dryRun: true, minOrphanDays: 0, ids: [assetId] } });
  check(dry.status === 200 && dry.json?.candidates?.some((candidate) => candidate.id === assetId) && dry.json?.deleted?.length === 0, `시험 실행: 후보에 있고 지우지 않는다 (${dry.text.slice(0, 120)})`);
  const purge = await api('POST', '/api/admin/assets/purge', { body: { dryRun: false, minOrphanDays: 0, ids: [assetId] } });
  check(purge.status === 200 && purge.json?.deleted?.includes(assetId), `지우기: deleted에 있다 (${purge.text.slice(0, 120)})`);
  const [files] = await withRetry('시험 이미지 파일 확인', () => bucket.getFiles({ prefix: `assets/${assetId}/` }));
  check(files.length === 0, `지우기: Storage 파일 0 (${files.length})`);
  const final = (await api('GET', '/api/admin/assets')).json?.items ?? [];
  check(!final.some((item) => item.id === assetId) && final.length === total, '지우기 뒤 목록에서 빠지고 수가 처음과 같다');
}

// 9. 분류 (T6, D1)
async function checkTaxonomy(db) {
  const first = await api('GET', '/api/admin/taxonomy');
  check(first.status === 200 && Array.isArray(first.json?.categories), `분류 읽기: 200 (${first.status})`);
  const view = first.json;
  const defaults = CATEGORIES.map((category) => ({ key: category.key, label: category.label, synonymTags: [...category.synonymTags] }));
  const shape = (categories) => categories.map(({ key, label, synonymTags }) => ({ key, label, synonymTags }));
  if (!view.stored) check(JSON.stringify(shape(view.categories)) === JSON.stringify(defaults), '문서가 없으면 코드 기본값 10개를 보인다');
  check(view.tags.some((row) => row.tag === 'pintos' && row.entryCount >= 5), '태그 목록: pintos가 있다');
  const list = await api('GET', '/api/admin/posts');
  check(list.json?.items?.filter((item) => item.category).every((item) => typeof item.categoryLabel === 'string' && item.categoryLabel), '목록: categoryLabel이 있다');

  const key = `${TEST_MARK}-c${RUN_ID}`;
  const keyB = `${key}-b`;
  const keyC = `${key}-c`;
  const tag = `${TEST_MARK}-t${RUN_ID}`;
  let version = view.version;
  const cat = (body, baseVersion = version) => api('POST', '/api/admin/taxonomy/categories', { body: { ...body, baseVersion } });

  // 만들기 (첫 저장이면 기존 10개 + 시험 1개)
  const create = await cat({ op: 'create', key, label: `시험 ${RUN_ID}` });
  check(create.status === 200 && create.json?.version === version + 1, `카테고리 만들기: 200 (${create.status} ${create.text})`);
  version = create.json?.version ?? version;
  const afterCreate = (await api('GET', '/api/admin/taxonomy')).json;
  check(afterCreate?.stored === true, '만들기 뒤 문서가 있다');
  if (!view.stored) {
    check(JSON.stringify(shape(afterCreate.categories.slice(0, 10))) === JSON.stringify(defaults), '첫 저장: 앞 10개가 코드 기본값과 같다(순서·이름·동의어)');
  }
  check((await cat({ op: 'create', key, label: '중복' })).status === 400, '같은 key 만들기: 400');
  check((await cat({ op: 'create', key: 'Bad Key', label: 'x' })).status === 400, '틀린 key: 400');
  check((await cat({ op: 'create', key: `${key}-x`, label: 'x' }, version - 1)).status === 409, '낡은 version: 409');
  const createC = await cat({ op: 'create', key: keyC, label: `시험C ${RUN_ID}` });
  version = createC.json?.version ?? version;

  // 시험 글 2편: 시험 카테고리 + 시험 태그로 발행
  const content = (n) => ({
    title: `${TEST_MARK} 분류 ${n} ${RUN_ID}`,
    description: '재건 5단계 분류 스모크 시험 글이다. 곧 지운다.',
    slug: `${TEST_MARK}-tax${n}-${RUN_ID}`,
    category: key,
    tags: [tag],
    series: null,
    cover: { kind: 'generated' },
    markdown: '분류 스모크 본문이다.',
    editorJson: null,
  });
  const posts = [];
  for (const n of [1, 2]) {
    const entry = await createTestEntry('post', content(n));
    await publishTest(entry.id, entry.version);
    posts.push(entry.id);
  }
  const unknown = await api('PUT', `/api/admin/posts/${posts[0]}/draft`, {
    body: { baseVersion: (await entryOf(posts[0])).draft.version, device: TEST_MARK, draft: { ...content(1), category: `${TEST_MARK}-none` } },
  });
  check(unknown.status === 400, `목록에 없는 카테고리로 저장: 400 (${unknown.status})`);
  const catPage = await page(`/blog/category/${key}`);
  check(catPage.status === 200 && catPage.text.includes(`시험 ${RUN_ID}`), `공개 카테고리 목록: 200, 이름 (${catPage.status})`);

  // 이름 바꾸기
  const rename = await cat({ op: 'rename', key, label: `시험 이름 ${RUN_ID}` });
  check(rename.status === 200, `이름 바꾸기: 200 (${rename.status} ${rename.text})`);
  version = rename.json?.version ?? version;
  check((await page(`/blog/category/${key}`)).text.includes(`시험 이름 ${RUN_ID}`), '이름 바꾸기 뒤 공개 목록의 이름이 바뀐다');

  // key 바꾸기: 시험 실행 → 실행 → 옛 주소 301
  const beforeVersion = (await entryOf(posts[0])).draft.version;
  const rekeyDry = await cat({ op: 'rekey', key, newKey: keyB, dryRun: true });
  check(rekeyDry.status === 200 && rekeyDry.json?.affected?.length === 2 && rekeyDry.json?.version === version, `key 바꾸기 시험 실행: 대상 2편, 쓰지 않음 (${rekeyDry.text.slice(0, 120)})`);
  const rekey = await cat({ op: 'rekey', key, newKey: keyB });
  check(rekey.status === 200 && rekey.json?.affected?.length === 2, `key 바꾸기: 200 (${rekey.status} ${rekey.text.slice(0, 120)})`);
  version = rekey.json?.version ?? version;
  const moved = await entryOf(posts[0]);
  check(moved.draft.category === keyB && moved.published.category === keyB, 'key 바꾸기: 초안·발행본 key가 바뀐다');
  check(moved.draft.version === beforeVersion + 1 && moved.hasUnpublishedChanges === false && moved.published.revision === 1, 'key 바꾸기: 초안 버전 +1, 변경 있음 없음, 새 판 없음');
  const oldPage = await page(`/blog/category/${key}`);
  check(oldPage.status === 301 && (oldPage.headers.get('location') ?? '').endsWith(`/blog/category/${keyB}`), `옛 카테고리 주소: 301 → 새 key (${oldPage.status} ${oldPage.headers.get('location')})`);
  check((await page(`/blog/category/${keyB}`)).status === 200, '새 카테고리 주소: 200');
  const rekeyLog = (await logsFor(db, 'taxonomy')).filter((row) => row.slug === keyB && row.op === 'rekey');
  check(rekeyLog.length === 1 && rekeyLog[0].affected?.length === 2 && rekeyLog[0].from === key, '기록: category rekey 줄(대상 2편, 옛 key)');

  // 글 옮기기 → 합치기 → 쓰는 카테고리 지우기 거부
  const move = await cat({ op: 'move', ids: [posts[0]], to: keyC });
  check(move.status === 200 && move.json?.affected?.length === 1, `글 옮기기: 200 (${move.status} ${move.text.slice(0, 120)})`);
  version = move.json?.version ?? version;
  check((await entryOf(posts[0])).published.category === keyC, '글 옮기기: 발행본 key가 바뀐다');
  const rekeyExisting = await cat({ op: 'rekey', key: keyC, newKey: keyB });
  check(rekeyExisting.status === 400, `있는 key로 key 바꾸기: 400(합치기는 merge) (${rekeyExisting.status})`);
  const merge = await cat({ op: 'merge', key: keyC, into: keyB });
  check(merge.status === 200 && merge.json?.affected?.length === 1, `합치기: 200 (${merge.status} ${merge.text.slice(0, 120)})`);
  version = merge.json?.version ?? version;
  const merged = (await api('GET', '/api/admin/taxonomy')).json;
  check(!merged.categories.some((category) => category.key === keyC) && merged.categoryAliases[keyC] === keyB && merged.categoryAliases[key] === keyB, '합치기: 옛 카테고리가 사라지고 별칭이 남는다');
  const inUse = await cat({ op: 'delete', key: keyB });
  check(inUse.status === 409 && inUse.json?.error?.code === 'CATEGORY_IN_USE', `쓰는 카테고리 지우기: 409 (${inUse.status})`);

  // 태그 바꾸기 → 옛 태그 주소 301 → 되돌리기
  const tagB = `${tag}-b`;
  const tagDry = await api('POST', '/api/admin/taxonomy/tags', { body: { from: tag, to: tagB, baseVersion: version, dryRun: true } });
  check(tagDry.status === 200 && tagDry.json?.affected?.length === 2, `태그 바꾸기 시험 실행: 대상 2편 (${tagDry.text.slice(0, 120)})`);
  const retag = await api('POST', '/api/admin/taxonomy/tags', { body: { from: tag, to: tagB, baseVersion: version } });
  check(retag.status === 200, `태그 바꾸기: 200 (${retag.status} ${retag.text.slice(0, 120)})`);
  version = retag.json?.version ?? version;
  check((await entryOf(posts[1])).published.tags.join() === tagB, '태그 바꾸기: 발행본 태그가 바뀐다');
  const oldTag = await page(`/blog/tag/${encodeURIComponent(tag)}`);
  check(oldTag.status === 301 && (oldTag.headers.get('location') ?? '').endsWith(`/blog/tag/${encodeURIComponent(tagB)}`), `옛 태그 주소: 301 (${oldTag.status})`);
  const synonym = await api('POST', '/api/admin/taxonomy/tags', { body: { from: tagB, to: '운영체제', baseVersion: version } });
  check(synonym.status === 400, `카테고리 동의어로 바꾸기: 400 (${synonym.status})`);
  const revert = await api('POST', '/api/admin/taxonomy/tags', { body: { from: tagB, to: tag, baseVersion: version } });
  check(revert.status === 200, `태그 되돌리기: 200 (${revert.status})`);
  version = revert.json?.version ?? version;
  const reverted = (await api('GET', '/api/admin/taxonomy')).json;
  check(reverted.tagAliases[tagB] === tag && reverted.tagAliases[tag] === undefined, '태그 되돌리기: 별칭이 뒤집힌다(돌아온 이름은 별칭이 아니다)');
  check((await page(`/blog/tag/${encodeURIComponent(tag)}`)).status === 200, '되돌린 태그 주소: 200');

  // 글을 지우고 시험 카테고리를 지운다
  for (const id of posts) {
    const response = await api('DELETE', `/api/admin/posts/${id}`, { body: { confirm: id } });
    check(response.status === 200, `시험 글 삭제: 200 (${response.status})`);
  }
  const remove = await cat({ op: 'delete', key: keyB });
  check(remove.status === 200, `빈 카테고리 지우기: 200 (${remove.status} ${remove.text.slice(0, 120)})`);
  const final = (await api('GET', '/api/admin/taxonomy')).json;
  check(!final.categories.some((category) => category.key.includes(TEST_MARK)) && !Object.values(final.categoryAliases).some((target) => target.includes(TEST_MARK)), '지우기: 시험 카테고리와 그리로 가던 별칭이 사라진다');
}

// 10. 연재·프로젝트 (T7, D2)
async function checkSeries(db) {
  const metaCount = (await withRetry('seriesMeta 수', () => db.collection('seriesMeta').count().get())).data().count;
  const list = await api('GET', '/api/admin/series');
  check(list.status === 200 && Array.isArray(list.json?.items), `연재 목록: 200 (${list.status})`);
  const items = list.json?.items ?? [];
  check(items.filter((item) => item.hasMeta).length === metaCount, `연재 목록: 문서 ${metaCount}개를 모두 보인다`);
  const firstSeries = items.findIndex((item) => !item.project);
  check(firstSeries === -1 || items.slice(firstSeries).every((item) => !item.project), '연재 목록: 프로젝트가 먼저다');
  check(items.find((item) => item.key === 'pintos')?.parts.length >= 5, '연재 목록: pintos 편 목록');

  const key = `${TEST_MARK}-p${RUN_ID}`;
  created.seriesKeys.add(key);
  check((await api('POST', '/api/admin/projects', { body: { key: 'Bad Key', title: 'x' } })).status === 400, '새 프로젝트: 틀린 key 400');
  const project = await api('POST', '/api/admin/projects', { body: { key, title: `${TEST_MARK} 프로젝트 ${RUN_ID}` } });
  check(project.status === 201 && project.json?.id, `새 프로젝트: 201 (${project.status} ${project.text})`);
  const partId = project.json?.id;
  if (!partId) return;
  created.entryIds.add(partId);
  check((await api('POST', '/api/admin/projects', { body: { key, title: 'x' } })).status === 409, '새 프로젝트: 같은 key 409');
  const part = await entryOf(partId);
  check(part.kind === 'project' && part.draft.series?.key === key && part.draft.series?.order === 1, '새 프로젝트: 첫 Part 초안(kind project, 순서 1)');
  const meta = (await withRetry('시험 프로젝트 문서', () => db.collection('seriesMeta').doc(key).get())).data();
  const maxOrder = Math.max(-1, ...items.filter((item) => item.project).map((item) => item.project.order));
  check(meta?.project?.order === maxOrder + 1 && meta?.project?.featured === false, `새 프로젝트: 순서 ${maxOrder + 1}, 대표 아님`);

  const row = (await api('GET', '/api/admin/series')).json?.items?.find((item) => item.key === key);
  check(row?.hasMeta && row.parts.length === 1 && row.project, '목록: 새 프로젝트와 첫 Part');
  const projectBody = { longDescription: '시험 긴 설명', tags: ['시험'], tech: ['Astro'], github: 'https://github.com/crucial-sub/cruz-lab', featured: false, order: maxOrder + 1, startDate: '2026-11' };
  const stale = await api('PUT', `/api/admin/series/${key}`, { body: { baseVersion: '1.000000000', title: 'x', description: '', project: projectBody } });
  check(stale.status === 409, `연재 고치기: 낡은 version 409 (${stale.status})`);
  const noProject = await api('PUT', `/api/admin/series/${key}`, { body: { baseVersion: row?.version ?? null, title: 'x', description: '' } });
  check(noProject.status === 400, `프로젝트 칸 없이 고치기: 400 (${noProject.status})`);
  const save = await api('PUT', `/api/admin/series/${key}`, {
    body: { baseVersion: row?.version ?? null, title: `${TEST_MARK} 고친 프로젝트 ${RUN_ID}`, description: '시험 설명', project: projectBody },
  });
  check(save.status === 200 && typeof save.json?.version === 'string' && save.json.version !== row?.version, `연재 고치기: 200, 새 version (${save.status} ${save.text.slice(0, 120)})`);
  const saved = (await withRetry('고친 문서', () => db.collection('seriesMeta').doc(key).get())).data();
  check(saved?.title === `${TEST_MARK} 고친 프로젝트 ${RUN_ID}` && saved?.project?.tech?.[0] === 'Astro' && saved?.project?.startDate === '2026-11', '연재 고치기: 문서가 바뀐다');

  // 첫 Part 발행 → /projects에 보인다
  const partContent = {
    title: `${TEST_MARK} Part 1 ${RUN_ID}`,
    description: '재건 5단계 프로젝트 스모크 시험 글이다. 곧 지운다.',
    slug: `${TEST_MARK}-part-${RUN_ID}`,
    category: null,
    tags: [],
    series: { key, order: 1 },
    cover: { kind: 'generated' },
    markdown: '프로젝트 스모크 본문이다.',
    editorJson: null,
  };
  const partSave = await api('PUT', `/api/admin/posts/${partId}/draft`, { body: { baseVersion: part.draft.version, device: TEST_MARK, draft: partContent } });
  check(partSave.status === 200, `첫 Part 저장: 200 (${partSave.status} ${partSave.text})`);
  await publishTest(partId, partSave.json?.version);
  const projectsPage = await page('/projects');
  check(projectsPage.status === 200 && projectsPage.text.includes(`${TEST_MARK} 고친 프로젝트 ${RUN_ID}`), '/projects에 새 프로젝트가 보인다');
  const projectPage = await page(`/projects/${key}`);
  check(projectPage.status === 302, `/projects/<key>: 첫 Part로 302 (${projectPage.status})`);

  const nowRow = (await api('GET', '/api/admin/series')).json?.items?.find((item) => item.key === key);
  const inUse = await api('DELETE', `/api/admin/series/${key}`, { body: { baseVersion: nowRow?.version ?? null } });
  check(inUse.status === 409, `글이 있는 연재 정보 지우기: 409 (${inUse.status})`);
  const deletePart = await api('DELETE', `/api/admin/posts/${partId}`, { body: { confirm: partId } });
  check(deletePart.status === 200, `첫 Part 삭제: 200 (${deletePart.status})`);
  const removeMeta = await api('DELETE', `/api/admin/series/${key}`, { body: { baseVersion: nowRow?.version ?? null } });
  check(removeMeta.status === 200, `빈 연재 정보 지우기: 200 (${removeMeta.status} ${removeMeta.text})`);
  check(!(await withRetry('지운 문서', () => db.collection('seriesMeta').doc(key).get())).exists, '연재 정보 문서가 없다');
  check((await page('/projects')).text.includes(`${TEST_MARK} 고친 프로젝트`) === false, '/projects에서 사라진다');

  // project 글도 새 글 API로 만든다(CREATABLE_KINDS)
  const plain = await api('POST', '/api/admin/posts', { body: { kind: 'project' } });
  check(plain.status === 201, `kind project 새 글: 201 (${plain.status})`);
  if (plain.json?.id) {
    created.entryIds.add(plain.json.id);
    await api('DELETE', `/api/admin/posts/${plain.json.id}`, { body: { confirm: plain.json.id } });
  }
}

// 시험 이미지 1장을 올린다(업로드 주소 → PUT → finalize). { assetId, url }
async function uploadTestImage(color) {
  const png = await sharp({ create: { width: 320, height: 200, channels: 3, background: color } }).png().toBuffer();
  const sha256 = createHash('sha256').update(png).digest('hex');
  const urlResponse = await api('POST', '/api/admin/assets/upload-url', {
    body: { fileName: `${TEST_MARK}-rev-${RUN_ID}.png`, contentType: 'image/png', bytes: png.length, sha256 },
  });
  const { assetId, uploadUrl, requiredHeaders } = urlResponse.json ?? {};
  if (!assetId) throw new Error(`시험 이미지 업로드 주소 실패: ${urlResponse.text}`);
  created.assetIds.add(assetId);
  await withRetry('시험 이미지 PUT', async () => {
    const put = await fetch(uploadUrl, { method: 'PUT', headers: requiredHeaders, body: png });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
  });
  const finalize = await api('POST', `/api/admin/assets/${assetId}/finalize`);
  if (finalize.status !== 200) throw new Error(`시험 이미지 finalize 실패: ${finalize.text}`);
  return { assetId, url: finalize.json.asset.url };
}

// 11. 리비전 (T8, D3)
async function checkRevisions(db) {
  // 1판에만 쓰는 이미지: 2판에서 빼도 정리 대상이 아니다(리비전이 쓴다, PR-B 리뷰 S1)
  const image = await uploadTestImage({ r: 90, g: 40, b: 160 });
  const content = (title) => ({
    title,
    description: '재건 5단계 리비전 스모크 시험 글이다. 곧 지운다.',
    slug: `${TEST_MARK}-rev-${RUN_ID}`,
    category: 'retrospective',
    tags: [],
    series: null,
    cover: { kind: 'generated' },
    markdown: `본문 ${title}`,
    editorJson: null,
  });
  const first = `${TEST_MARK} 1판 ${RUN_ID}`;
  const second = `${TEST_MARK} 2판 ${RUN_ID}`;
  const { id, version } = await createTestEntry('post', { ...content(first), markdown: `본문 ${first}\n\n![시험](${image.url})` });
  await publishTest(id, version);
  const save2 = await api('PUT', `/api/admin/posts/${id}/draft`, { body: { baseVersion: version, device: TEST_MARK, draft: content(second) } });
  await publishTest(id, save2.json?.version);

  const revisionOnly = await api('POST', '/api/admin/assets/purge', { body: { dryRun: true, minOrphanDays: 0, ids: [image.assetId] } });
  check(
    revisionOnly.status === 200 && revisionOnly.json?.candidates?.length === 0 && revisionOnly.json?.kept?.some((row) => row.id === image.assetId),
    `1판에만 쓰는 이미지: 정리 대상이 아니다(kept) (${revisionOnly.text.slice(0, 160)})`,
  );

  const list = await api('GET', `/api/admin/posts/${id}/revisions`);
  check(list.status === 200 && list.json?.items?.map((item) => item.revision).join() === '2,1', `판 목록: 최신 먼저 (${list.text.slice(0, 160)})`);
  check(list.json?.items?.[0]?.current === true && list.json?.items?.[1]?.current === false && list.json?.items?.[1]?.title === first, '판 목록: 지금 발행본 표시와 제목');
  const one = await api('GET', `/api/admin/posts/${id}/revisions/1`);
  check(one.status === 200 && one.json?.content?.title === first && one.json?.content?.markdown.startsWith(`본문 ${first}`), '1판 읽기: 본문 포함');
  check((await api('GET', `/api/admin/posts/${id}/revisions/9`)).status === 404, '없는 판: 404');
  check((await api('GET', `/api/admin/posts/${id}/revisions/x`)).status === 400, '틀린 판 번호: 400');
  check((await api('GET', `/api/admin/posts/${TEST_MARK}-none-${RUN_ID}/revisions`)).status === 404, '없는 글의 판 목록: 404');

  const before = await entryOf(id);
  const stale = await api('POST', `/api/admin/posts/${id}/revisions/1/restore`, { body: { baseVersion: before.draft.version - 1 } });
  check(stale.status === 409 && stale.json?.error?.code === 'DRAFT_CONFLICT', `낡은 버전으로 가져오기: 409 (${stale.status})`);
  const restore = await api('POST', `/api/admin/posts/${id}/revisions/1/restore`, { body: { baseVersion: before.draft.version } });
  check(restore.status === 200 && restore.json?.version === before.draft.version + 1, `1판 가져오기: 200, 버전 +1 (${restore.status} ${restore.text})`);
  const restored = await entryOf(id);
  check(restored.draft.title === first && restored.published.title === second && restored.published.revision === 2, '가져오기: 초안만 1판, 발행본은 2판 그대로');
  check(restored.hasUnpublishedChanges === true, '가져오기 뒤 발행 뒤 변경 있음');
  const restoreRow = (await logsFor(db, id)).find((row) => row.action === 'restore');
  check(restoreRow?.revision === 1 && restoreRow?.title === first, '기록: restore 줄(가져온 판 1)');
  const discard = await api('POST', `/api/admin/posts/${id}/draft/discard`, { body: { baseVersion: restored.draft.version } });
  check(discard.status === 200, `초안 버리기로 원래대로: 200 (${discard.status})`);
  const back = await entryOf(id);
  check(back.draft.title === second && back.hasUnpublishedChanges === false, '초안 버리기 뒤 2판 내용, 변경 없음');
  const response = await api('DELETE', `/api/admin/posts/${id}`, { body: { confirm: id } });
  check(response.status === 200, `리비전 시험 글 삭제: 200 (${response.status})`);
  // 글을 지우면 리비전도 지워진다. 이제 시험 이미지를 지울 수 있다
  const purge = await api('POST', '/api/admin/assets/purge', { body: { dryRun: false, minOrphanDays: 0, ids: [image.assetId] } });
  check(purge.status === 200 && purge.json?.deleted?.includes(image.assetId), `글 삭제 뒤 시험 이미지 지우기 (${purge.text.slice(0, 120)})`);
}

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
async function cleanup(db, bucket) {
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
  // 추적하지 못한 시험 글도 찾는다: 요청은 커밋됐지만 응답을 받지 못한 경우(네트워크 끊김, PR-B 리뷰 S11).
  // 시험 표지(stage5-test)가 ID·제목·slug·연재 key·기기 이름에 있는 글만 고른다(사용자 글에는 없다)
  await cleanupStep('표지 붙은 시험 글 찾기', async () => {
    const snapshot = await db
      .collection('entries')
      .select('draft.title', 'draft.slug', 'draft.series', 'draft.device', 'published.slug')
      .get();
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const marks = [docSnap.id, data.draft?.title, data.draft?.slug, data.draft?.series?.key, data.draft?.device, data.published?.slug];
      if (marks.some((value) => typeof value === 'string' && value.includes(TEST_MARK)) && !created.entryIds.has(docSnap.id)) {
        leftovers.push(`entries/${docSnap.id}(추적 밖)`);
        await db.recursiveDelete(docSnap.ref);
        const logs = await db.collection('publishLog').where('entryId', '==', docSnap.id).get();
        for (const log of logs.docs) await log.ref.delete();
      }
    }
  });
  // PR-B: 시험 이미지, 시험 프로젝트 정보, 분류·연재 줄, 분류 문서의 시험 값
  for (const assetId of created.assetIds) {
    await cleanupStep(`시험 이미지 정리 ${assetId}`, async () => {
      const [files] = await bucket.getFiles({ prefix: `assets/${assetId}/` });
      if (files.length > 0) {
        leftovers.push(`Storage assets/${assetId}/ ${files.length}개`);
        await bucket.deleteFiles({ prefix: `assets/${assetId}/` });
      }
      const ref = db.collection('assets').doc(assetId);
      if ((await ref.get()).exists) {
        leftovers.push(`assets/${assetId}`);
        await ref.delete();
      }
    });
  }
  for (const key of created.seriesKeys) {
    await cleanupStep(`시험 연재 정보 정리 ${key}`, async () => {
      const ref = db.collection('seriesMeta').doc(key);
      if ((await ref.get()).exists) {
        leftovers.push(`seriesMeta/${key}`);
        await ref.delete();
      }
    });
  }
  await cleanupStep('분류·연재 시험 줄 정리', async () => {
    for (const entryId of ['taxonomy', 'series']) {
      const rows = await db.collection('publishLog').where('entryId', '==', entryId).get();
      for (const row of rows.docs) {
        const data = row.data();
        if (String(data.slug ?? '').includes(TEST_MARK) || String(data.title ?? '').includes(TEST_MARK)) await row.ref.delete();
      }
    }
  });
  await cleanupStep('분류 문서의 시험 값 정리', async () => {
    const ref = db.collection('settings').doc('taxonomy');
    const snapshot = await ref.get();
    if (!snapshot.exists) return;
    const data = snapshot.data();
    const isTest = (value) => String(value).includes(TEST_MARK);
    const categories = data.categories.filter((category) => !isTest(category.key));
    const clean = (aliases) => Object.fromEntries(Object.entries(aliases ?? {}).filter(([from, to]) => !isTest(from) && !isTest(to)));
    const next = { ...data, categories, categoryAliases: clean(data.categoryAliases), tagAliases: clean(data.tagAliases) };
    if (JSON.stringify([next.categories, next.categoryAliases, next.tagAliases]) === JSON.stringify([data.categories, data.categoryAliases, data.tagAliases])) return;
    leftovers.push('settings/taxonomy 시험 값');
    await ref.set({ ...next, version: data.version + 1, updatedAt: Timestamp.now() });
  });
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
  const { db, bucket } = initAdmin();
  console.log(`기준 ${BASE}, 실행 ID ${RUN_ID}`);
  const counted = () =>
    Promise.all(['entries', 'publishLog', 'assets', 'seriesMeta'].map((name) => db.collection(name).count().get()));
  const [entriesBefore, logBefore, assetsBefore, seriesBefore] = await withRetry('처음 수 세기', counted);

  // Ctrl+C로 멈춰도 시험 데이터를 지우고 끝낸다(finally는 신호로 끝날 때 돌지 않는다)
  process.once('SIGINT', () => {
    console.log('중단 신호: 시험 데이터를 지우고 끝낸다');
    cleanup(db, bucket).finally(() => process.exit(130));
  });

  let leftovers = [];
  try {
    await signIn();
    await checkPages();
    const items = await checkList();
    console.log(`목록 ${items.length}행, 빈 초안 ${items.filter((item) => item.isEmptyDraft).length}편`);
    await checkPublicEntrance(items);
    await publishLogFlow(db);
    await checkAssets(db, bucket);
    await checkTaxonomy(db);
    await checkSeries(db);
    await checkRevisions(db);
    await rejectNonAdmin();
    await signOut();
  } catch (error) {
    failures.push(`중단: ${error instanceof Error ? error.stack : String(error)}`);
  } finally {
    leftovers = await cleanup(db, bucket);
  }

  const [entriesAfter, logAfter, assetsAfter, seriesAfter] = await withRetry('끝 수 세기', counted);
  check(entriesAfter.data().count === entriesBefore.data().count, `entries 수가 처음과 다르다 (${entriesBefore.data().count} → ${entriesAfter.data().count})`);
  check(logAfter.data().count === logBefore.data().count, `publishLog 수가 처음과 다르다 (${logBefore.data().count} → ${logAfter.data().count})`);
  check(assetsAfter.data().count === assetsBefore.data().count, `assets 수가 처음과 다르다 (${assetsBefore.data().count} → ${assetsAfter.data().count})`);
  check(seriesAfter.data().count === seriesBefore.data().count, `seriesMeta 수가 처음과 다르다 (${seriesBefore.data().count} → ${seriesAfter.data().count})`);
  // 분류 문서가 있으면 시험 값이 없고, 기존 10개가 그대로다(Plan 7절 T6 주의)
  const taxonomyDoc = await withRetry('분류 문서 확인', () => db.collection('settings').doc('taxonomy').get());
  if (taxonomyDoc.exists) {
    const keys = taxonomyDoc.get('categories').map((category) => category.key);
    check(!JSON.stringify(taxonomyDoc.data()).includes(TEST_MARK), '분류 문서에 시험 값이 남았다');
    check(CATEGORIES.every((category) => keys.includes(category.key)), `분류 문서에 기존 카테고리가 빠졌다 (${keys.join(',')})`);
  }
  if (leftovers.length > 0) console.log(`정리 단계가 지운 남은 데이터: ${leftovers.join(', ')}`);

  console.log(`검사 ${checks}건, 실패 ${failures.length}건`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = failures.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
