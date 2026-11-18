// 서가 비공개·격리 자동 점검 smoke:library (서가 1단계 T10, Plan 8.1의 2·3·4, 11절 1·2)
//
// 실행 (저장소 루트에서):
//   pnpm smoke:library [--base http://localhost:4341] [--raw <문서 출처>] [--expect on|off] [--with-docs] [--json <파일>]
//
// - 기본: 로그아웃 요청만 보낸다. 데이터를 만들지 않는다. 위조 값과 없는 문서 id를 쓴다.
// - --with-docs: 관리자 세션으로 시험 문서 2개(격리 시험 문서, 다른 문서 하나)를 서가에 올린다.
//   진짜 입장권·문서 쿠키로 "다른 문서의 쿠키", "위조 쿠키", "만료 입장권"을 보고,
//   헤드리스 Chrome에 관리자 쿠키를 넣고 격리 시험 문서를 열어 결과를 읽는다(8.1 3).
//   끝에(실패해도) 시험 문서를 내리고 흔적(문서 기록, 판 기록, 버킷 파일)이 0인지 본다.
// - --expect off: 서가가 꺼진 대상(T11 전의 운영). 서가 주소가 모두 404인지 본다(8.1 4, C5).
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
import { createDocCookie, createTicket, DOC_COOKIE_NAME } from '../../src/library/ticket.ts';
import { parseArgs } from '../migrate/lib/admin.mjs';
import {
  ADMIN_COOKIE,
  assertReachable,
  bodyOf,
  Checks,
  createAdminSession,
  digest,
  docRemnants,
  launchChrome,
  makeTargetFetch,
  readKeychainToken,
  removeSmokeDoc,
  resolveTargets,
  stripVercelInjection,
  uploadSmokeDoc,
} from './library-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ISOLATION_DIR = path.join(SCRIPT_DIR, 'library-isolation');
const args = parseArgs();
const targets = resolveTargets(args);
const expectOff = args.expect === 'off';
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
  const page = await get(`${targets.base}/admin/library/d/${doc.id}`, { headers: { Cookie: `${ADMIN_COOKIE}=${session}` } });
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
      name: ADMIN_COOKIE,
      value: session,
      url: `${targets.base}/`,
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
  console.log(`smoke:library 대상: 블로그 ${targets.base}, 문서 출처 ${targets.raw}, 기대 ${expectOff ? '서가 꺼짐' : '서가 켜짐'}${withDocs ? ', 시험 문서 씀' : ''}${tfetch.bypass ? ', Vercel 우회 머리 씀' : ''}`);
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
  let docs = [];
  let workDir = '';
  try {
    if (withDocs) {
      session = await createAdminSession(targets, tfetch);
      workDir = await mkdtemp(path.join(homedir(), 'library-smoke-'));
      docs = await prepareDocs(session, workDir);
      console.log(`  시험 문서 ${docs.length}개를 올렸다 (프로젝트 library-smoke)`);
    }

    await checkLibraryPagesLoggedOut(docs);
    await checkRawLoggedOut();
    await checkTokenPaths();
    await checkCrossOriginWrites();
    await checkIsolationTargetsLoggedOut();

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
    } else {
      checks.skip('진짜 열기 흐름 (관리자)', '다른 문서의 쿠키·위조 쿠키·만료 입장권·격리 시험 문서', '--with-docs가 필요하다(시험 문서를 올리고 내린다)');
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
    const distinct = new Set(notFoundDigests.map((item) => item.digest));
    checks.check(
      '문서 출처 404 (J5)',
      `응답 본문이 모든 경로에서 같다 (${notFoundDigests.length}경로)`,
      distinct.size === 1,
      distinct.size === 1 ? [...distinct][0] : notFoundDigests.map((item) => `${item.name}=${item.digest}`).join('; '),
    );
  } finally {
    if (docs.length > 0) await cleanupDocs(session, docs, workDir);
    else if (workDir) await rm(workDir, { recursive: true, force: true });
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
