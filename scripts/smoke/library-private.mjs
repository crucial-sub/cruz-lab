// 서가 비공개·격리 자동 점검 smoke:library (서가 1단계 T10, Plan 8.1의 2·3·4, 11절 1·2)
//
// 실행 (저장소 루트에서):
//   pnpm smoke:library [--base http://localhost:4341] [--raw <문서 출처>] [--expect on|off|share-off] [--with-docs] [--json <파일>]
//
// - 기본: 로그아웃 요청만 보낸다. 데이터를 만들지 않는다. 위조 값과 없는 문서 id를 쓴다.
// - --with-docs: 관리자 세션으로 시험 문서 2개(격리 시험 문서, 다른 문서 하나)를 서가에 올린다.
//   진짜 입장권·문서 쿠키로 "다른 문서의 쿠키", "위조 쿠키", "만료 입장권"을 보고,
//   헤드리스 Chrome에 관리자 쿠키를 넣고 격리 시험 문서를 열어 결과를 읽는다(8.1 3).
//   끝에(실패해도) 시험 문서를 내리고 흔적(문서 기록, 판 기록, 버킷 파일)이 0인지 본다.
// - --expect off: 서가가 꺼진 대상(T11 전의 운영). 서가 주소가 모두 404인지 본다(8.1 4, C5).
// - 서가 2단계 T11(Plan 7.1 2·3): 공유 주소 404(없음·꼴·범위 밖·끝남·끔, 본문이 모두 같다)와 공유 머리(J49),
//   2단계 새 API(폰 저장·고정·공유)의 로그아웃 401·다른 출처 403, 토큰 API 401, 관리자 쿠키 이름(J54).
//   --with-docs면 공유 셋(문서 html 1일, 폴더 7일, 프로젝트 끌 때까지)을 만들어 로그아웃으로 열고, 끈 뒤 1분 안에
//   공유 주소·공유 쿠키가 막히는지 본다. 끝에 공유 기록을 지우고 흔적 0을 본다.
// - --expect share-off: 서가는 켜지고 공유 스위치가 꺼진 대상(PR-C 병합 뒤 운영). /s/**가 404이고, --with-docs면 공유 API가 404다.
// - 미리보기(Vercel 보호)는 .env의 VERCEL_AUTOMATION_BYPASS_SECRET이 있어야 닿는다(library-lib.mjs).
// - 만료 문서 쿠키는 입장권 비밀값으로 서명해야 만들 수 있다. .env의 LIBRARY_TICKET_SECRET이 대상과 같을 때만 본다
//   (진짜 쿠키가 통하는지 먼저 보고 판정한다). 다르면 건너뛴다(만료 판정은 pnpm test의 ticket 테스트가 본다).
// - 비밀값은 출력하지 않는다.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { planPush } from '../../src/library/client/push.ts';
import { createDocCookie, createTicket, DOC_COOKIE_NAME, SHARE_COOKIE_NAME } from '../../src/library/ticket.ts';
import { initAdmin, parseArgs } from '../migrate/lib/admin.mjs';
import {
  adminApi,
  adminCookieFor,
  assertReachable,
  bodyOf,
  Checks,
  createAdminSessionDetailed,
  digest,
  docRemnants,
  launchChrome,
  makeTargetFetch,
  readKeychainToken,
  removeSmokeDoc,
  resolveTargets,
  SMOKE_PROJECT,
  stripVercelInjection,
  uploadSmokeDoc,
} from './library-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ISOLATION_DIR = path.join(SCRIPT_DIR, 'library-isolation');
const args = parseArgs();
const targets = resolveTargets(args);
const expectOff = args.expect === 'off';
// 서가는 켜지고 공유 스위치만 꺼진 대상 (서가 2단계 J50: PR-C 병합 뒤 운영, T12 전)
const shareOff = args.expect === 'share-off';
const withDocs = Boolean(args['with-docs']);
const tfetch = makeTargetFetch(targets);
const checks = new Checks();
const runId = new Date().toISOString().replace(/\D/g, '').slice(2, 14);

// 없는 문서 id (꼴은 맞다: 영문·숫자 20자)
const FAKE_ID = 'smokeNoSuchDoc000000';
const ZERO_ID = '00000000000000000000';

const get = (url, init = {}) => tfetch(url, init);

// 다른 출처가 응답을 읽을 수 없는가 (CORS 허용 머리가 없다)
// - 로컬 개발 서버: Vite 6의 server.cors 기본값이 *.localhost 출처에 Access-Control-Allow-Origin을 되돌려 준다
//   (node_modules/vite defaultAllowedOrigins). 앱 코드가 아니고 배포에는 없다. 그래서 로컬에서는
//   Access-Control-Allow-Credentials가 없는지만 본다(쿠키를 실은 응답은 여전히 읽지 못한다).
const noAcao = (response) =>
  targets.local
    ? !response.headers.get('access-control-allow-credentials')
    : !response.headers.get('access-control-allow-origin') && !response.headers.get('access-control-allow-credentials');
const acaoNote = (response) =>
  response.headers.get('access-control-allow-origin') ? `, ACAO ${response.headers.get('access-control-allow-origin')}${targets.local ? '(Vite 개발 서버)' : ''}` : '';

// ───────────── 문서 출처 404 (J5) ─────────────

// 문서 출처 404 하나를 본다: 상태, 머리(J11), 본문, "서가에서 다시 열기" 주소
// - 본문 지문을 모아 "모든 경로에서 같다"를 마지막에 본다
const notFoundDigests = [];
async function expectRawNotFound(name, url, init = {}) {
  const response = await get(url, init);
  const body = stripVercelInjection(await bodyOf(response));
  const problems = [];
  if (response.status !== 404) problems.push(`상태 ${response.status}`);
  if (!(response.headers.get('content-type') ?? '').startsWith('text/html')) problems.push(`형식 ${response.headers.get('content-type')}`);
  if (response.headers.get('x-robots-tag') !== 'noindex') problems.push('X-Robots-Tag 없음');
  if (response.headers.get('referrer-policy') !== 'no-referrer') problems.push('Referrer-Policy 없음');
  if (!(response.headers.get('cache-control') ?? '').includes('no-store')) problems.push(`Cache-Control ${response.headers.get('cache-control')}`);
  if (response.headers.get('set-cookie')) problems.push('Set-Cookie 있음');
  if (!body.includes(`href="${targets.base}/admin/library"`)) problems.push('"서가에서 다시 열기"가 블로그 서가로 가지 않는다');
  notFoundDigests.push({ name, digest: digest(body) });
  checks.check('문서 출처 404 (J5)', name, problems.length === 0, problems.join(', ') || `404, 본문 ${digest(body)}`);
}

// Astro 출처 검사(배포 빌드의 node_modules/astro/dist/core/app/middlewares.js)가 준 403인가
// - GET·HEAD·OPTIONS가 아닌 요청에서 Origin이 다르고, 형식이 양식형(text/plain 등)이거나 없으면 우리 미들웨어보다 먼저 막는다.
// - 개발 서버에는 이 층이 없다(로컬에서는 미들웨어의 ORIGIN_MISMATCH나 J5가 바로 보인다)
const ASTRO_ORIGIN_CHECK = /^Cross-site [A-Z]+ form submissions are forbidden$/;

// 문서 출처의 쓰기 요청 하나: J5 404 또는 Astro 출처 검사 403이면 거절이다.
// 응답이 경로(문서가 있는지)와 상관없이 같아야 한다 → 지문을 모아 마지막에 본다
const writeDigests = [];
async function expectRawWriteRejected(name, url, init) {
  const response = await get(url, init);
  const body = stripVercelInjection(await bodyOf(response));
  const layer = response.status === 403 && ASTRO_ORIGIN_CHECK.test(body.trim()) ? 'Astro 출처 검사 403' : response.status === 404 && body.includes('서가에서 다시 열기') ? 'J5 404' : '';
  writeDigests.push({ name, digest: `${response.status}:${digest(body)}` });
  checks.check('문서 출처 쓰기 요청', `${name} → 거절`, Boolean(layer) && !response.headers.get('set-cookie'), layer || `${response.status} ${body.slice(0, 60)}`);
}

// ───────────── 로그아웃 점검 (서가 켜짐) ─────────────

async function checkLibraryPagesLoggedOut(docs) {
  const group = '서가 화면 (로그아웃)';
  const pages = [
    ['/admin/library', '/admin/library'],
    [`/admin/library/d/${FAKE_ID}`, '없는 문서 주소'],
    ...docs.map((doc) => [`/admin/library/d/${doc.id}`, `시험 문서 주소 (${doc.label})`]),
  ];
  for (const [pathname, label] of pages) {
    const response = await get(`${targets.base}${pathname}`);
    const location = response.headers.get('location') ?? '';
    const body = await response.text();
    const leaked = docs.some((doc) => body.includes(doc.title));
    checks.check(
      group,
      `${label} → 로그인 302, 본문 없음`,
      response.status === 302 && location.startsWith(`/admin/login?next=${encodeURIComponent(pathname)}`) && body.length === 0 && !leaked,
      `${response.status} → ${location || '(없음)'}, 본문 ${body.length}바이트`,
    );
  }
}

async function checkRawLoggedOut() {
  const raw = targets.raw;
  await expectRawNotFound('/ (블로그 첫 화면 경로)', `${raw}/`);
  await expectRawNotFound('/admin (관리자 경로)', `${raw}/admin`);
  await expectRawNotFound('/admin/library', `${raw}/admin/library`);
  await expectRawNotFound('쿠키 없음: /d/{없는 id}/index.html', `${raw}/d/${FAKE_ID}/index.html`);
  await expectRawNotFound('쿠키 없음: /d/{없는 id}/', `${raw}/d/${FAKE_ID}/`);
  await expectRawNotFound('위조 쿠키: /d/{없는 id}/index.html', `${raw}/d/${FAKE_ID}/index.html`, {
    headers: { Cookie: `${DOC_COOKIE_NAME}=${FAKE_ID}.9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` },
  });
  await expectRawNotFound('경로 우회: /d/%2e%2e/admin', `${raw}/d/%2e%2e/admin`);
  await expectRawWriteRejected('POST text/plain /d/{없는 id}/index.html', `${raw}/d/${FAKE_ID}/index.html`, { method: 'POST', body: 'x' });
  await expectRawWriteRejected('POST JSON /d/{없는 id}/index.html', `${raw}/d/${FAKE_ID}/index.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  await expectRawWriteRejected('DELETE /d/{없는 id}/index.html', `${raw}/d/${FAKE_ID}/index.html`, { method: 'DELETE' });
  await expectRawNotFound('입장권 없음: /d/_open', `${raw}/d/_open`);
  await expectRawNotFound('위조 입장권: /d/_open?t=…', `${raw}/d/_open?t=${FAKE_ID}.9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`);
  await expectRawNotFound('깨진 입장권: /d/_open?t=abc', `${raw}/d/_open?t=abc`);
}

async function checkBlogDocPaths(docs) {
  const group = '블로그 출처의 문서 경로';
  const paths = [`/d/${FAKE_ID}/index.html`, '/d/_open?t=abc', ...docs.map((doc) => `/d/${doc.id}/index.html`)];
  for (const pathname of paths) {
    const cookie = docs.find((doc) => pathname.includes(doc.id))?.cookie;
    const response = await get(`${targets.base}${pathname}`, cookie ? { headers: { Cookie: `${DOC_COOKIE_NAME}=${cookie}` } } : {});
    const body = await bodyOf(response);
    const leaked = docs.some((doc) => body.includes(doc.title));
    checks.check(group, `${pathname}${cookie ? ' (문서 쿠키 실음)' : ''} → 404`, response.status === 404 && !leaked, `${response.status}`);
  }
}

async function checkTokenPaths() {
  const group = '서가 토큰 경로';
  const wrong = `wrong-${'x'.repeat(40)}`;
  const cases = [
    ['토큰 없음: GET /api/library/token/docs', '/api/library/token/docs', {}],
    ['틀린 토큰: GET /api/library/token/docs', '/api/library/token/docs', { headers: { Authorization: `Bearer ${wrong}` } }],
    ['인코딩 우회 + 틀린 토큰: /api/library/%74oken/docs', '/api/library/%74oken/docs', { headers: { Authorization: `Bearer ${wrong}` } }],
  ];
  for (const [name, pathname, init] of cases) {
    const response = await get(`${targets.base}${pathname}`, init);
    const body = await bodyOf(response);
    // 인코딩한 경로는 배포 환경에서 어느 라우트에도 맞지 않아 404다(Vercel 경로 맞추기). 개발 서버는 미들웨어가 풀어 401이다
    const encoded = pathname.includes('%');
    const pass = encoded ? [401, 404].includes(response.status) && !body.includes('"docs"') : response.status === 401;
    checks.check(group, `${name} → ${encoded ? '401/404' : '401'}`, pass, `${response.status} ${body.slice(0, 60)}`);
  }

  // 서가 토큰으로 블로그 관리 API를 부르지 못한다 (J16). 키체인 토큰이 없으면 틀린 토큰으로 본다
  const token = readKeychainToken();
  const label = token ? '키체인 서가 토큰' : '틀린 토큰(키체인 토큰 없음)';
  const bearer = { Authorization: `Bearer ${token ?? wrong}` };
  const posts = await get(`${targets.base}/api/admin/posts`, { headers: bearer });
  await posts.arrayBuffer();
  checks.check(group, `${label}으로 GET /api/admin/posts → 401`, posts.status === 401, `${posts.status}`);
  const upload = await get(`${targets.base}/api/admin/library/uploads`, {
    method: 'POST',
    headers: { ...bearer, Origin: targets.base, 'Content-Type': 'application/json' },
    body: '{}',
  });
  await upload.arrayBuffer();
  checks.check(group, `${label}으로 POST /api/admin/library/uploads → 401`, upload.status === 401, `${upload.status}`);

  // 진짜 토큰이 토큰 API를 통과하는지 (위 401이 "모든 것이 401"이 아님을 보인다). 대상에 토큰 해시가 있을 때만 200이다
  if (!token) {
    checks.skip(group, '키체인 서가 토큰으로 목록 → 200', '키체인에 서가 토큰이 없다');
    return;
  }
  const list = await get(`${targets.base}/api/library/token/docs`, { headers: bearer });
  await list.arrayBuffer();
  if (list.status === 200) checks.check(group, '키체인 서가 토큰으로 목록 → 200 (대조군)', true, '200');
  else checks.skip(group, '키체인 서가 토큰으로 목록 → 200 (대조군)', `${list.status}: 대상에 LIBRARY_TOKEN_SHA256이 없거나 다른 토큰의 해시다`);
}

async function checkCrossOriginWrites() {
  const group = '문서 출처에서 온 쓰기 거절 (PR #36 리뷰 I2)';
  const origin = targets.raw;
  const cases = [
    ['POST text/plain /api/admin/library/uploads', '/api/admin/library/uploads', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '{}' }],
    ['POST JSON /api/admin/library/uploads', '/api/admin/library/uploads', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }],
    [`DELETE /api/admin/library/docs/${ZERO_ID}`, `/api/admin/library/docs/${ZERO_ID}`, { method: 'DELETE', headers: { Origin: origin } }],
    ['POST JSON /api/admin/session (세션 발급)', '/api/admin/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"idToken":"x"}' }],
  ];
  for (const [name, pathname, init] of cases) {
    const response = await get(`${targets.base}${pathname}`, init);
    const body = await bodyOf(response);
    let code = '';
    try {
      code = JSON.parse(body)?.error?.code ?? '';
    } catch {
      code = '';
    }
    // 배포 빌드에서는 Astro 출처 검사가 양식형 형식(text/plain)이나 형식 없는 요청(DELETE)을 미들웨어보다 먼저 403으로 막는다
    // (첫 벽). JSON 요청은 Astro가 보지 않아 미들웨어의 ORIGIN_MISMATCH(둘째 벽)가 막는다. 개발 서버는 둘째 벽만 있다.
    // 미들웨어의 출처 검사가 사라지면 JSON POST 줄이 실패한다(Plan 11절 2)
    const astroForm = ASTRO_ORIGIN_CHECK.test(body.trim());
    const pass = response.status === 403 && (code === 'ORIGIN_MISMATCH' || astroForm) && noAcao(response);
    checks.check(group, `${name} → 403`, pass, `${response.status} ${code || (astroForm ? 'Astro 출처 검사(첫 벽)' : body.slice(0, 40))}${acaoNote(response)}`);
  }
  const preflight = await get(`${targets.base}/api/admin/library/docs/${ZERO_ID}`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'content-type' },
  });
  await preflight.arrayBuffer();
  checks.check(
    group,
    targets.local ? '사전 요청(OPTIONS, DELETE) 응답에 Access-Control-Allow-Credentials 없음' : '사전 요청(OPTIONS, DELETE) 응답에 Access-Control-Allow-Origin 없음',
    noAcao(preflight) && (targets.local || !preflight.headers.get('access-control-allow-methods')),
    `${preflight.status}${acaoNote(preflight)}`,
  );
  if (targets.local) {
    checks.skip(group, 'Access-Control-Allow-Origin 없음', '로컬 개발 서버에서는 보지 않는다: Vite 6 server.cors 기본값이 *.localhost 출처를 되돌려 준다(배포에는 없다). 미리보기·운영에서 본다');
  }
}

async function checkIsolationTargetsLoggedOut() {
  const group = '격리 시험 문서가 부르는 주소 (로그아웃)';
  const session = await get(`${targets.base}/api/admin/session`, { headers: { Origin: targets.raw } });
  await session.arrayBuffer();
  checks.check(group, `GET /api/admin/session → 401, ${targets.local ? 'ACAC' : 'ACAO'} 없음`, session.status === 401 && noAcao(session), `${session.status}${acaoNote(session)}`);
  const library = await get(`${targets.base}/admin/library`, { headers: { Origin: targets.raw } });
  await library.arrayBuffer();
  checks.check(group, `GET /admin/library → 302, ${targets.local ? 'ACAC' : 'ACAO'} 없음`, library.status === 302 && noAcao(library), `${library.status}${acaoNote(library)}`);
}

async function checkBucketDirect(docs) {
  const group = '버킷 직접 주소';
  const bucket = typeof args.bucket === 'string' ? args.bucket : process.env.LIBRARY_BUCKET;
  if (!bucket) {
    checks.skip(group, '버킷 직접 주소 → 403/404', '.env에 LIBRARY_BUCKET이 없다(--bucket으로 줄 수 있다)');
    return;
  }
  const objects = docs.length > 0 ? docs.map((doc) => `${doc.id}/${doc.rev}/index.html`) : [`${FAKE_ID}/1/index.html`];
  for (const object of objects) {
    const plain = await fetch(`https://storage.googleapis.com/${bucket}/${object}`);
    await plain.arrayBuffer();
    checks.check(group, `storage.googleapis.com/…/${object} → 403/404`, [403, 404].includes(plain.status), `${plain.status}`);
    // 서가 버킷은 Firebase Storage에 연결하지 않았다. 그래서 400("set up properly for Firebase Storage")도 거절이다
    const firebase = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`);
    const firebaseBody = await firebase.text();
    checks.check(
      group,
      `firebasestorage …/o/${object}?alt=media → 400/403/404`,
      [400, 403, 404].includes(firebase.status) && !firebaseBody.includes('<title>'),
      `${firebase.status}${firebase.status === 400 ? ' (Firebase Storage에 연결되지 않은 버킷)' : ''}`,
    );
  }
  const listing = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?maxResults=1`);
  await listing.arrayBuffer();
  checks.check(group, '버킷 목록 API → 401/403', [401, 403].includes(listing.status), `${listing.status}`);
}

// RSS·사이트맵에 서가 주소와 제목이 없다
async function checkFeeds(docs) {
  const group = '공개 목록 (RSS·사이트맵)';
  const rawHost = new URL(targets.raw).host;
  for (const pathname of ['/rss.xml', '/sitemap-posts.xml', '/sitemap-index.xml']) {
    const response = await get(`${targets.base}${pathname}`);
    const body = await bodyOf(response);
    if (targets.local && pathname === '/sitemap-index.xml' && response.status === 404) {
      checks.skip(group, `${pathname}: 200, 서가 흔적 없음`, '개발 서버는 빌드 때 만드는 사이트맵 색인을 주지 않는다');
      continue;
    }
    const found = [];
    if (body.includes('/admin/library')) found.push('/admin/library');
    if (body.includes(rawHost)) found.push(rawHost);
    if (/https?:\/\/[^/<"\s]+\/d\//.test(body)) found.push('/d/ 주소');
    for (const doc of docs) if (body.includes(doc.title)) found.push(`제목 "${doc.title}"`);
    checks.check(group, `${pathname}: 200, 서가 흔적 없음`, response.status === 200 && found.length === 0, `${response.status}${found.length ? `, 있음: ${found.join(', ')}` : ''}`);
  }
}

// ───────────── 시험 문서 (--with-docs) ─────────────

// 시험 문서 2개를 올린다: 격리 시험 문서(폴더째), 다른 문서(작은 html)
async function prepareDocs(session, workDir) {
  const otherDir = path.join(workDir, 'other');
  await rm(otherDir, { recursive: true, force: true });
  await mkdir(otherDir, { recursive: true });
  await writeFile(
    path.join(otherDir, 'index.html'),
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>서가 점검 다른 문서 ${runId}</title></head><body><h1>서가 점검 다른 문서</h1><p>smoke:library가 올리고 바로 내린다.</p></body></html>\n`,
  );
  const plans = await planPush([ISOLATION_DIR, otherDir], { home: homedir() });
  const docs = [];
  const specs = [
    { label: '격리 시험 문서', relativePath: `isolation-${runId}.html` },
    { label: '다른 문서', relativePath: `other-${runId}.html` },
  ];
  for (const [index, plan] of plans.entries()) {
    if (!plan.ok) throw new Error(`올리기 계획 실패: ${plan.target} (${plan.error})`);
    const uploaded = await uploadSmokeDoc(targets, tfetch, session, plan.jobs[0], specs[index].relativePath);
    docs.push({ ...uploaded, label: specs[index].label });
  }
  return docs;
}

// 로그인 상태로 서가 문서 주소를 열어 입장권 → 문서 쿠키를 받는다 (J7 → J4)
async function openAsAdmin(session, doc) {
  const group = '진짜 열기 흐름 (관리자)';
  const page = await get(`${targets.base}/admin/library/d/${doc.id}`, { headers: { Cookie: `${adminCookieFor(targets)}=${session}` } });
  await page.arrayBuffer();
  const ticketUrl = page.headers.get('location') ?? '';
  const ticketOk = page.status === 302 && ticketUrl.startsWith(`${targets.raw}/d/_open?t=`);
  checks.check(group, `${doc.label}: 서가 문서 주소 → 문서 출처 입장권 302`, ticketOk, `${page.status} → ${ticketUrl.split('?')[0]}`);
  if (!ticketOk) return null;
  const issuedAt = Date.now();
  const open = await get(ticketUrl);
  await open.arrayBuffer();
  const setCookie = open.headers.get('set-cookie') ?? '';
  const value = setCookie.match(new RegExp(`${DOC_COOKIE_NAME}=([^;]+)`))?.[1] ?? '';
  const attrs = setCookie.split(';').map((part) => part.trim().toLowerCase());
  const problems = [];
  if (open.status !== 302 || open.headers.get('location') !== `/d/${doc.id}/index.html`) problems.push(`${open.status} → ${open.headers.get('location')}`);
  if (!value) problems.push('문서 쿠키 없음');
  if (!attrs.includes(`path=/d/${doc.id.toLowerCase()}/`)) problems.push('Path가 문서 경로가 아님');
  if (!attrs.includes('httponly')) problems.push('HttpOnly 없음');
  if (!attrs.includes('samesite=lax')) problems.push('SameSite=Lax 없음');
  if (!targets.local && !attrs.includes('secure')) problems.push('Secure 없음');
  if (attrs.some((part) => part.startsWith('domain='))) problems.push('Domain 있음(호스트 전용이 아님)');
  checks.check(group, `${doc.label}: 입장권 → 문서 쿠키(문서 경로, HttpOnly, SameSite=Lax${targets.local ? '' : ', Secure'}) 302`, problems.length === 0, problems.join(', ') || '통과');
  const file = await get(`${targets.raw}/d/${doc.id}/index.html`, { headers: { Cookie: `${DOC_COOKIE_NAME}=${value}` } });
  const body = await bodyOf(file);
  const headerProblems = [];
  if (file.headers.get('cache-control') !== 'private, no-cache') headerProblems.push(`Cache-Control ${file.headers.get('cache-control')}`);
  // Vercel은 압축한 응답의 ETag를 약한 꼴(W/"…")로 바꾼다. 판 번호 + 해시 꼴이면 둘 다 받는다
  const etag = file.headers.get('etag') ?? '';
  if (!/^(W\/)?"r\d+-[0-9a-f]{16}"$/.test(etag)) headerProblems.push(`ETag ${etag}`);
  for (const [name, want] of [['referrer-policy', 'no-referrer'], ['x-robots-tag', 'noindex'], ['x-content-type-options', 'nosniff']]) {
    if (file.headers.get(name) !== want) headerProblems.push(`${name} ${file.headers.get(name)}`);
  }
  checks.check(
    group,
    `${doc.label}: 문서 쿠키로 index.html → 200, J11 머리`,
    file.status === 200 && body.includes('<title>') && headerProblems.length === 0,
    `${file.status}${headerProblems.length ? `, ${headerProblems.join(', ')}` : ''}${etag.startsWith('W/') ? ', 약한 ETag(Vercel 압축)' : ''}`,
  );
  // 다시 확인 (J9): 받은 ETag를 If-None-Match로 보내면 304여야 한다. 내용을 다시 받지 않는다
  const again = await get(`${targets.raw}/d/${doc.id}/index.html`, { headers: { Cookie: `${DOC_COOKIE_NAME}=${value}`, 'If-None-Match': etag } });
  await again.arrayBuffer();
  checks.check(group, `${doc.label}: 같은 ETag로 다시 물으면 304 (J9)`, again.status === 304, `${again.status}, If-None-Match ${etag}`);
  return { cookie: value, ticketUrl, issuedAt };
}

// 진짜 쿠키로 만든 거절 사례 (다른 문서의 쿠키, 위조 쿠키, 만료 쿠키)
async function checkRealCookieCases(isolation, other) {
  const raw = targets.raw;
  await expectRawNotFound('쿠키 없음: 시험 문서 index.html', `${raw}/d/${isolation.id}/index.html`);
  await expectRawWriteRejected('POST text/plain 시험 문서 index.html (문서 쿠키 실음)', `${raw}/d/${isolation.id}/index.html`, {
    method: 'POST',
    headers: { Cookie: `${DOC_COOKIE_NAME}=${isolation.cookie}` },
    body: 'x',
  });
  await expectRawWriteRejected('POST JSON 시험 문서 index.html (문서 쿠키 실음)', `${raw}/d/${isolation.id}/index.html`, {
    method: 'POST',
    headers: { Cookie: `${DOC_COOKIE_NAME}=${isolation.cookie}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  await expectRawWriteRejected('DELETE 시험 문서 index.html (문서 쿠키 실음)', `${raw}/d/${isolation.id}/index.html`, {
    method: 'DELETE',
    headers: { Cookie: `${DOC_COOKIE_NAME}=${isolation.cookie}` },
  });
  await expectRawNotFound('다른 문서의 쿠키: 시험 문서 index.html', `${raw}/d/${isolation.id}/index.html`, {
    headers: { Cookie: `${DOC_COOKIE_NAME}=${other.cookie}` },
  });
  const forged = isolation.cookie.slice(0, -1) + (isolation.cookie.endsWith('A') ? 'B' : 'A');
  await expectRawNotFound('위조 쿠키(서명 한 글자 바꿈): 시험 문서', `${raw}/d/${isolation.id}/index.html`, {
    headers: { Cookie: `${DOC_COOKIE_NAME}=${forged}` },
  });
  const [id, exp, sig] = isolation.cookie.split('.');
  await expectRawNotFound('위조 쿠키(만료 시각을 늘림): 시험 문서', `${raw}/d/${isolation.id}/index.html`, {
    headers: { Cookie: `${DOC_COOKIE_NAME}=${id}.${Number(exp) + 3600}.${sig}` },
  });
  await expectRawNotFound('경로 우회: /d/{문서}/%2e%2e/{다른 문서}/index.html', `${raw}/d/${isolation.id}/%2e%2e/${other.id}/index.html`, {
    headers: { Cookie: `${DOC_COOKIE_NAME}=${isolation.cookie}` },
  });

  // 만료 쿠키: 로컬 .env의 입장권 비밀값이 대상과 같을 때만 서명할 수 있다
  const secret = process.env.LIBRARY_TICKET_SECRET;
  const group = '문서 출처 404 (J5)';
  if (!secret) {
    checks.skip(group, '만료 쿠키: 시험 문서', '.env에 LIBRARY_TICKET_SECRET이 없다');
    return;
  }
  const valid = createDocCookie(isolation.id, Date.now(), secret);
  const probe = await get(`${raw}/d/${isolation.id}/index.html`, { headers: { Cookie: `${DOC_COOKIE_NAME}=${valid}` } });
  await probe.arrayBuffer();
  if (probe.status !== 200) {
    checks.skip(group, '만료 쿠키: 시험 문서', `대상의 입장권 비밀값이 로컬 .env와 다르다(로컬 값으로 서명한 쿠키가 ${probe.status}). 만료 판정은 ticket 단위 테스트가 본다`);
    return;
  }
  const expired = createDocCookie(isolation.id, Date.now() - 13 * 60 * 60 * 1000, secret);
  await expectRawNotFound('만료 쿠키(12시간 지남): 시험 문서', `${raw}/d/${isolation.id}/index.html`, {
    headers: { Cookie: `${DOC_COOKIE_NAME}=${expired}` },
  });
  const expiredTicket = createTicket(isolation.id, Date.now() - 2 * 60 * 1000, secret);
  await expectRawNotFound('만료 입장권(서명, 2분 전): /d/_open', `${raw}/d/_open?t=${encodeURIComponent(expiredTicket)}`);
}

// 헤드리스 Chrome으로 격리 시험 문서를 연다 (관리자 쿠키를 넣고, 서가 문서 주소 → 문서 출처)
async function runIsolationInChrome(session, isolation) {
  const group = '격리 시험 문서 (헤드리스 Chrome, 관리자 쿠키)';
  const page = await launchChrome({ bypassSecret: tfetch.bypass ? tfetch.secret : '', bypassHosts: tfetch.hosts });
  try {
    await page.setViewport(1280);
    // 우회 쿠키를 두 호스트에 먼저 심는다 (미리보기)
    if (tfetch.bypass) {
      await page.navigate(`${targets.base}/robots.txt`);
      await page.navigate(`${targets.raw}/d/_open`);
    }
    await page.setCookie({
      name: adminCookieFor(targets),
      value: session,
      url: `${targets.base}/`,
      path: '/', // __Host- 쿠키는 Path=/여야 한다(J54)
      httpOnly: true,
      secure: !targets.local,
      sameSite: 'Lax',
    });
    // 관리자 쿠키가 실제로 통하는지 먼저 본다 (통하지 않으면 격리 시험이 뜻이 없다)
    const who = await page.navigate(`${targets.base}/api/admin/session`);
    checks.check(group, '브라우저의 관리자 쿠키가 통한다 (GET /api/admin/session 200)', who.status === 200, `${who.status}`);
    const opened = await page.navigate(`${targets.base}/admin/library/d/${isolation.id}`);
    const onRaw = opened.href.startsWith(`${targets.raw}/d/${isolation.id}/`);
    checks.check(group, '서가 문서 주소 → 문서 출처에서 열림', onRaw && opened.status === 200, `${opened.status} ${opened.href.split('?')[0]}`);
    const done = await page.waitFor(`document.title.startsWith('ISOLATION:')`, 45_000);
    if (!done) {
      checks.check(group, '격리 시험이 끝난다', false, '45초 안에 끝나지 않음');
      return;
    }
    const report = JSON.parse(await page.evaluate(`document.getElementById('isolation-results').textContent`));
    checks.check(group, `블로그 출처 판정 = ${targets.base}`, report.site === targets.base, report.site);
    for (const result of report.results) checks.check(group, result.id, result.pass, result.detail);
    checks.check(group, 'ISOLATION:PASS', report.allPass, `${report.results.filter((item) => item.pass).length}/${report.results.length}`);
  } finally {
    await page.close();
  }
}

// 만료 입장권: 진짜 입장권을 1분 넘게 둔 뒤 다시 쓴다 (비밀값 없이 볼 수 있다)
async function checkExpiredRealTicket(opened) {
  const waitMs = opened.issuedAt + 62_000 - Date.now();
  if (waitMs > 0) {
    console.log(`  (진짜 입장권이 만료되기를 ${Math.ceil(waitMs / 1000)}초 기다린다)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  await expectRawNotFound('만료 입장권(진짜 입장권, 62초 뒤): /d/_open', opened.ticketUrl);
}

// 시험 문서를 내리고 흔적을 본다
async function cleanupDocs(session, docs, workDir) {
  const group = '뒷정리';
  for (const doc of docs) {
    const status = await removeSmokeDoc(targets, tfetch, session, doc.id).catch((error) => `오류 ${error.message}`);
    checks.check(group, `${doc.label} 내리기 → 204`, status === 204, String(status));
    const remnants = await docRemnants(doc.id).catch((error) => ({ error: error.message }));
    const clean = remnants.doc === false && remnants.revisions === 0 && remnants.files === 0;
    checks.check(group, `${doc.label} 흔적 0 (문서 기록, 판 기록, 버킷 파일)`, clean, JSON.stringify(remnants));
    const after = await get(`${targets.raw}/d/${doc.id}/index.html`, doc.cookie ? { headers: { Cookie: `${DOC_COOKIE_NAME}=${doc.cookie}` } } : {});
    await after.arrayBuffer();
    checks.check(group, `${doc.label}: 내린 뒤 문서 쿠키로도 404`, after.status === 404, `${after.status}`);
  }
  await rm(workDir, { recursive: true, force: true });
}

// ───────────── 공유·고치기·관리자 쿠키 (서가 2단계 T11, Plan 7.1 2·3) ─────────────

// 없는 공유 id (꼴은 맞다: base64url 24자)
const FAKE_SHARE = 'smokeNoSuchShare00000000';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 공유 404 화면의 본문 지문: <main> 안만 본다(페이지마다 스크립트 묶음 이름이 다를 수 있다)
const shareNotFoundDigests = [];
function mainOf(html) {
  const match = html.match(/<main[\s\S]*?<\/main>/);
  return match ? match[0] : html;
}

// 공유 응답 머리 (J49)
function shareHeaderProblems(response) {
  const problems = [];
  if (response.headers.get('x-robots-tag') !== 'noindex') problems.push(`X-Robots-Tag ${response.headers.get('x-robots-tag')}`);
  if (response.headers.get('referrer-policy') !== 'no-referrer') problems.push(`Referrer-Policy ${response.headers.get('referrer-policy')}`);
  if (response.headers.get('cache-control') !== 'private, no-store') problems.push(`Cache-Control ${response.headers.get('cache-control')}`);
  return problems;
}

// 공유 주소 404 하나 (J46): 상태, 머리, 관리자 주소 없음. 본문 지문은 마지막에 모두 같은지 본다
async function expectShareNotFound(group, name, url) {
  const response = await get(url);
  const body = stripVercelInjection(await bodyOf(response));
  const problems = shareHeaderProblems(response);
  if (response.status !== 404) problems.unshift(`상태 ${response.status}`);
  if (response.headers.get('set-cookie')) problems.push('Set-Cookie 있음');
  if (body.includes('/admin')) problems.push('본문에 /admin 주소');
  if (!body.includes('열 수 없는 공유 주소입니다')) problems.push('안내 글 없음');
  shareNotFoundDigests.push({ name, digest: digest(mainOf(body)) });
  checks.check(group, `${name} → 404`, problems.length === 0, problems.join(', ') || `404, 본문 ${digest(mainOf(body))}`);
}

// 공유 주소 (로그아웃, 데이터 없음). 공유 스위치가 꺼져도 같은 404다 (J50)
async function checkSharesLoggedOut() {
  const group = shareOff ? '공유 주소 (로그아웃, 공유 꺼짐)' : '공유 주소 (로그아웃)';
  await expectShareNotFound(group, '/s/{없는 공유 id}', `${targets.base}/s/${FAKE_SHARE}`);
  await expectShareNotFound(group, '/s/{꼴이 틀린 id}', `${targets.base}/s/short`);
  await expectShareNotFound(group, '/s/{없는 공유 id}?v=html', `${targets.base}/s/${FAKE_SHARE}?v=html`);
  await expectShareNotFound(group, '/s/{없는 공유 id}/d/{없는 문서}', `${targets.base}/s/${FAKE_SHARE}/d/${FAKE_ID}`);
  await expectShareNotFound(group, '/s/{없는 공유 id}/missing', `${targets.base}/s/${FAKE_SHARE}/missing`);
  // 문서 출처는 공유 주소를 모른다(J5와 같은 404)
  await expectRawNotFound('/s/{없는 공유 id} (문서 출처)', `${targets.raw}/s/${FAKE_SHARE}`);
}

// 2단계의 새 관리자 API·토큰 API·페이지 (로그아웃 401, 다른 출처 쓰기 403, 로그인 302)
async function checkStage2ApisLoggedOut() {
  const group = '2단계 새 API (로그아웃)';
  const same = { Origin: targets.base, 'Content-Type': 'application/json' };
  const cross = { Origin: targets.raw, 'Content-Type': 'application/json' };
  const apis = [
    ['PUT', `/api/admin/library/docs/${ZERO_ID}/md`, '{"baseRev":1,"text":"x"}', '폰 저장'],
    ['PUT', `/api/admin/library/docs/${ZERO_ID}/pin`, undefined, '고정'],
    ['DELETE', `/api/admin/library/docs/${ZERO_ID}/pin`, undefined, '고정 풀기'],
    ['POST', '/api/admin/library/shares', '{"scope":{"kind":"project","project":"library-smoke"}}', '공유 만들기'],
    ['DELETE', `/api/admin/library/shares/${FAKE_SHARE}`, undefined, '공유 끄기'],
  ];
  for (const [method, pathname, body, label] of apis) {
    const loggedOut = await get(`${targets.base}${pathname}`, { method, headers: same, body });
    const outBody = await bodyOf(loggedOut);
    checks.check(group, `${label} ${method} → 로그아웃 401`, loggedOut.status === 401, `${loggedOut.status} ${outBody.slice(0, 60)}`);
    const foreign = await get(`${targets.base}${pathname}`, { method, headers: cross, body });
    const foreignBody = await bodyOf(foreign);
    let code = '';
    try {
      code = JSON.parse(foreignBody)?.error?.code ?? '';
    } catch {
      code = '';
    }
    const astroForm = ASTRO_ORIGIN_CHECK.test(foreignBody.trim());
    checks.check(
      group,
      `${label} ${method} → 문서 출처에서 온 쓰기 403`,
      foreign.status === 403 && (code === 'ORIGIN_MISMATCH' || astroForm),
      `${foreign.status} ${code || (astroForm ? 'Astro 출처 검사' : foreignBody.slice(0, 40))}`,
    );
  }
  const list = await get(`${targets.base}/api/admin/library/shares`);
  await list.arrayBuffer();
  checks.check(group, '공유 목록 GET → 로그아웃 401', list.status === 401, `${list.status}`);

  // 서가 토큰 API (폰 판 되돌리기, J41): 토큰 없음 401
  for (const [method, pathname] of [
    ['GET', '/api/library/token/docs?pending=md'],
    ['GET', `/api/library/token/docs/${ZERO_ID}/md`],
    ['POST', `/api/library/token/docs/${ZERO_ID}/md/pulled`],
  ]) {
    const response = await get(`${targets.base}${pathname}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
    await response.arrayBuffer();
    checks.check(group, `토큰 없음: ${method} ${pathname.replace(ZERO_ID, '{id}')} → 401`, response.status === 401, `${response.status}`);
  }
  // 서가 토큰으로 공유 API를 부르지 못한다 (J16: 서가 토큰은 /api/library/token/**만)
  const token = readKeychainToken();
  const bearer = { Authorization: `Bearer ${token ?? `wrong-${'x'.repeat(40)}`}` };
  const byToken = await get(`${targets.base}/api/admin/library/shares`, { headers: bearer });
  await byToken.arrayBuffer();
  checks.check(group, `${token ? '키체인 서가 토큰' : '틀린 토큰'}으로 GET /api/admin/library/shares → 401`, byToken.status === 401, `${byToken.status}`);

  // 로그인이 필요한 새 페이지: 검색 주소, 고치기 화면, 판에 없는 파일 안내
  for (const pathname of ['/admin/library?q=smoke', `/admin/library/d/${FAKE_ID}/edit`, `/admin/library/missing?from=${FAKE_ID}&ref=x`]) {
    const response = await get(`${targets.base}${pathname}`);
    const body = await response.text();
    const location = response.headers.get('location') ?? '';
    checks.check(group, `${pathname.split('?')[0]} → 로그인 302`, response.status === 302 && location.startsWith('/admin/login?next=') && body.length === 0, `${response.status} → ${location}`);
  }
}

// 관리자 쿠키 이름 (J54, --with-docs): https는 __Host-cruz_admin + 옛 이름 지우기, http는 cruz_admin
async function checkAdminCookieName(setCookies, session) {
  const group = '관리자 쿠키 이름 (J54)';
  const name = adminCookieFor(targets);
  const line = setCookies.find((item) => item.startsWith(`${name}=`)) ?? '';
  const attrs = line.split(';').map((part) => part.trim().toLowerCase());
  const problems = [];
  if (!line) problems.push(`${name} 없음`);
  if (!attrs.includes('path=/')) problems.push('Path=/ 아님');
  if (!attrs.includes('httponly')) problems.push('HttpOnly 없음');
  if (attrs.some((part) => part.startsWith('domain='))) problems.push('Domain 있음');
  if (!targets.local && !attrs.includes('secure')) problems.push('Secure 없음');
  checks.check(group, `로그인 → ${name}${targets.local ? '' : '(Secure, Path=/, Domain 없음)'}`, problems.length === 0, problems.join(', ') || '통과');
  if (!targets.local) {
    const legacy = setCookies.find((item) => item.startsWith('cruz_admin='));
    const removes = Boolean(legacy) && /max-age=0|expires=thu, 01 jan 1970/i.test(legacy);
    checks.check(group, '로그인 → 옛 이름 cruz_admin을 지운다', removes, legacy ? legacy.split(';')[0] : '옛 이름 줄 없음');
    // 옛 이름으로 보낸 같은 세션 값은 통하지 않는다 (옛 이름은 읽지 않는다)
    const old = await get(`${targets.base}/api/admin/session`, { headers: { Cookie: `cruz_admin=${session}` } });
    await old.arrayBuffer();
    checks.check(group, '옛 이름 cruz_admin으로 보낸 세션 → 401', old.status === 401, `${old.status}`);
  }
  const current = await get(`${targets.base}/api/admin/session`, { headers: { Cookie: `${name}=${session}` } });
  await current.arrayBuffer();
  checks.check(group, `${name}로 보낸 세션 → 200`, current.status === 200, `${current.status}`);
}

// 로그아웃이 두 이름을 지운다 (J54). 세션 값은 폐기하지 않는다(?all=1을 쓰지 않는다)
async function checkAdminLogout(session) {
  const group = '관리자 쿠키 이름 (J54)';
  const name = adminCookieFor(targets);
  const response = await get(`${targets.base}/api/admin/session`, { method: 'DELETE', headers: { Origin: targets.base, Cookie: `${name}=${session}` } });
  await response.arrayBuffer();
  const lines = response.headers.getSetCookie();
  const cleared = (cookie) => lines.some((line) => line.startsWith(`${cookie}=`) && /max-age=0|expires=thu, 01 jan 1970/i.test(line));
  const names = targets.local ? [name] : [name, 'cruz_admin'];
  checks.check(group, `로그아웃 → ${names.join('·')}를 지운다`, response.status === 204 && names.every(cleared), `${response.status} ${lines.map((line) => line.split(';')[0]).join(' / ')}`);
}

// 공유 시험 문서 (--with-docs): 서가 화면 키로 폴더를 만든다
// - share-{run}/inside.md (child·outside로 링크), share-{run}/deep/child.md, share-{run}x/outside.md(앞부분이 겹치는 다른 폴더)
async function prepareShareDocs(session, workDir) {
  const dir = path.join(workDir, 'share');
  await mkdir(path.join(dir, 'deep'), { recursive: true });
  const folder = `share-${runId}`;
  const files = [
    ['inside.md', `# 공유 점검 안 ${runId}\n\n[아래 문서](deep/child.md) · [밖 문서](../${folder}x/outside.md)\n`, `${folder}/inside.md`, '공유 안 문서'],
    ['deep/child.md', `# 공유 점검 아래 ${runId}\n\n하위 폴더 문서.\n`, `${folder}/deep/child.md`, '공유 하위 폴더 문서'],
    ['outside.md', `# 공유 점검 밖 ${runId}\n\n${folder}x 폴더 문서.\n`, `${folder}x/outside.md`, '공유 밖 문서'],
  ];
  const docs = [];
  for (const [file, text, relativePath, label] of files) {
    const absPath = path.join(dir, file);
    await writeFile(absPath, text);
    const [plan] = await planPush([absPath], { home: homedir() });
    if (!plan.ok) throw new Error(`올리기 계획 실패: ${absPath} (${plan.error})`);
    const uploaded = await uploadSmokeDoc(targets, tfetch, session, plan.jobs[0], relativePath);
    docs.push({ ...uploaded, label });
  }
  return { folder, docs };
}

// 공유 하나를 만든다 (관리자 API)
async function createShare(session, scope, duration) {
  const response = await adminApi(targets, tfetch, session, 'POST', '/api/admin/library/shares', { scope, duration });
  return response;
}

// 공유 기록을 지운다 (점검이 만든 것만. 운영의 끄기는 기록을 남기지만 점검은 흔적 0을 본다)
async function deleteShareRecords(ids) {
  const { db } = initAdmin();
  const left = [];
  for (const id of ids) {
    const ref = db.collection('library_shares').doc(id);
    await ref.delete();
    if ((await ref.get()).exists) left.push(id);
  }
  return left;
}

// 끈 뒤 1분 안에 막히는지: 5초마다 70초까지 본다
async function waitUntilStatus(url, init, want, limitMs = 70_000) {
  const started = Date.now();
  for (;;) {
    const response = await get(url, init);
    await response.arrayBuffer();
    if (response.status === want) return { ok: true, ms: Date.now() - started };
    if (Date.now() - started > limitMs) return { ok: false, ms: Date.now() - started, status: response.status };
    await sleep(5_000);
  }
}

// 공유 흐름 (--with-docs, 공유 켜짐). 만든 공유 id를 shareIds에 모은다(뒷정리가 지운다)
async function checkSharesWithDocs(session, isolation, other, shareDocs, workDir, shareIds, allDocs) {
  const group = '공유 흐름 (--with-docs)';
  const [inside, child, outside] = shareDocs.docs;

  // 1. 문서 하나(html) 1일
  const docShare = await createShare(session, { kind: 'doc', docId: isolation.id }, '1d');
  const docId = docShare.json?.share?.id ?? '';
  if (docId) shareIds.push(docId);
  checks.check(
    group,
    '문서 하나 공유 만들기 → 200, 주소·QR',
    docShare.status === 200 && /^[A-Za-z0-9_-]{24}$/.test(docId) && docShare.json?.share?.url === `${targets.base}/s/${docId}` && String(docShare.json?.qrSvg ?? '').includes('<svg'),
    `${docShare.status} ${docShare.status === 404 ? '공유 스위치가 꺼져 있다(--expect share-off)' : docShare.text.slice(0, 80)}`,
  );
  if (!docId) return;

  const open = await get(`${targets.base}/s/${docId}`);
  await open.arrayBuffer();
  const ticketUrl = open.headers.get('location') ?? '';
  const openProblems = shareHeaderProblems(open);
  if (open.status !== 302 || !ticketUrl.startsWith(`${targets.raw}/d/_open?t=`)) openProblems.unshift(`${open.status} → ${ticketUrl.split('?')[0]}`);
  checks.check(group, '로그아웃: /s/{문서 공유}(html) → 문서 출처 공유 입장권 302, 공유 머리', openProblems.length === 0, openProblems.join(', ') || '통과');
  if (!ticketUrl) return;

  const ticket = await get(ticketUrl);
  await ticket.arrayBuffer();
  const setCookie = ticket.headers.get('set-cookie') ?? '';
  const shareCookie = setCookie.match(new RegExp(`${SHARE_COOKIE_NAME}=([^;]+)`))?.[1] ?? '';
  const attrs = setCookie.split(';').map((part) => part.trim().toLowerCase());
  const maxAge = Number(attrs.find((part) => part.startsWith('max-age='))?.slice('max-age='.length) ?? NaN);
  const cookieProblems = [];
  if (ticket.status !== 302 || ticket.headers.get('location') !== `/d/${isolation.id}/index.html`) cookieProblems.push(`${ticket.status} → ${ticket.headers.get('location')}`);
  if (!shareCookie) cookieProblems.push('공유 쿠키 없음');
  if (setCookie.includes(`${DOC_COOKIE_NAME}=`)) cookieProblems.push('관리자 문서 쿠키를 줌');
  if (!attrs.includes(`path=/d/${isolation.id.toLowerCase()}/`)) cookieProblems.push('Path가 문서 경로가 아님');
  if (!attrs.includes('httponly')) cookieProblems.push('HttpOnly 없음');
  if (!targets.local && !attrs.includes('secure')) cookieProblems.push('Secure 없음');
  if (attrs.some((part) => part.startsWith('domain='))) cookieProblems.push('Domain 있음');
  if (!(maxAge > 0 && maxAge <= 12 * 60 * 60)) cookieProblems.push(`Max-Age ${maxAge}`);
  checks.check(group, `공유 입장권 → ${SHARE_COOKIE_NAME}(문서 경로, 12시간 이하) 302`, cookieProblems.length === 0, cookieProblems.join(', ') || `Max-Age ${maxAge}`);
  const shareCookieHeader = { headers: { Cookie: `${SHARE_COOKIE_NAME}=${shareCookie}` } };
  const file = await get(`${targets.raw}/d/${isolation.id}/index.html`, shareCookieHeader);
  await file.arrayBuffer();
  checks.check(group, '공유 쿠키로 그 문서 → 200', file.status === 200, `${file.status}`);
  await expectRawNotFound('공유 쿠키로 다른 문서', `${targets.raw}/d/${other.id}/index.html`, shareCookieHeader);
  await expectRawNotFound('공유 쿠키를 관리자 문서 쿠키 이름으로', `${targets.raw}/d/${isolation.id}/index.html`, {
    headers: { Cookie: `${DOC_COOKIE_NAME}=${shareCookie}` },
  });

  // 2. 폴더 7일
  const folderShare = await createShare(session, { kind: 'folder', project: SMOKE_PROJECT, folder: shareDocs.folder }, '7d');
  const folderId = folderShare.json?.share?.id ?? '';
  if (folderId) shareIds.push(folderId);
  checks.check(group, '폴더 공유 만들기 → 200', folderShare.status === 200 && Boolean(folderId), `${folderShare.status}`);
  if (folderId) {
    const list = await get(`${targets.base}/s/${folderId}`);
    const body = stripVercelInjection(await bodyOf(list));
    const problems = shareHeaderProblems(list);
    if (list.status !== 200) problems.unshift(`상태 ${list.status}`);
    if (!body.includes(inside.title) || !body.includes(child.title)) problems.push('범위 안 문서가 없다');
    if (body.includes(outside.title)) problems.push('bundles2 꼴의 밖 문서가 보인다');
    if (body.includes(isolation.title) || body.includes(other.title)) problems.push('다른 폴더 문서가 보인다');
    if (body.includes('/admin')) problems.push('본문에 /admin 주소');
    if (!body.includes(`<meta property="og:title" content="${SMOKE_PROJECT} · ${shareDocs.folder}"`)) problems.push('og:title 없음');
    if (/<meta property="og:(image|description)"/.test(body)) problems.push('og 그림·설명 있음');
    checks.check(group, '로그아웃: /s/{폴더 공유} → 범위 안 목록(하위 폴더 포함, 앞부분 겹친 폴더 뺌)', problems.length === 0, problems.join(', ') || '통과');

    const md = await get(`${targets.base}/s/${folderId}/d/${inside.id}`);
    const mdBody = stripVercelInjection(await bodyOf(md));
    const mdProblems = shareHeaderProblems(md);
    if (md.status !== 200) mdProblems.unshift(`상태 ${md.status}`);
    if (!mdBody.includes(`href="/s/${folderId}/d/${child.id}"`)) mdProblems.push('하위 문서 링크가 공유 주소가 아니다');
    if (!mdBody.includes(`href="/s/${folderId}/d/${outside.id}"`)) mdProblems.push('밖 문서 링크가 공유 주소가 아니다');
    if (mdBody.includes('/admin')) mdProblems.push('본문에 /admin 주소');
    if (!mdBody.includes(`${targets.raw}/d/_open?t=`)) mdProblems.push('공유 입장권 그림 없음');
    if (!mdBody.includes(`href="/s/${folderId}"`)) mdProblems.push('← 목록 없음');
    checks.check(group, '로그아웃: 공유 md 화면 → 링크가 같은 공유 주소 아래, 관리자 주소 없음', mdProblems.length === 0, mdProblems.join(', ') || '통과');

    const childPage = await get(`${targets.base}/s/${folderId}/d/${child.id}`);
    await childPage.arrayBuffer();
    checks.check(group, '로그아웃: 하위 폴더 문서 → 200', childPage.status === 200, `${childPage.status}`);
    await expectShareNotFound(group, '범위 밖 문서(앞부분 겹친 폴더)', `${targets.base}/s/${folderId}/d/${outside.id}`);
    await expectShareNotFound(group, '범위 밖 문서(다른 폴더 html)', `${targets.base}/s/${folderId}/d/${isolation.id}`);
  }

  // 3. 프로젝트 끌 때까지
  const projectShare = await createShare(session, { kind: 'project', project: SMOKE_PROJECT }, 'forever');
  const projectId = projectShare.json?.share?.id ?? '';
  if (projectId) shareIds.push(projectId);
  const projectOk = projectShare.status === 200 && projectShare.json?.share?.expiresAt === null;
  checks.check(group, '프로젝트 공유(끌 때까지) 만들기 → 200, 끝나는 시각 없음', projectOk, `${projectShare.status}`);
  if (projectId) {
    const list = await get(`${targets.base}/s/${projectId}`);
    const body = stripVercelInjection(await bodyOf(list));
    const all = [inside, child, outside, isolation, other].every((doc) => body.includes(doc.title));
    checks.check(group, '로그아웃: /s/{프로젝트 공유} → 프로젝트 문서 모두', list.status === 200 && all, `${list.status}`);
  }

  // 4. 공유 중 목록, 잘못된 범위, 없는 문서
  const live = await adminApi(targets, tfetch, session, 'GET', '/api/admin/library/shares');
  const liveIds = (live.json?.shares ?? []).map((share) => share.id);
  checks.check(group, '공유 중 목록 → 만든 셋이 있다', live.status === 200 && [docId, folderId, projectId].every((id) => liveIds.includes(id)), `${live.status}, ${liveIds.length}개`);
  const bad = await createShare(session, { kind: 'folder', project: SMOKE_PROJECT, folder: '../x' }, '1d');
  checks.check(group, '틀린 폴더 이름 → 400', bad.status === 400, `${bad.status}`);
  const empty = await createShare(session, { kind: 'folder', project: SMOKE_PROJECT, folder: `no-such-${runId}` }, '1d');
  checks.check(group, '문서가 없는 폴더 → 404', empty.status === 404, `${empty.status}`);

  // 5. 나중에 올린 문서: 공유 중인 묶음 경고 (J52)
  const lateDir = path.join(workDir, 'share-late');
  await mkdir(lateDir, { recursive: true });
  const latePath = path.join(lateDir, 'late.md');
  await writeFile(latePath, `# 공유 점검 나중 ${runId}\n`);
  const [latePlan] = await planPush([latePath], { home: homedir() });
  if (latePlan.ok) {
    const late = await uploadSmokeDoc(targets, tfetch, session, latePlan.jobs[0], `${shareDocs.folder}/late.md`);
    allDocs.push({ ...late, label: '공유 나중 문서' });
    const labels = (late.sharedBy ?? []).map((entry) => entry.label);
    checks.check(
      group,
      '공유 중인 폴더에 올리기 → 마무리 응답 sharedBy에 폴더·프로젝트 공유',
      labels.includes(`${SMOKE_PROJECT} · ${shareDocs.folder}`) && labels.includes(SMOKE_PROJECT),
      labels.join(' / ') || '(없음)',
    );
  }

  // 6. 끝난 공유: 끝나는 시각이 지난 기록을 직접 넣는다
  const expiredId = `smokeExpired${runId}`.padEnd(24, '0').slice(0, 24);
  const { db } = initAdmin();
  await db.collection('library_shares').doc(expiredId).set({
    scope: { kind: 'project', project: SMOKE_PROJECT },
    expiresAt: new Date(Date.now() - 60_000),
    revokedAt: null,
    createdAt: new Date(Date.now() - 120_000),
  });
  shareIds.push(expiredId);
  await expectShareNotFound(group, '끝난 공유', `${targets.base}/s/${expiredId}`);

  // 7. 끄기: 1분 안에 공유 주소와 공유 쿠키가 막힌다 (C11)
  const off = await adminApi(targets, tfetch, session, 'DELETE', `/api/admin/library/shares/${docId}`);
  checks.check(group, '문서 공유 끄기 → 204', off.status === 204, `${off.status}`);
  const pageGone = await waitUntilStatus(`${targets.base}/s/${docId}`, {}, 404);
  checks.check(group, '끈 뒤 1분 안에 /s/{문서 공유} → 404', pageGone.ok, `${pageGone.ok ? '' : `${pageGone.status}, `}${Math.round(pageGone.ms / 1000)}초`);
  const cookieGone = await waitUntilStatus(`${targets.raw}/d/${isolation.id}/index.html`, shareCookieHeader, 404);
  checks.check(group, '끈 뒤 1분 안에 같은 공유 쿠키로 문서 출처 → 404', cookieGone.ok, `${cookieGone.ok ? '' : `${cookieGone.status}, `}${Math.round(cookieGone.ms / 1000)}초`);
  await expectShareNotFound(group, '끈 공유', `${targets.base}/s/${docId}`);
  const again = await adminApi(targets, tfetch, session, 'DELETE', `/api/admin/library/shares/${docId}`);
  checks.check(group, '이미 끈 공유를 다시 끄기 → 204', again.status === 204, `${again.status}`);
  for (const id of [folderId, projectId].filter(Boolean)) {
    const response = await adminApi(targets, tfetch, session, 'DELETE', `/api/admin/library/shares/${id}`);
    checks.check(group, `${id === folderId ? '폴더' : '프로젝트'} 공유 끄기 → 204`, response.status === 204, `${response.status}`);
  }
}

// 공유 꺼짐 (--expect share-off, --with-docs): 공유 API가 404다 (J50)
async function checkShareApiOff(session) {
  const group = '공유 꺼짐 (J50)';
  const create = await adminApi(targets, tfetch, session, 'POST', '/api/admin/library/shares', { scope: { kind: 'project', project: SMOKE_PROJECT } });
  checks.check(group, '관리자 POST /api/admin/library/shares → 404', create.status === 404, `${create.status}`);
  const list = await adminApi(targets, tfetch, session, 'GET', '/api/admin/library/shares');
  checks.check(group, '관리자 GET /api/admin/library/shares → 404', list.status === 404, `${list.status}`);
  return create.json?.share?.id ?? null;
}

// ───────────── 서가 꺼짐 (--expect off) ─────────────

async function checkLibraryOff() {
  const group = '서가 꺼짐 (8.1 4, C5)';
  const home = await get(`${targets.base}/`);
  await home.arrayBuffer();
  checks.check(group, '블로그 / → 200 (대조군)', home.status === 200, `${home.status}`);
  const cases = [
    ['GET /admin/library', '/admin/library', {}],
    ['GET /admin/library/d/{id}', `/admin/library/d/${FAKE_ID}`, {}],
    ['POST /api/admin/library/uploads (같은 Origin)', '/api/admin/library/uploads', { method: 'POST', headers: { Origin: targets.base, 'Content-Type': 'application/json' }, body: '{}' }],
    [`DELETE /api/admin/library/docs/{id} (같은 Origin)`, `/api/admin/library/docs/${ZERO_ID}`, { method: 'DELETE', headers: { Origin: targets.base } }],
    ['GET /api/library/token/docs', '/api/library/token/docs', {}],
    ['GET /api/library/token/docs (토큰 실음)', '/api/library/token/docs', { headers: { Authorization: `Bearer ${readKeychainToken() ?? 'x'.repeat(43)}` } }],
    ['GET /d/{id}/index.html', `/d/${FAKE_ID}/index.html`, {}],
    ['GET /d/_open?t=…', '/d/_open?t=abc', {}],
    ['GET /s/{공유 id} (서가 2단계 J50)', `/s/${FAKE_SHARE}`, {}],
  ];
  for (const [name, pathname, init] of cases) {
    const response = await get(`${targets.base}${pathname}`, init);
    await response.arrayBuffer();
    checks.check(group, `블로그 출처 ${name} → 404`, response.status === 404, `${response.status}`);
  }
  const rawHost = new URL(targets.raw).hostname;
  const resolvable = rawHost.endsWith('.localhost') || (await lookup(rawHost).then(() => true, () => false));
  if (!resolvable) {
    checks.skip(group, `문서 출처 ${rawHost}의 경로 → 404`, 'DNS에 호스트가 없다(운영 문서 출처는 T11에 붙인다)');
    return;
  }
  for (const pathname of ['/', '/admin', `/d/${FAKE_ID}/index.html`, '/d/_open?t=abc']) {
    const response = await get(`${targets.raw}${pathname}`);
    await response.arrayBuffer();
    checks.check(group, `문서 출처 ${pathname} → 404`, response.status === 404, `${response.status}`);
  }
}

// ───────────── 실행 ─────────────

async function main() {
  console.log(`smoke:library 대상: 블로그 ${targets.base}, 문서 출처 ${targets.raw}, 기대 ${expectOff ? '서가 꺼짐' : shareOff ? '서가 켜짐·공유 꺼짐' : '서가·공유 켜짐'}${withDocs ? ', 시험 문서 씀' : ''}${tfetch.bypass ? ', Vercel 우회 머리 씀' : ''}`);
  const reach = await assertReachable(expectOff ? { base: targets.base, raw: targets.base } : targets, tfetch);
  if (!reach.ok) {
    console.error(`대상에 닿지 못했다: ${reach.origin} — ${reach.reason}`);
    process.exitCode = 2;
    return;
  }

  if (expectOff) {
    if (withDocs) console.log('  (--expect off에서는 --with-docs를 쓰지 않는다)');
    await checkLibraryOff();
    await checkFeeds([]);
    return;
  }

  let session = '';
  let adminSetCookies = [];
  let docs = [];
  let workDir = '';
  let shareDocs = null;
  const shareIds = []; // 점검이 만든 공유 기록 (뒷정리가 지운다)
  try {
    if (withDocs) {
      ({ session, setCookies: adminSetCookies } = await createAdminSessionDetailed(targets, tfetch));
      workDir = await mkdtemp(path.join(homedir(), 'library-smoke-'));
      docs = await prepareDocs(session, workDir);
      // 공유 시험 문서 (서가 2단계 T11): 공유 꺼짐 대상에는 올리지 않는다
      if (!shareOff) {
        shareDocs = await prepareShareDocs(session, workDir);
        docs.push(...shareDocs.docs);
      }
      console.log(`  시험 문서 ${docs.length}개를 올렸다 (프로젝트 library-smoke)`);
    }

    await checkLibraryPagesLoggedOut(docs);
    await checkRawLoggedOut();
    await checkTokenPaths();
    await checkCrossOriginWrites();
    await checkIsolationTargetsLoggedOut();
    await checkSharesLoggedOut();
    await checkStage2ApisLoggedOut();

    if (withDocs) {
      const [isolation, other] = docs;
      const openedIsolation = await openAsAdmin(session, isolation);
      const openedOther = await openAsAdmin(session, other);
      if (openedIsolation && openedOther) {
        isolation.cookie = openedIsolation.cookie;
        other.cookie = openedOther.cookie;
        await checkRealCookieCases(isolation, other);
        await runIsolationInChrome(session, isolation);
        await checkExpiredRealTicket(openedIsolation);
      }
      await checkAdminCookieName(adminSetCookies, session);
      if (shareOff) await checkShareApiOff(session);
      else if (shareDocs) await checkSharesWithDocs(session, isolation, other, shareDocs, workDir, shareIds, docs);
    } else {
      checks.skip('진짜 열기 흐름 (관리자)', '다른 문서의 쿠키·위조 쿠키·만료 입장권·격리 시험 문서', '--with-docs가 필요하다(시험 문서를 올리고 내린다)');
      checks.skip('공유 흐름 (--with-docs)', '세 범위 열기·끄기 1분·sharedBy·관리자 쿠키 이름', '--with-docs가 필요하다(시험 문서와 공유를 만들고 지운다)');
    }

    await checkBlogDocPaths(docs);
    await checkBucketDirect(docs);
    await checkFeeds(docs);

    // 쓰기 요청은 방법·형식마다 거절하는 층이 다르다. 같은 요청 꼴끼리(없는 문서 vs 진짜 문서) 응답이 같아야 한다
    const byShape = new Map();
    for (const item of writeDigests) {
      const shape = item.name.split(' ').slice(0, 2).join(' ');
      byShape.set(shape, [...(byShape.get(shape) ?? []), item.digest]);
    }
    for (const [shape, list] of byShape) {
      if (list.length < 2) continue;
      checks.check('문서 출처 쓰기 요청', `${shape}: 없는 문서와 진짜 문서의 응답이 같다`, new Set(list).size === 1, list.join(' / '));
    }
    // 공유 404 화면(J46)도 모든 경우에 같다 (없음·꼴·범위 밖·끝남·끔)
    const shareDistinct = new Set(shareNotFoundDigests.map((item) => item.digest));
    checks.check(
      '공유 주소 (로그아웃)',
      `공유 404 본문이 모든 경우에 같다 (${shareNotFoundDigests.length}경우)`,
      shareDistinct.size === 1,
      shareDistinct.size === 1 ? [...shareDistinct][0] : shareNotFoundDigests.map((item) => `${item.name}=${item.digest}`).join('; '),
    );
    const distinct = new Set(notFoundDigests.map((item) => item.digest));
    checks.check(
      '문서 출처 404 (J5)',
      `응답 본문이 모든 경로에서 같다 (${notFoundDigests.length}경로)`,
      distinct.size === 1,
      distinct.size === 1 ? [...distinct][0] : notFoundDigests.map((item) => `${item.name}=${item.digest}`).join('; '),
    );
  } finally {
    // 공유 기록을 먼저 지운다 (서가 2단계 T11: 흔적 0)
    if (shareIds.length > 0) {
      const left = await deleteShareRecords(shareIds).catch((error) => [`오류 ${error.message}`]);
      checks.check('뒷정리', `공유 기록 ${shareIds.length}개 흔적 0`, left.length === 0, left.length ? left.join(', ') : '0');
    }
    if (docs.length > 0) await cleanupDocs(session, docs, workDir);
    else if (workDir) await rm(workDir, { recursive: true, force: true });
    // 로그아웃이 두 이름을 지우는지 (세션 값은 폐기하지 않는다)
    if (session) await checkAdminLogout(session).catch((error) => checks.check('관리자 쿠키 이름 (J54)', '로그아웃', false, error.message));
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  checks.check('실행', '점검이 끝까지 돈다', false, error instanceof Error ? error.message : String(error));
}
checks.print();
if (typeof args.json === 'string') {
  await writeFile(args.json, JSON.stringify({ targets, expectOff, withDocs, at: new Date().toISOString(), rows: checks.rows }, null, 2));
  console.log(`결과 JSON: ${args.json}`);
}
if (checks.failures.length > 0 && !process.exitCode) process.exitCode = 1;
