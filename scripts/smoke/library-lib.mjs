// 서가 자동 점검 공용 도구 (서가 1단계 T10, Plan 8.1·8.2)
// - smoke:library(library-private.mjs)와 화면 대조(library-compare.mjs)가 함께 쓴다.
// - 대상: 블로그 출처(--base)와 문서 출처(--raw). --raw가 없으면 블로그 출처에서 구한다
//   (localhost:4341 → raw.localhost:4341, www.cruzlab.dev → raw.cruzlab.dev, preview.cruzlab.dev → raw-preview.cruzlab.dev).
// - Vercel 미리보기 보호(Vercel Authentication): .env의 VERCEL_AUTOMATION_BYPASS_SECRET이 있으면
//   대상 호스트 요청에만 x-vercel-protection-bypass 머리를 싣는다. 저장소(googleapis.com) 요청에는 싣지 않는다.
// - 비밀값(우회 비밀값, 관리자 세션 쿠키, 서가 토큰, 입장권 비밀값)은 출력하지 않는다.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdtempSync, rmSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { contentTypeForPath } from '../../src/library/rules.ts';
import { adminCookieName, initAdmin, sessionCookieMatch } from '../migrate/lib/admin.mjs';

// 관리자 세션 쿠키 이름 (서가 2단계 J54): https는 __Host-cruz_admin, http(로컬 개발)는 cruz_admin.
// 서버(admin-session.ts adminCookieName)와 같은 규칙이다. 대상 블로그 출처로 고른다
export function adminCookieFor(targets) {
  return adminCookieName(targets.base);
}
export const BYPASS_HEADER = 'x-vercel-protection-bypass';
const BYPASS_COOKIE_HEADER = 'x-vercel-set-bypass-cookie';
export const LIBRARY_COLLECTION = 'library_docs';
// 시험 문서의 프로젝트 이름 (서가 화면에서 한 묶음으로 보인다)
export const SMOKE_PROJECT = 'library-smoke';

// ───────────── 대상 ─────────────

// 블로그 출처 → 문서 출처 호스트
function deriveRawHost(baseUrl) {
  const { hostname, port } = baseUrl;
  const withPort = (name) => (port ? `${name}:${port}` : name);
  if (hostname === 'localhost' || hostname === '127.0.0.1') return withPort('raw.localhost');
  if (hostname.startsWith('www.')) return withPort(`raw.${hostname.slice(4)}`);
  return withPort(`raw-${hostname}`);
}

// 점검 대상을 정한다
// - local: 로컬 개발 서버(쿠키에 Secure가 없고, Vercel 보호가 없다)
export function resolveTargets(args) {
  const base = new URL(typeof args.base === 'string' ? args.base : 'http://localhost:4341');
  const raw = typeof args.raw === 'string' ? new URL(args.raw) : new URL(`${base.protocol}//${deriveRawHost(base)}`);
  const local = ['localhost', '127.0.0.1'].includes(base.hostname);
  return { base: base.origin, raw: raw.origin, local };
}

// 대상 호스트에만 우회 머리를 싣는 fetch (리다이렉트는 따라가지 않는다)
// - 우회 비밀값이 없으면 머리를 싣지 않는다(로컬, 운영)
export function makeTargetFetch(targets, secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || '') {
  const hosts = new Set([new URL(targets.base).host, new URL(targets.raw).host]);
  const targetFetch = async (url, init = {}) => {
    const target = new URL(url);
    const headers = new Headers(init.headers);
    if (secret && hosts.has(target.host)) headers.set(BYPASS_HEADER, secret);
    return fetch(target, { redirect: 'manual', ...init, headers });
  };
  targetFetch.bypass = Boolean(secret);
  targetFetch.secret = secret;
  targetFetch.hosts = hosts;
  return targetFetch;
}

// Vercel 보호 벽이 막는 응답인가 (Vercel 로그인 화면으로 보내거나 401 SSO 화면)
export function isVercelWall(response) {
  const location = response.headers.get('location') ?? '';
  return (
    (response.status >= 300 && response.status < 400 && /vercel\.com\/sso-api/.test(location)) ||
    (response.status === 401 && /vercel/i.test(response.headers.get('server') ?? '') && !response.headers.get('content-type')?.includes('json'))
  );
}

// 대상에 닿는지 먼저 본다. Vercel 벽에 막히면 고칠 방법을 알린다
export async function assertReachable(targets, targetFetch) {
  for (const origin of [targets.base, targets.raw]) {
    let response;
    try {
      response = await targetFetch(`${origin}/`);
    } catch (error) {
      return { ok: false, origin, reason: `닿지 못함 (${error instanceof Error ? error.cause?.code ?? error.message : error})` };
    }
    await response.arrayBuffer().catch(() => undefined);
    if (isVercelWall(response)) {
      return {
        ok: false,
        origin,
        reason: targetFetch.bypass
          ? 'Vercel 보호 벽에 막혔다. 우회 비밀값이 틀렸거나 이 프로젝트의 값이 아니다'
          : 'Vercel 보호 벽에 막혔다. .env에 VERCEL_AUTOMATION_BYPASS_SECRET을 넣는다',
      };
    }
  }
  return { ok: true };
}

// ───────────── 결과 표 ─────────────

// 점검 결과 모음
// - pass / fail / skip(건너뜀: 이유를 적는다)
export class Checks {
  constructor() {
    this.rows = [];
  }

  check(group, name, pass, detail = '') {
    this.rows.push({ group, name, status: pass ? 'pass' : 'fail', detail: String(detail) });
    return pass;
  }

  skip(group, name, reason) {
    this.rows.push({ group, name, status: 'skip', detail: reason });
  }

  get failures() {
    return this.rows.filter((row) => row.status === 'fail');
  }

  // 터미널 출력: 묶음마다 줄을 쓴다
  print() {
    let group = '';
    for (const row of this.rows) {
      if (row.group !== group) {
        group = row.group;
        console.log(`\n[${group}]`);
      }
      const mark = row.status === 'pass' ? '✓' : row.status === 'fail' ? '✗' : '–';
      console.log(`  ${mark} ${row.name}${row.detail ? ` — ${row.detail}` : ''}`);
    }
    const count = (status) => this.rows.filter((row) => row.status === status).length;
    console.log(`\n점검 ${this.rows.length}건: 통과 ${count('pass')}, 실패 ${count('fail')}, 건너뜀 ${count('skip')}`);
  }
}

// ───────────── 응답 읽기 ─────────────

// 응답 본문 (리다이렉트는 빈 글)
export async function bodyOf(response) {
  if (response.status >= 300 && response.status < 400) {
    await response.arrayBuffer().catch(() => undefined);
    return '';
  }
  return response.text();
}

// Vercel 미리보기가 HTML 끝에 끼워 넣는 도구 막대 스크립트(vercel.live)를 뗀다 (운영에는 없다. T2 기록 5.1)
export function stripVercelInjection(html) {
  return html.replace(/<script[^>]*vercel\.live[^>]*>\s*<\/script>/gi, '').replace(/<script[^>]*vercel\.live[^>]*\/?>/gi, '');
}

// 본문의 짧은 지문 (같은 본문인지 견줄 때)
export function digest(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

// ───────────── 관리자 세션·시험 문서 ─────────────

// 관리자 세션 쿠키를 만든다
// - Admin SDK createCustomToken(ADMIN_UID) → Identity Toolkit signInWithCustomToken → POST /api/admin/session
//   (stage5-admin.mjs와 같은 길). 로그아웃(DELETE /api/admin/session)은 부르지 않는다.
// - 서가 2단계 J54: 응답의 Set-Cookie 줄도 돌려준다(쿠키 이름·속성 점검이 읽는다)
export async function createAdminSessionDetailed(targets, targetFetch) {
  initAdmin();
  const uid = process.env.ADMIN_UID;
  const apiKey = process.env.PUBLIC_FIREBASE_API_KEY;
  if (!uid || !apiKey) throw new Error('.env에 ADMIN_UID와 PUBLIC_FIREBASE_API_KEY가 필요합니다.');
  const customToken = await getAuth().createCustomToken(uid);
  const tokenResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const { idToken } = await tokenResponse.json();
  if (!idToken) throw new Error(`signInWithCustomToken 실패: ${tokenResponse.status}`);
  const response = await targetFetch(`${targets.base}/api/admin/session`, {
    method: 'POST',
    headers: { Origin: targets.base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  await response.arrayBuffer();
  // 로그인 응답에는 옛 이름을 지우는 줄도 온다. 이름이 꼭 같은 쿠키만 읽는다(J54)
  const match = sessionCookieMatch(response.headers, targets.base);
  if (response.status !== 204 || !match) throw new Error(`관리자 세션 발급 실패: ${response.status}`);
  return { session: match[1], setCookies: response.headers.getSetCookie() };
}

export async function createAdminSession(targets, targetFetch) {
  return (await createAdminSessionDetailed(targets, targetFetch)).session;
}

// 쿠키 API 호출 (관리자 세션 + 같은 Origin)
export async function adminApi(targets, targetFetch, session, method, apiPath, body) {
  const headers = { Origin: targets.base, Cookie: `${adminCookieFor(targets)}=${session}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await targetFetch(`${targets.base}${apiPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// 시험 문서 하나를 서가 화면 API(쿠키)로 올린다: 시작 → 버킷 PUT → 마무리
// - job: client/push.ts의 planPush가 만든 작업 { format, fileName, files: [{ path, absPath }] }
// - relativePath: 서가 화면의 올린 상대 경로. 같은 문서 키가 된다(J8). 폴더는 '{폴더}.{형식}'으로 준다(PR #36 리뷰 I6)
// - 버킷 PUT에는 서버가 준 머리만 싣는다(우회 머리를 싣지 않는다)
export async function uploadSmokeDoc(targets, targetFetch, session, job, relativePath) {
  const manifest = [];
  for (const file of job.files) {
    const bytes = await readFile(file.absPath);
    manifest.push({ path: file.path, bytes: bytes.byteLength, sha256: sha256Hex(bytes), absPath: file.absPath });
  }
  const start = await adminApi(targets, targetFetch, session, 'POST', '/api/admin/library/uploads', {
    format: job.format,
    project: SMOKE_PROJECT,
    relativePath,
    fileName: job.fileName,
    files: manifest.map(({ path: filePath, bytes, sha256 }) => ({ path: filePath, bytes, sha256 })),
  });
  if (start.status !== 200 || !start.json?.docId) throw new Error(`올리기 시작 실패 (${start.status}): ${start.text.slice(0, 200)}`);
  const byPath = new Map(manifest.map((entry) => [entry.path.normalize('NFC'), entry]));
  for (const upload of start.json.uploads) {
    const entry = byPath.get(upload.path.normalize('NFC'));
    if (!entry) throw new Error(`서버가 모르는 파일을 요청했다: ${upload.path}`);
    const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: new Uint8Array(await readFile(entry.absPath)) });
    await put.arrayBuffer();
    if (!put.ok) throw new Error(`버킷 PUT 실패 (${put.status}): ${upload.path}`);
  }
  const finalize = await adminApi(targets, targetFetch, session, 'POST', '/api/admin/library/uploads/finalize', {
    docId: start.json.docId,
    rev: start.json.rev,
  });
  if (finalize.status !== 200 || !finalize.json?.doc) throw new Error(`마무리 실패 (${finalize.status}): ${finalize.text.slice(0, 200)}`);
  const { doc } = finalize.json;
  return {
    id: doc.id,
    title: doc.title,
    url: doc.url,
    rev: start.json.rev,
    format: job.format,
    files: manifest.map((entry) => entry.path),
    sharedBy: finalize.json.sharedBy ?? [], // 서가 2단계 J52
  };
}

// 시험 문서를 내린다 (204, 이미 없으면 404)
export async function removeSmokeDoc(targets, targetFetch, session, docId) {
  const response = await adminApi(targets, targetFetch, session, 'DELETE', `/api/admin/library/docs/${docId}`);
  return response.status;
}

// 내린 문서의 흔적 (Admin SDK로 직접 본다): 문서 기록, 판 기록, 버킷 파일 수
export async function docRemnants(docId) {
  const { db } = initAdmin();
  const bucketName = process.env.LIBRARY_BUCKET;
  if (!bucketName) throw new Error('.env에 LIBRARY_BUCKET이 필요합니다.');
  const ref = db.collection(LIBRARY_COLLECTION).doc(docId);
  const [snapshot, revisions, [files]] = await Promise.all([
    ref.get(),
    ref.collection('revisions').listDocuments(),
    getStorage().bucket(bucketName).getFiles({ prefix: `${docId}/` }),
  ]);
  return { doc: snapshot.exists, revisions: revisions.length, files: files.length };
}

// 서가 문서 전체 수 (점검 앞뒤 견줌용)
export async function libraryDocCount() {
  const { db } = initAdmin();
  const snapshot = await db.collection(LIBRARY_COLLECTION).count().get();
  return snapshot.data().count;
}

// 키체인의 서가 토큰 (lab.mjs와 같은 항목). 없으면 null. 값을 출력하지 않는다
export function readKeychainToken() {
  const result = spawnSync('/usr/bin/security', ['find-generic-password', '-s', 'cruz-lab-library', '-a', 'library-token', '-w'], {
    encoding: 'utf8',
  });
  const token = result.status === 0 ? result.stdout.trim() : '';
  return token || null;
}

// ───────────── 정적 파일 서버 (원본 열기, 캡처 대조) ─────────────

// 폴더를 127.0.0.1 임의 포트로 띄운다
// - mounts: [{ prefix: '/', dir }, { prefix: '/__out/', dir }] (앞에서부터 맞는 것을 쓴다)
// - 범위 요청(Range)을 받는다(영상 되감기)
export async function startStaticServer(mounts) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const mount = mounts.find((item) => pathname.startsWith(item.prefix));
      if (!mount) return void response.writeHead(404).end();
      let filePath = path.resolve(mount.dir, `.${pathname.slice(mount.prefix.length - 1)}`);
      if (!filePath.startsWith(path.resolve(mount.dir))) return void response.writeHead(403).end();
      let info = await stat(filePath).catch(() => null);
      if (info?.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        info = await stat(filePath).catch(() => null);
      }
      if (!info?.isFile()) return void response.writeHead(404).end();
      const type = contentTypeForPath(filePath) ?? 'application/octet-stream';
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
      if (range) {
        const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
        response.writeHead(206, {
          'Content-Type': type,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${info.size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        });
        return void createReadStream(filePath, { start, end }).pipe(response);
      }
      response.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      if (request.method === 'HEAD') return void response.end();
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

// ───────────── 헤드리스 Chrome (CDP) ─────────────

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 헤드리스 Chrome 하나를 띄우고 페이지 하나를 조종한다
// - 실행마다 새 프로필(임시 폴더)을 쓰고, close()가 지운다(로컬 HTML 검증 메모: 같은 프로필은 앞 프로세스에 넘겨진다)
// - 우회 비밀값을 주면 대상 호스트의 문서(Document) 요청에만 우회 머리를 싣는다.
//   호스트마다 첫 요청에는 x-vercel-set-bypass-cookie: true를 함께 실어 Vercel이 우회 쿠키를 심게 한다.
//   그 뒤의 하위 요청(그림, fetch, iframe)은 쿠키로 지나간다. 페이지 스크립트의 요청 머리는 바꾸지 않는다(CORS를 흐리지 않는다).
export async function launchChrome({ bypassSecret = '', bypassHosts = new Set() } = {}) {
  const profile = mkdtempSync(path.join(tmpdir(), 'library-smoke-chrome-'));
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let target;
  for (let attempt = 0; attempt < 75 && !target; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((item) => item.type === 'page');
    } catch {
      // Chrome이 아직 뜨지 않았다
    }
    if (!target) await sleep(200);
  }
  if (!target) {
    chrome.kill();
    rmSync(profile, { recursive: true, force: true });
    throw new Error('헤드리스 Chrome에 붙지 못했다');
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const page = new CdpPage(socket, chrome, profile);
  await page.send('Page.enable');
  page.mainFrameId = (await page.send('Page.getFrameTree')).frameTree.frame.id;
  await page.send('Network.enable');
  await page.send('Runtime.enable');
  if (bypassSecret) await page.enableBypass(bypassSecret, bypassHosts);
  return page;
}

class CdpPage {
  constructor(socket, chrome, profile) {
    this.socket = socket;
    this.chrome = chrome;
    this.profile = profile;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.mainDocumentStatus = null;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
    // 맨 위 문서 응답의 상태 (마지막 것)
    this.on('Network.responseReceived', (params) => {
      if (params.type === 'Document' && params.frameId === this.mainFrameId) this.mainDocumentStatus = params.response.status;
    });
  }

  send(method, params = {}) {
    const id = (this.nextId += 1);
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, listener) {
    const list = this.listeners.get(method) ?? [];
    list.push(listener);
    this.listeners.set(method, list);
  }

  // 대상 호스트의 문서 요청에 우회 머리를 싣는다 (launchChrome 설명)
  async enableBypass(secret, hosts) {
    const cookieSet = new Set();
    this.on('Fetch.requestPaused', async (params) => {
      let host = '';
      try {
        host = new URL(params.request.url).host;
      } catch {
        host = '';
      }
      const headers = Object.entries(params.request.headers).map(([name, value]) => ({ name, value }));
      if (hosts.has(host)) {
        headers.push({ name: BYPASS_HEADER, value: secret });
        if (!cookieSet.has(host)) {
          cookieSet.add(host);
          headers.push({ name: BYPASS_COOKIE_HEADER, value: 'true' });
        }
      }
      await this.send('Fetch.continueRequest', { requestId: params.requestId, headers }).catch(() => undefined);
    });
    await this.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
  }

  // 창 크기와 미디어 흉내: 밝은 화면, 움직임 줄이기(문서의 나타나기 효과를 끈다 — 원본과 문서 출처가 같게 그려진다)
  async setViewport(width, height = 900) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await this.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
  }

  async setCookie(cookie) {
    const result = await this.send('Network.setCookie', cookie);
    if (!result.success) throw new Error(`쿠키를 넣지 못했다: ${cookie.name}`);
  }

  // 주소를 열고 load를 기다린다. 마지막 주소와 맨 위 문서의 상태를 돌려준다
  async navigate(url, timeoutMs = 30_000) {
    this.mainDocumentStatus = null;
    let loaded = false;
    const onLoad = () => {
      loaded = true;
    };
    this.on('Page.loadEventFired', onLoad);
    const { errorText } = await this.send('Page.navigate', { url });
    if (errorText) throw new Error(`열기 실패: ${errorText} (${url})`);
    const deadline = Date.now() + timeoutMs;
    while (!loaded && Date.now() < deadline) await sleep(100);
    this.listeners.set('Page.loadEventFired', (this.listeners.get('Page.loadEventFired') ?? []).filter((item) => item !== onLoad));
    const href = await this.evaluate('location.href');
    return { loaded, href, status: this.mainDocumentStatus };
  }

  // 식을 계산한다 (Promise면 기다린다)
  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`계산 실패: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    return result.result.value;
  }

  // 조건이 참이 될 때까지 기다린다
  async waitFor(expression, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.evaluate(expression).catch(() => false)) return true;
      await sleep(250);
    }
    return false;
  }

  // 전체 쪽 캡처 (높이는 maxHeight에서 자른다). PNG 바이트와 쪽 높이를 돌려준다
  async screenshotFull(maxHeight = 12_000) {
    const metrics = await this.send('Page.getLayoutMetrics');
    const size = metrics.cssContentSize ?? metrics.contentSize;
    const width = Math.ceil(metrics.cssLayoutViewport?.clientWidth ?? size.width);
    const fullHeight = Math.ceil(size.height);
    const height = Math.min(fullHeight, maxHeight);
    const shot = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    return { png: Buffer.from(shot.data, 'base64'), width, height, fullHeight };
  }

  async close() {
    try {
      this.socket.close();
    } catch {
      // 이미 닫혔다
    }
    this.chrome.kill();
    await sleep(300);
    rmSync(this.profile, { recursive: true, force: true });
  }
}
