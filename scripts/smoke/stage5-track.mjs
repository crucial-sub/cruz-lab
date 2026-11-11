// 재건 5단계 독자 흐름 스모크 (Plan 8.1, T12, D20)
//
// 실행: node --env-file=.env scripts/smoke/stage5-track.mjs [--base http://localhost:4337]
//
// - 개발 서버·빌드 결과(localhost)에만 요청한다(다른 주소면 시작하지 않는다). localhost는 운영 호스트가 아니라
//   보통 방문은 저장하지 않는다. 시험 표지 방문(방문 ID가 stage5-test-로 시작)만 저장한다(events.ts trackStoreDecision).
// - 확인하는 것:
//   1. 검사 거부: JSON 아님, 방문 ID, 종류, 순서(방문당 상한), 경로, 글 ID, read 깊이, out 주소, search 검색어,
//      이벤트 수, 크기(413), 다른 사이트 Origin(403), POST 밖(405). 모든 응답에 no-store, Set-Cookie 없음.
//   2. 운영 호스트가 아니면 저장 안 함: 보통 방문 204 → readerEvents·readerDaily 그대로.
//      X-Forwarded-Host로 운영 주소를 흉내 내도 Host 헤더가 다르면 저장 안 함. 로봇 User-Agent는 시험 표지여도 저장 안 함.
//   3. 요약 증가: 시험 방문 2개(글 A → 글 B → 없는 주소, 직접 → 글 B)를 보내면 readerDaily/{오늘}이
//      순수 함수(dailyIncrementsOf)로 계산한 값과 같다. 모르는 글 ID의 read는 빠진다. 원본 줄의 칸.
//   4. 관리자 독자 API(GET /api/admin/readers, /api/admin/readers/{id}): 401·400, 30·90일, 시험 데이터가 요약에 보인다
//      (들어온 곳·검색어 0건 먼저·없는 주소·다음 글·전 글·읽음·경로 예). 목록 API readers30.
//   5. 90일 정리: 오늘 − 90일 줄은 지우고 오늘 − 89일 줄은 남긴다.
// - 시작할 때 readerDaily/{오늘}이 이미 있거나(실제 데이터일 수 있다) 서울 자정 5분 안이면 저장 시험(3~5)을 건너뛴다.
// - 정리(실패·Ctrl+C에도): 시험 표지 원본 줄을 지운다. 요약 문서에는 이 실행이 더한 수(204를 받은 요청의 기대값)를 빼고,
//   0이 된 칸을 지운다. 수가 남지 않으면 문서를 지운다. 그사이 들어온 실제 수는 남는다.
//   쓰는 글 ID는 기존 발행 글 2편이다(글 문서는 읽기만 한다).

import process from 'node:process';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { dailyIncrementsOf } from '../../src/lib/tracker/daily.ts';
import {
  MAX_EVENTS_PER_REQUEST,
  MAX_EVENTS_PER_VISIT,
  MAX_TRACK_BODY_BYTES,
  TEST_VISIT_PREFIX,
  kstDay,
  parseTrackBody,
  shiftDay,
} from '../../src/lib/tracker/events.ts';
import { ENTRIES, initAdmin, parseArgs } from '../migrate/lib/admin.mjs';

const args = parseArgs();
const BASE = (typeof args.base === 'string' ? args.base : 'http://localhost:4337').replace(
  /\/$/,
  '',
);
const ORIGIN = new URL(BASE).origin;
// 운영·미리보기에 보통 방문을 저장하지 않게 localhost에만 보낸다
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) {
  console.error(`localhost에만 돌린다: ${BASE}`);
  process.exit(2);
}
const RUN_ID = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, '')
  .slice(0, 14);
const READER_EVENTS = 'readerEvents';
const READER_DAILY = 'readerDaily';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
// 시험 표지 방문 ID (모두 TEST_VISIT_PREFIX로 시작한다)
const VISIT = {
  one: `${TEST_VISIT_PREFIX}${RUN_ID}-1`,
  two: `${TEST_VISIT_PREFIX}${RUN_ID}-2`,
  bot: `${TEST_VISIT_PREFIX}${RUN_ID}-bot`,
  old: `${TEST_VISIT_PREFIX}${RUN_ID}-old`,
  keep: `${TEST_VISIT_PREFIX}${RUN_ID}-keep`,
};
// 보통 방문(저장하면 안 된다)
const PLAIN_VISIT = '6f1c2a9e-1111-4222-8333-944455556666';
const TEST_REF = 'stage5-test.example';
const TEST_TERM = `stage5-test 검색 ${RUN_ID}`;
const TEST_MISSING = `/stage5-test-missing/${RUN_ID}`;

const failures = [];
let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
  return Boolean(condition);
}

const { db } = initAdmin();
const today = kstDay(Date.now());
let dailyExistedAtStart = true;
// 이 실행이 오늘 요약 문서에 더한 수(204를 받은 시험 요청의 기대값). 정리 때 뺀다
const written = {};
// Ctrl+C: 요청을 멈추고 main의 finally가 정리한다
let interrupted = false;

// ───────────── HTTP 도구 ─────────────

let sessionCookie = '';

// - 브라우저 sendBeacon처럼 text/plain + 같은 사이트 Origin으로 보낸다.
// - 빌드 결과(운영 모드)에서는 Astro의 checkOrigin이 처리기보다 먼저 돈다. text/plain POST의 Origin이 요청 주소와 다르거나
//   없으면 Astro가 403을 준다(그 응답은 no-store가 없다). 처리기의 Origin 검사는 그 밖의 형식(application/json)에서 본다.
async function track(
  payload,
  {
    origin = ORIGIN,
    userAgent = BROWSER_UA,
    headers = {},
    raw,
    contentType = 'text/plain;charset=UTF-8',
  } = {},
) {
  if (interrupted) throw new Error('중단');
  const response = await fetch(`${BASE}/api/track`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'User-Agent': userAgent,
      ...(origin ? { Origin: origin } : {}),
      ...headers,
    },
    body: raw ?? JSON.stringify(payload),
    redirect: 'manual',
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  // 공개 응답: 쿠키를 쓰지 않는다. 처리기의 응답은 저장하지 않는다(no-store). 403은 Astro checkOrigin일 수 있어 빼고 본다
  check(!response.headers.get('set-cookie'), `track ${response.status}: Set-Cookie가 있다`);
  if (response.status !== 403) {
    check(
      (response.headers.get('cache-control') ?? '').includes('no-store'),
      `track ${response.status}: no-store가 없다`,
    );
  }
  return { status: response.status, json };
}

async function api(method, path, { cookie = true } = {}) {
  if (interrupted) throw new Error('중단');
  const headers = { Origin: ORIGIN };
  if (cookie && sessionCookie) headers.Cookie = `cruz_admin=${sessionCookie}`;
  const response = await fetch(`${BASE}${path}`, { method, headers, redirect: 'manual' });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

// Google API 호출을 몇 번 다시 해 본다(네트워크가 잠깐 끊기는 환경, 5단계 작업 문서 4.6)
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

async function signIn() {
  const adminUid = process.env.ADMIN_UID;
  const apiKey = process.env.PUBLIC_FIREBASE_API_KEY;
  if (!adminUid || !apiKey)
    throw new Error('.env에 ADMIN_UID·PUBLIC_FIREBASE_API_KEY가 필요합니다.');
  const idToken = await withRetry('ID 토큰', async () => {
    const customToken = await getAuth().createCustomToken(adminUid);
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
  const response = await fetch(`${BASE}/api/admin/session`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
    redirect: 'manual',
  });
  check(response.status === 204, `세션 발급: 204 (${response.status})`);
  const match = (response.headers.get('set-cookie') ?? '').match(/cruz_admin=([^;]+)/);
  if (!match) throw new Error('세션 쿠키가 없다');
  sessionCookie = match[1];
}

// ───────────── 데이터 도구 ─────────────

async function countCollection(name) {
  const snapshot = await db.collection(name).count().get();
  return snapshot.data().count;
}

// 시험 표지 방문의 원본 줄(접두사 범위)
async function testEventDocs() {
  const snapshot = await db
    .collection(READER_EVENTS)
    .where('visit', '>=', TEST_VISIT_PREFIX)
    .where('visit', '<', `${TEST_VISIT_PREFIX.slice(0, -1)}.`)
    .get();
  return snapshot.docs;
}

async function eventsOfVisit(visit) {
  const snapshot = await db.collection(READER_EVENTS).where('visit', '==', visit).get();
  return snapshot.docs.map((docSnap) => docSnap.data()).sort((a, b) => a.seq - b.seq);
}

// 문서 값에서 day·updatedAt을 뺀 나머지
function summaryPart(data) {
  const rest = { ...data };
  delete rest.day;
  delete rest.updatedAt;
  return rest;
}

function sameTree(a, b) {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

// 시험 요청(한 페이지) → 검사를 통과한 TrackEvent (기대값 계산용)
function parsed(visit, request) {
  const result = parseTrackBody(JSON.stringify({ v: visit, ...request }));
  if (!result.ok) throw new Error(`시험 이벤트가 검사를 통과하지 못한다: ${result.reason}`);
  return result.events;
}

// 기대값 나무 두 개를 더한다
function addTrees(target, tree) {
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'number')
      target[key] = (typeof target[key] === 'number' ? target[key] : 0) + value;
    else
      target[key] = addTrees(
        target[key] && typeof target[key] === 'object' ? target[key] : {},
        value,
      );
  }
  return target;
}

// ───────────── 단계 ─────────────

const visit = PLAIN_VISIT;
const okView = { t: 'view', s: 1 };
// 요청 하나 = 한 페이지(경로 p, 글 ID i)의 이벤트들
const page = (events, extra = {}) => ({ v: visit, p: '/', ...extra, e: events });

// 1. 검사 거부
async function checkRejections() {
  const cases = [
    { label: 'JSON 아님', raw: 'not json', status: 400, reason: 'json' },
    { label: '방문 ID', body: { ...page([okView]), v: 'short' }, status: 400, reason: 'visit' },
    { label: '빈 이벤트', body: page([]), status: 400, reason: 'events' },
    { label: '경로 없음', body: { v: visit, e: [okView] }, status: 400, reason: 'path' },
    { label: '상대 경로', body: page([okView], { p: 'blog' }), status: 400, reason: 'path' },
    { label: '경로 공백', body: page([okView], { p: '/a b' }), status: 400, reason: 'path' },
    { label: '글 ID 형식', body: page([okView], { i: '../x' }), status: 400, reason: 'entry' },
    { label: '종류', body: page([{ ...okView, t: 'click' }]), status: 400, reason: 'event:0:type' },
    { label: '순서 0', body: page([{ ...okView, s: 0 }]), status: 400, reason: 'event:0:seq' },
    {
      label: '방문당 상한',
      body: page([{ ...okView, s: MAX_EVENTS_PER_VISIT + 1 }]),
      status: 400,
      reason: 'event:0:seq',
    },
    { label: 'view 2개', body: page([okView, { ...okView, s: 2 }]), status: 400, reason: 'views' },
    {
      label: '순서 거꾸로',
      body: page([
        { t: 'pdf', s: 3 },
        { t: 'pdf', s: 2 },
      ]),
      status: 400,
      reason: 'order',
    },
    {
      label: 'read 글 페이지 아님',
      body: page([{ t: 'read', s: 1, d: 75 }]),
      status: 400,
      reason: 'event:0:entry',
    },
    {
      label: 'read 깊이',
      body: page([{ t: 'read', s: 1, d: 50 }], { i: 'a' }),
      status: 400,
      reason: 'event:0:depth',
    },
    {
      label: 'out 주소 없음',
      body: page([{ t: 'out', s: 1 }]),
      status: 400,
      reason: 'event:0:url',
    },
    {
      label: 'search 글자 아님',
      body: page([{ t: 'search', s: 1, q: 42, c: 0 }]),
      status: 400,
      reason: 'event:0:term',
    },
    {
      label: '이벤트 수',
      body: page(
        Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, (_, index) => ({
          ...okView,
          s: index + 1,
        })),
      ),
      status: 400,
      reason: 'events',
    },
  ];
  for (const item of cases) {
    const res = await track(item.body, item.raw ? { raw: item.raw } : {});
    check(res.status === item.status, `거부 ${item.label}: ${item.status} (${res.status})`);
    check(
      res.json?.error?.details?.reason === item.reason,
      `거부 ${item.label}: 이유 ${item.reason} (${res.json?.error?.details?.reason})`,
    );
  }
  const big = await track(null, {
    raw: JSON.stringify({ ...page([okView]), pad: 'x'.repeat(MAX_TRACK_BODY_BYTES) }),
  });
  check(big.status === 413, `거부 크기: 413 (${big.status})`);
  // 드문 실제 값은 받는다: 짧아지는 검색어·읽지 못하는 바깥 링크는 그 이벤트만 버리고, 이상한 hostname은 (other), //로 시작하는 경로
  const emoji = await track(page([{ t: 'search', s: 1, q: '😀', c: 0 }], { p: '/blog' }));
  check(emoji.status === 204, `짧아지는 검색어: 204 (${emoji.status})`);
  const badOut = await track(page([{ t: 'out', s: 1, u: 'javascript:alert(1)' }]));
  check(badOut.status === 204, `읽지 못하는 바깥 링크: 204 (${badOut.status})`);
  const oddRef = await track(page([{ ...okView, r: 'my_host.example.com.' }], { p: '//x' }));
  check(oddRef.status === 204, `밑줄·끝 점 hostname, //경로: 204 (${oddRef.status})`);
  const evil = await track(page([okView]), { origin: 'https://evil.example' });
  check(evil.status === 403, `거부 다른 사이트 Origin: 403 (${evil.status})`);
  // 처리기의 Origin 검사(Astro checkOrigin이 보지 않는 형식)
  const evilJson = await track(page([okView]), {
    origin: 'https://evil.example',
    contentType: 'application/json',
  });
  check(
    evilJson.status === 403 && evilJson.json?.error?.code === 'ORIGIN_MISMATCH',
    `거부 다른 사이트 Origin(JSON): 403 ORIGIN_MISMATCH (${evilJson.status})`,
  );
  const get = await fetch(`${BASE}/api/track`);
  check(get.status === 405, `GET /api/track: 405 (${get.status})`);
}

// 2. 운영 호스트가 아니면 저장 안 함
async function checkNotStored() {
  const before = await Promise.all([countCollection(READER_EVENTS), countCollection(READER_DAILY)]);
  const plain = await track(page([okView, { t: 'pdf', s: 2 }], { p: '/about' }));
  check(plain.status === 204, `보통 방문: 204 (${plain.status})`);
  // Origin 없는 요청: 처리기는 받는다(JSON). text/plain이면 빌드 결과에서 Astro checkOrigin이 403을 줄 수 있다. 어느 쪽이든 저장하지 않는다
  const noOrigin = await track(page([{ ...okView, s: 3 }]), {
    origin: null,
    contentType: 'application/json',
  });
  check(noOrigin.status === 204, `Origin 없음(JSON): 204 (${noOrigin.status})`);
  const noOriginText = await track(page([{ ...okView, s: 3 }]), { origin: null });
  check(
    [204, 403].includes(noOriginText.status),
    `Origin 없음(text/plain): 204 또는 403 (${noOriginText.status})`,
  );
  // 주소만 운영처럼 보이게 해도(X-Forwarded-Host + 그 Origin) Host 헤더가 localhost라 저장하지 않는다
  const forwarded = await track(page([{ ...okView, s: 4 }]), {
    origin: 'https://www.cruzlab.dev',
    headers: { 'X-Forwarded-Host': 'www.cruzlab.dev', 'X-Forwarded-Proto': 'https' },
  });
  // 빌드 결과는 X-Forwarded-Host를 요청 주소에 쓴다 → Origin이 맞아 처리기까지 와서 Host 헤더 검사로 건너뛴다(204).
  // 개발 서버는 쓰지 않는다 → 요청 주소가 localhost라 처리기의 Origin 검사가 403. 두 경우 모두 아래 수 세기로 저장 안 함을 본다
  check(
    forwarded.status === 204 ||
      (forwarded.status === 403 && forwarded.json?.error?.code === 'ORIGIN_MISMATCH'),
    `X-Forwarded-Host 운영: 204 또는 403 (${forwarded.status} ${JSON.stringify(forwarded.json)})`,
  );
  // 로봇은 시험 표지 방문이어도 저장하지 않는다
  const bot = await track({ ...page([okView]), v: VISIT.bot }, { userAgent: BOT_UA });
  check(bot.status === 204, `로봇: 204 (${bot.status})`);
  const after = await Promise.all([countCollection(READER_EVENTS), countCollection(READER_DAILY)]);
  check(after[0] === before[0], `운영 아님: readerEvents가 늘었다 (${before[0]} → ${after[0]})`);
  check(after[1] === before[1], `운영 아님: readerDaily가 늘었다 (${before[1]} → ${after[1]})`);
  check((await eventsOfVisit(VISIT.bot)).length === 0, '로봇 방문의 원본 줄이 있다');
}

// 3. 시험 방문 저장과 요약 증가
async function checkStored(a, b) {
  const pathA = a.path;
  const pathB = b.path;
  // 요청 하나 = 한 페이지(p, i)의 이벤트들(브라우저 수집 스크립트와 같은 모양)
  const one = [
    { p: pathA, i: a.id, e: [{ t: 'view', s: 1, r: TEST_REF, n: 1 }] },
    {
      p: pathA,
      i: a.id,
      e: [
        { t: 'read', s: 2, d: 75 },
        { t: 'read', s: 3, d: 100 },
        { t: 'out', s: 4, u: `https://www.${TEST_REF}/stage5?x=1` },
        { t: 'copy', s: 5, k: 0 },
      ],
    },
    { p: pathB, i: b.id, e: [{ t: 'view', s: 6, r: pathA, b: a.id, n: 1 }] },
    { p: '/blog', e: [{ t: 'search', s: 7, q: TEST_TERM, c: 0 }] },
    // 모르는 글 ID: 발행 글 메모 목록에 없으므로 read는 빠진다
    { p: pathB, i: 'stage5-test-unknown-entry', e: [{ t: 'read', s: 8, d: 75 }] },
    { p: TEST_MISSING, e: [{ t: '404', s: 9, r: pathB, b: b.id }] },
    { p: '/about', e: [{ t: 'pdf', s: 10 }] },
    // 글이 아닌 페이지(노트 목록)의 코드 복사: 사이트 수로만 센다(리뷰 S1)
    { p: '/notes', e: [{ t: 'copy', s: 11, k: 0 }] },
  ];
  const two = [{ p: pathB, i: b.id, e: [{ t: 'view', s: 1, r: '', n: 1 }] }];

  // 기대값: 모르는 글 ID의 요청(read)은 더하지 않는다. 204를 받은 요청만 written에 더한다(정리 때 뺀다)
  const expected = {};
  const sendAll = async (visitId, requests, label) => {
    for (const request of requests) {
      const res = await track({ v: visitId, ...request });
      check(res.status === 204, `${label}: 204 (${res.status} ${JSON.stringify(res.json)})`);
      if (res.status !== 204 || request.i?.startsWith('stage5-test-')) continue;
      const tree = dailyIncrementsOf(parsed(visitId, request));
      addTrees(expected, tree);
      addTrees(written, tree);
    }
  };
  await sendAll(VISIT.one, one, '시험 방문 1');
  await sendAll(VISIT.two, two, '시험 방문 2');

  const dailySnap = await db.collection(READER_DAILY).doc(today).get();
  check(dailySnap.exists, `readerDaily/${today}가 없다`);
  const actual = summaryPart(dailySnap.data());
  check(
    sameTree(actual, expected),
    `요약이 기대값과 다르다\n  기대 ${JSON.stringify(sortKeys(expected))}\n  실제 ${JSON.stringify(sortKeys(actual))}`,
  );
  check(dailySnap.get('day') === today, 'readerDaily day 칸');
  // 점·빗금이 있는 key가 글자 그대로 들어갔다(set merge의 중첩 객체)
  check(actual.refs?.[TEST_REF] === 1, `요약 refs['${TEST_REF}'] = 1`);
  check(actual.notFound?.[TEST_MISSING]?.refs?.[pathB] === 1, '요약 notFound 경로 key');
  check(actual.entries?.[a.id]?.next?.[b.id] === 1, '요약 A → B 이동');

  const rawOne = await eventsOfVisit(VISIT.one);
  const rawTwo = await eventsOfVisit(VISIT.two);
  check(rawOne.length === 10, `시험 방문 1 원본 줄 10개 (${rawOne.length})`);
  check(rawTwo.length === 1, `시험 방문 2 원본 줄 1개 (${rawTwo.length})`);
  const allowed = new Set(['day', 'visit', 'seq', 'type', 'path', 'entryId', 'ref', 'meta', 'at']);
  check(
    [...rawOne, ...rawTwo].every((row) => Object.keys(row).every((key) => allowed.has(key))),
    '원본 줄에 정한 칸 밖의 값이 있다(IP·UA 등)',
  );
  check(
    rawOne.every((row) => row.day === today && row.at),
    '원본 줄 day·at',
  );
  const firstView = rawOne[0];
  check(
    firstView?.type === 'view' &&
      firstView.entryId === a.id &&
      firstView.ref === TEST_REF &&
      firstView.meta?.first === true,
    `원본 줄 첫 view (${JSON.stringify(firstView)})`,
  );
  const out = rawOne.find((row) => row.type === 'out');
  check(
    out?.meta?.domain === TEST_REF && out.meta.url.startsWith('https://www.'),
    `원본 줄 out 도메인 (${JSON.stringify(out?.meta)})`,
  );
  const secondView = rawOne.find((row) => row.seq === 6);
  check(
    secondView?.ref === pathA && secondView.meta?.prev === a.id,
    '원본 줄 둘째 view의 들어온 곳·앞 글',
  );
  check(!rawOne.some((row) => row.seq === 8), '모르는 글 ID의 read가 저장됐다');
  const notesCopy = rawOne.find((row) => row.seq === 11);
  check(
    notesCopy?.type === 'copy' && notesCopy.path === '/notes' && !notesCopy.entryId,
    `노트 목록 복사 원본 줄 (${JSON.stringify(notesCopy)})`,
  );
  check(rawTwo[0]?.ref === '(direct)', '시험 방문 2 들어온 곳 (direct)');
}

// 4. 관리자 독자 API와 목록 readers30
async function checkAdminApi(a, b) {
  const noCookie = await api('GET', '/api/admin/readers', { cookie: false });
  check(noCookie.status === 401, `쿠키 없는 독자 API: 401 (${noCookie.status})`);
  const badDays = await api('GET', '/api/admin/readers?days=7');
  check(badDays.status === 400, `days=7: 400 (${badDays.status})`);
  const badId = await api('GET', '/api/admin/readers/a.b');
  check(badId.status === 400, `틀린 글 ID: 400 (${badId.status})`);

  const site90 = await api('GET', '/api/admin/readers?days=90');
  check(
    site90.status === 200 && site90.json?.summary?.daily?.length === 90,
    `90일: 막대 90칸 (${site90.json?.summary?.daily?.length})`,
  );
  const site = await api('GET', '/api/admin/readers');
  check(site.status === 200, `독자 API: 200 (${site.status})`);
  const summary = site.json?.summary;
  check(
    site.json?.days === 30 && summary?.daily?.length === 30 && site.json?.today === today,
    '기본 30일, 오늘 날짜',
  );
  check(
    summary?.daily?.at(-1)?.visits === 2 && summary.daily.at(-1).views === 3,
    `오늘 막대: 방문 2·조회 3 (${JSON.stringify(summary?.daily?.at(-1))})`,
  );
  check(
    summary?.totals?.pdf === 1 && summary.totals.out === 1 && summary.totals.copy === 2,
    `합계 PDF·바깥 링크·복사(글 1 + 노트 목록 1) (${JSON.stringify(summary?.totals)})`,
  );
  const entryA = summary?.entries?.find((item) => item.id === a.id);
  const entryB = summary?.entries?.find((item) => item.id === b.id);
  check(
    entryA?.visits === 1 && entryB?.visits === 2 && summary.entries[0].id === b.id,
    `많이 읽힌 글: B 2 > A 1 (${JSON.stringify(summary?.entries)})`,
  );
  check(
    summary?.refs?.some((ref) => ref.key === TEST_REF && ref.count === 1),
    '들어온 곳: 시험 도메인',
  );
  check(
    summary?.refs?.some((ref) => ref.key === '(direct)' && ref.count === 1),
    '들어온 곳: (direct)',
  );
  check(
    summary?.searches?.[0]?.term === TEST_TERM.toLowerCase() && summary.searches[0].zero === 1,
    `검색어: 0건 먼저 (${JSON.stringify(summary?.searches?.[0])})`,
  );
  const missing = summary?.notFound?.find((item) => item.path === TEST_MISSING);
  check(
    missing?.count === 1 && missing.refs[0]?.key === b.path,
    `없는 주소와 들어온 곳 (${JSON.stringify(missing)})`,
  );

  const readersA = await api('GET', `/api/admin/readers/${encodeURIComponent(a.id)}`);
  check(readersA.status === 200, `글 A 독자 API: 200 (${readersA.status})`);
  const totalsA = readersA.json?.summary?.totals;
  check(
    totalsA?.views === 1 &&
      totalsA.visits === 1 &&
      totalsA.read75 === 1 &&
      totalsA.read100 === 1 &&
      totalsA.out === 1 &&
      totalsA.copy === 1 &&
      totalsA.onward === 1,
    `글 A 합계 (${JSON.stringify(totalsA)})`,
  );
  check(readersA.json?.summary?.next?.[0]?.key === b.id, '글 A 다음 글 = B');
  check(readersA.json?.summary?.refs?.[0]?.key === TEST_REF, '글 A 들어온 곳 = 시험 도메인');
  const pathOne = readersA.json?.paths?.find((path) => path.steps.length === 10);
  check(
    Boolean(pathOne),
    `글 A 경로 예: 방문 1의 10걸음 (${JSON.stringify(readersA.json?.paths?.map((path) => path.steps.length))})`,
  );
  check(
    pathOne?.steps.map((step) => step.type).join(',') ===
      'view,read,read,out,copy,view,search,404,pdf,copy' &&
      pathOne.steps[0].ref === TEST_REF &&
      pathOne.steps[3].domain === TEST_REF &&
      pathOne.day === today,
    `경로 예 순서 (${pathOne?.steps.map((step) => step.type).join(',')})`,
  );

  const readersB = await api('GET', `/api/admin/readers/${encodeURIComponent(b.id)}`);
  const summaryB = readersB.json?.summary;
  check(
    summaryB?.totals?.visits === 2 && summaryB.totals.views === 2 && summaryB.totals.onward === 1,
    `글 B 합계 (${JSON.stringify(summaryB?.totals)})`,
  );
  check(summaryB?.prev?.[0]?.key === a.id, '글 B 전 글 = A');
  check(
    summaryB?.refs?.some((ref) => ref.key === a.path) &&
      summaryB.refs.some((ref) => ref.key === '(direct)'),
    `글 B 들어온 곳: A 경로·(direct) (${JSON.stringify(summaryB?.refs)})`,
  );
  check(readersB.json?.paths?.length === 2, `글 B 경로 예 2개 (${readersB.json?.paths?.length})`);

  const list = await api('GET', '/api/admin/posts');
  const items = list.json?.items ?? [];
  check(items.find((item) => item.id === a.id)?.readers30 === 1, '목록 readers30: A = 1');
  check(items.find((item) => item.id === b.id)?.readers30 === 2, '목록 readers30: B = 2');
  check(
    items.every((item) => Number.isInteger(item.readers30) && item.readers30 >= 0),
    '목록 readers30은 0 이상 정수',
  );
}

// 5. 90일 정리
async function checkPrune() {
  const oldRef = db.collection(READER_EVENTS).doc();
  const keepRef = db.collection(READER_EVENTS).doc();
  const row = (visitId, day) => ({
    day,
    visit: visitId,
    seq: 1,
    type: 'pdf',
    path: '/about',
    at: FieldValue.serverTimestamp(),
  });
  await oldRef.set(row(VISIT.old, shiftDay(today, -90)));
  await keepRef.set(row(VISIT.keep, shiftDay(today, -89)));
  const res = await api('GET', '/api/admin/readers');
  check(res.status === 200 && res.json?.pruned >= 1, `정리: pruned ≥ 1 (${res.json?.pruned})`);
  check(!(await oldRef.get()).exists, '정리: 오늘 − 90일 줄이 남았다');
  check((await keepRef.get()).exists, '정리: 오늘 − 89일 줄을 지웠다');
}

// 정리: 시험 표지 줄과 이 실행이 만든 readerDaily 문서
// 더할 수 나무 → [필드 경로 조각, 수] 목록
function leavesOf(tree, prefix = []) {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'number' ? [[[...prefix, key], value]] : leavesOf(value, [...prefix, key]),
  );
}

// 오늘 요약 문서에서 이 실행이 더한 수를 빼고, 0이 된 칸·빈 맵을 지운다. 수가 남지 않으면 문서를 지운다
// - 실제 수는 늘 양수다(increment로만 더한다). 그래서 0인 칸은 이 실행이 남긴 칸이다.
async function subtractWritten() {
  const ref = db.collection(READER_DAILY).doc(today);
  const leaves = leavesOf(written);
  if (leaves.length > 0 && (await ref.get()).exists) {
    const args = leaves.flatMap(([segments, value]) => [
      new FieldPath(...segments),
      FieldValue.increment(-value),
    ]);
    await ref.update(...args);
  }
  const snap = await ref.get();
  if (!snap.exists) return;
  const zeros = [];
  let positive = 0;
  const walk = (value, segments) => {
    if (typeof value === 'number') {
      if (value === 0) zeros.push(segments);
      else positive += 1;
      return;
    }
    if (
      value &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      typeof value.toDate !== 'function'
    ) {
      const keys = Object.keys(value);
      if (keys.length === 0 && segments.length > 0) zeros.push(segments);
      for (const key of keys) walk(value[key], [...segments, key]);
    }
  };
  const data = snap.data();
  for (const [key, value] of Object.entries(data))
    if (key !== 'day' && key !== 'updatedAt') walk(value, [key]);
  if (positive === 0) {
    await ref.delete();
    return;
  }
  if (zeros.length > 0)
    await ref.update(
      ...zeros.flatMap((segments) => [new FieldPath(...segments), FieldValue.delete()]),
    );
  for (const key of Object.keys(written)) delete written[key];
}

async function cleanup() {
  try {
    const docs = await withRetry('시험 줄 찾기', testEventDocs);
    for (let index = 0; index < docs.length; index += 400) {
      const batch = db.batch();
      for (const docSnap of docs.slice(index, index + 400)) batch.delete(docSnap.ref);
      await withRetry('시험 줄 지우기', () => batch.commit());
    }
    await withRetry('요약 문서에서 시험 수 빼기', subtractWritten);
    const left = await testEventDocs();
    check(left.length === 0, `정리 뒤 시험 줄 ${left.length}개`);
  } catch (error) {
    failures.push(`정리 실패: ${error instanceof Error ? error.message : error}`);
  }
}

async function main() {
  // 이전 실행이 남긴 시험 줄을 먼저 지운다
  const leftovers = await testEventDocs();
  if (leftovers.length > 0) {
    console.log(`이전 실행의 시험 줄 ${leftovers.length}개를 지운다`);
    const batch = db.batch();
    for (const docSnap of leftovers) batch.delete(docSnap.ref);
    await batch.commit();
  }
  dailyExistedAtStart = (await db.collection(READER_DAILY).doc(today).get()).exists;
  const startCounts = {
    events: await countCollection(READER_EVENTS),
    daily: await countCollection(READER_DAILY),
  };
  console.log(
    `시작: readerEvents ${startCounts.events}, readerDaily ${startCounts.daily}, 오늘(${today}) 문서 ${dailyExistedAtStart ? '있음' : '없음'}`,
  );

  // 시험에 쓸 발행 글 2편(최신 글). 글 문서는 읽기만 한다
  const published = await db
    .collection(ENTRIES)
    .where('status', '==', 'published')
    .where('kind', '==', 'post')
    .get();
  const posts = published.docs
    .map((docSnap) => ({
      id: docSnap.id,
      slug: docSnap.get('published.slug'),
      at: docSnap.get('publishedAt')?.toMillis?.() ?? 0,
    }))
    .filter((post) => typeof post.slug === 'string')
    .sort((x, y) => y.at - x.at)
    .slice(0, 2)
    .map((post) => ({ ...post, path: encodeURI(`/blog/${post.slug}`) }));
  if (posts.length < 2) throw new Error('발행 글이 2편 넘게 있어야 한다');
  const [a, b] = posts;

  // Ctrl+C: 다음 요청부터 멈춘다. main의 finally가 정리한다(정리와 요청이 겹치지 않게)
  process.once('SIGINT', () => {
    console.log('\n멈춤: 요청을 멈추고 시험 데이터를 지운다');
    interrupted = true;
  });
  // 서울 자정 5분 안이면 저장 시험을 하지 않는다(시험 수가 두 날에 나뉘면 뺄 날을 알 수 없다)
  const minutesOfDay = Math.floor(((Date.now() + 9 * 3600_000) % 86_400_000) / 60_000);
  const nearMidnight = minutesOfDay < 5 || minutesOfDay >= 24 * 60 - 5;

  try {
    await checkRejections();
    await checkNotStored();
    if (dailyExistedAtStart || nearMidnight) {
      console.log(
        `건너뜀: ${dailyExistedAtStart ? `readerDaily/${today}가 이미 있다(실제 데이터일 수 있다)` : '서울 자정 5분 안이다'}. 저장·관리자 API·정리 시험(3~5)을 하지 않는다.`,
      );
    } else {
      await signIn();
      await checkStored(a, b);
      await checkAdminApi(a, b);
      await checkPrune();
    }
  } finally {
    await cleanup();
  }

  const endCounts = {
    events: await countCollection(READER_EVENTS),
    daily: await countCollection(READER_DAILY),
  };
  check(
    endCounts.events === startCounts.events,
    `끝: readerEvents ${startCounts.events} → ${endCounts.events}`,
  );
  check(
    endCounts.daily === startCounts.daily,
    `끝: readerDaily ${startCounts.daily} → ${endCounts.daily}`,
  );
  console.log(`끝: readerEvents ${endCounts.events}, readerDaily ${endCounts.daily}`);
}

try {
  await main();
} catch (error) {
  failures.push(`중단: ${error instanceof Error ? error.stack : error}`);
}

console.log(`\n${checks - failures.length}/${checks} 통과`);
for (const failure of failures) console.log(`  ✗ ${failure}`);
process.exitCode = failures.length > 0 ? 1 : 0;
