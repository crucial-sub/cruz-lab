// 문서 출처 응답 (서가 1단계 T5, Plan J4·J5·J9·J11·J12)
// - 문서 출처 호스트(raw.cruzlab.dev)의 모든 요청은 여기로만 온다(미들웨어 분기). 관리자 쿠키를 읽지 않는다.
// - 경로는 모두 /d/ 아래다(사용자 결정 2026-11-17, host.ts의 RAW_PATH_PREFIX).
// - /d/_open?t={입장권}: 입장권을 확인하고 문서 쿠키(Path=/d/{문서 id}/, 12시간)를 준 뒤 /d/{문서 id}/index.html로 302.
//   &pixel=1이면 302 대신 1px 그림을 준다(md 뷰어가 상대 이미지보다 먼저 불러 쿠키를 받는다, J12).
// - /d/{문서 id}/{파일 경로}: 문서 쿠키가 맞으면 지금 판의 파일을 스트리밍으로 준다. 영상·소리는 저장소 서명 주소(10분)로 302.
//   html 판에 없는 파일은 md 판에서 찾는다(md 뷰어의 상대 이미지).
// - J5: 문서를 열 수 없으면 모든 경로에 같은 404를 준다. 어떤 문서가 있는지 드러내지 않는다.
// - 저장소 접근은 RawDeps로 받는다. 운영은 createRawDeps(), 단위 테스트는 가짜를 쓴다.
// - 서가 2단계 J47: 공유 입장권(공유 주소 페이지가 만든다)이면 공유 쿠키(cruz_share)를 준다. 수명은 12시간과 남은 공유 기간 중
//   짧은 쪽이다. 공유 쿠키로 파일을 열 때마다 공유가 살아 있는지와 문서가 범위 안인지 본다(checkShare, 메모리 60초).
//   그래서 끈 공유는 1분 안에 막힌다(C11). 공유 스위치(LIBRARY_SHARE_ENABLED)가 꺼지면 공유 입장권·쿠키는 모두 404다(J50).
// - 서가 2단계 T12(사용자 결정 2026-11-20):
//   공유 쿠키로 준 파일은 Cache-Control: private, no-store이고 ETag가 없다. 친구 기기 캐시에 사본을 남기지 않는다.
//   공유 쿠키가 실린 요청의 404에는 "서가에서 다시 열기"(관리자 로그인 화면으로 간다)가 없다(C12).
//   영상·소리의 서명 주소(10분)는 그대로 둔다. 끈 뒤에도 이미 재생을 시작한 파일 하나가 최대 10분 열린다(알려진 한계).

import { Readable } from 'node:stream';
import { memoize } from '@/lib/server/memo-cache';
import { RAW_PATH_PREFIX, blogOriginForDocHost, rawDocPath } from '../host';
import { normalizeDocPath } from '../rules';
import { isLibraryShareEnabled } from '../host';
import { shareCookieTtlSec } from '../share';
import {
  DOC_COOKIE_NAME,
  SHARE_COOKIE_NAME,
  assertSecret,
  createDocCookie,
  createShareCookie,
  docCookieHeader,
  isDocId,
  readCookieValues,
  shareCookieHeader,
  verifyDocCookie,
  verifyShareCookie,
  verifyShareTicket,
  verifyTicket,
} from '../ticket';
import { checkShareAccess, type ShareAccess } from './shares';
import {
  getLibraryBucket,
  getLibraryDoc,
  getRevision,
  objectPath,
  rawStateKey,
  type LibraryDoc,
  type Revision,
} from './store';

// ---------- 의존성 ----------

export interface RawFileMeta {
  contentType: string;
  bytes: number;
  sha256: string;
}

// 문서 하나의 지금 판들 (형식별 판 번호와 파일 목록)
export interface RawDocState {
  html?: { rev: number; files: ReadonlyMap<string, RawFileMeta> };
  md?: { rev: number; files: ReadonlyMap<string, RawFileMeta> };
}

export interface RawDeps {
  now(): number;
  secret: string;
  siteOrigin: string; // 404 화면의 "서가에서 다시 열기"가 가는 블로그 출처
  forceSecure?: boolean; // 참이면 요청이 http여도 쿠키에 Secure를 붙인다(운영)
  loadDoc(docId: string): Promise<RawDocState | null>;
  openFile(docId: string, rev: number, path: string): Promise<ReadableStream<Uint8Array>>;
  signedReadUrl(docId: string, rev: number, path: string): Promise<string>;
  // 공유 스위치 (LIBRARY_SHARE_ENABLED, 서가 2단계 J50). 없거나 거짓이면 공유 입장권·공유 쿠키를 받지 않는다
  shareEnabled?: boolean;
  // 공유가 살아 있고 문서가 그 범위 안이면 끝나는 시각. 아니면 null (서가 2단계 J47, 운영은 메모리 60초)
  checkShare?(shareId: string, docId: string): Promise<ShareAccess | null>;
}

// 영상 서명 주소 수명 10분 (J11)
export const MEDIA_URL_TTL_MS = 10 * 60 * 1000;
// 판 정보 메모리 캐시 5초 (다시 올린 내용이 곧 보이게 짧게 둔다. 마무리·내리기는 store가 바로 비운다)
const RAW_STATE_TTL_MS = 5_000;

// ---------- 응답 ----------

const SECURITY_HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
};

// 1x1 투명 gif
const PIXEL_GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0));

// 문서 출처의 404 화면 (J5). 본문이 모든 경로에서 같다
// - shareViewer(요청에 공유 쿠키가 실림, T12 의견 1): 공유로 읽는 사람의 화면. 관리자 주소로 가는 단추를 빼고
//   "공유한 사람에게 새 주소를 받습니다"를 쓴다(C12). 쿠키 이름으로만 가른다. 그래서 어떤 공유·문서가 있는지 드러나지 않는다.
export function rawNotFoundResponse(siteOrigin: string, options: { shareViewer?: boolean } = {}): Response {
  const home = `${siteOrigin.replace(/\/$/, '')}/admin/library`;
  const message = options.shareViewer
    ? '<p>주소가 틀렸거나 공유가 끝났습니다. 공유한 사람에게 새 주소를 받습니다.</p>'
    : `<p>주소가 틀렸거나 열람 시간이 끝났습니다.</p><a href="${home}">서가에서 다시 열기</a>`;
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>문서를 열 수 없습니다</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:48px 20px;text-align:center;color:#1d1d1f;background:#fafafa}@media (prefers-color-scheme:dark){body{color:#f5f5f7;background:#111}}a{display:inline-block;margin-top:16px;padding:12px 18px;background:#0a64d8;color:#fff;border-radius:10px;text-decoration:none;font-weight:600}</style></head>
<body><h1>문서를 열 수 없습니다</h1>${message}</body></html>`;
  return new Response(body, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      ...SECURITY_HEADERS,
      // 배포 환경의 Astro는 미들웨어가 돌려준 404를 사이트 404 화면(/404.html)으로 바꿔 그린다.
      // 이 표시가 있으면 그대로 보낸다(Astro가 엔드포인트 응답에 붙이는 것과 같은 표시. Astro가 보내기 전에 지운다).
      'X-Astro-Reroute': 'no',
    },
  });
}

// 서가가 꺼져 있거나 없는 서가 경로 (C5: 서가의 모든 주소가 404)
export function libraryOffResponse(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  });
}

// 문서 출처 설정 오류 (설정 문제를 404로 숨기지 않는다)
export function rawMisconfiguredResponse(): Response {
  return new Response('문서 출처 설정 오류', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

// ---------- 처리기 ----------

// 경로 안 파일을 지금 판에서 찾는다 (html 판 먼저, 없으면 md 판)
function findFile(state: RawDocState, path: string): { rev: number; meta: RawFileMeta } | null {
  for (const format of [state.html, state.md]) {
    const meta = format?.files.get(path);
    if (format && meta) return { rev: format.rev, meta };
  }
  return null;
}

// 공유를 물어도 되는가: 스위치가 켜져 있고 묻는 함수가 있다
function shareOn(deps: RawDeps): deps is RawDeps & { checkShare: NonNullable<RawDeps['checkShare']> } {
  return Boolean(deps.shareEnabled) && typeof deps.checkShare === 'function';
}

// 입장권 → 쿠키 머리. 관리자 입장권이면 문서 쿠키, 공유 입장권이면 공유 쿠키. 틀리면 null
async function cookieForTicket(url: URL, deps: RawDeps): Promise<{ docId: string; cookie: string } | null> {
  const token = url.searchParams.get('t');
  const secure = Boolean(deps.forceSecure) || url.protocol === 'https:';
  const adminDocId = verifyTicket(token, deps.now(), deps.secret);
  if (adminDocId) {
    return { docId: adminDocId, cookie: docCookieHeader(adminDocId, createDocCookie(adminDocId, deps.now(), deps.secret), { secure }) };
  }
  if (!shareOn(deps)) return null;
  const share = verifyShareTicket(token, deps.now(), deps.secret);
  if (!share) return null;
  const access = await deps.checkShare(share.shareId, share.docId);
  if (!access) return null;
  const ttl = shareCookieTtlSec(access.expiresAtMs, deps.now());
  if (ttl <= 0) return null;
  const value = createShareCookie(share.docId, share.shareId, deps.now(), deps.secret, ttl);
  return { docId: share.docId, cookie: shareCookieHeader(share.docId, value, { secure, maxAgeSec: ttl }) };
}

// /d/_open: 입장권 → 문서 쿠키(관리자) 또는 공유 쿠키(공유 주소)
async function openWithTicket(url: URL, deps: RawDeps, notFound: () => Response): Promise<Response> {
  const issued = await cookieForTicket(url, deps);
  if (!issued) return notFound();
  const { docId, cookie } = issued;
  const state = await deps.loadDoc(docId);
  if (!state || (!state.html && !state.md)) return notFound();

  const common = { 'Set-Cookie': cookie, 'Cache-Control': 'private, no-store', ...SECURITY_HEADERS };
  if (url.searchParams.get('pixel') === '1') {
    return new Response(PIXEL_GIF, { status: 200, headers: { ...common, 'Content-Type': 'image/gif' } });
  }
  return new Response(null, { status: 302, headers: { ...common, Location: rawDocPath(docId) } });
}

// 요청 쿠키가 이 문서를 열게 하는가. 열면 어느 쿠키로 열었는지('admin' | 'share'), 아니면 null
// - 관리자 문서 쿠키가 맞으면 바로 연다(공유를 묻지 않는다)
// - 공유 쿠키가 맞으면 공유가 살아 있고 문서가 범위 안인지 묻는다(J47). 쿠키가 여럿이면 하나라도 통하면 연다
async function cookieAllows(request: Request, docId: string, deps: RawDeps): Promise<'admin' | 'share' | null> {
  const header = request.headers.get('cookie');
  if (readCookieValues(header, DOC_COOKIE_NAME).some((value) => verifyDocCookie(value, docId, deps.now(), deps.secret))) return 'admin';
  if (!shareOn(deps)) return null;
  for (const value of readCookieValues(header, SHARE_COOKIE_NAME)) {
    const shareId = verifyShareCookie(value, docId, deps.now(), deps.secret);
    if (shareId && (await deps.checkShare(shareId, docId))) return 'share';
  }
  return null;
}

// 요청에 공유 쿠키가 실렸는가 (서명은 보지 않는다. 404 화면을 고를 때만 쓴다, T12 의견 1)
function carriesShareCookie(request: Request): boolean {
  return readCookieValues(request.headers.get('cookie'), SHARE_COOKIE_NAME).length > 0;
}

// 문서 출처 요청 하나를 처리한다
export async function handleRawRequest(request: Request, deps: RawDeps): Promise<Response> {
  const notFound = () => rawNotFoundResponse(deps.siteOrigin, { shareViewer: carriesShareCookie(request) });
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return notFound();
  const url = new URL(request.url);
  if (url.pathname === `${RAW_PATH_PREFIX}/_open`) return openWithTicket(url, deps, notFound);
  if (!url.pathname.startsWith(`${RAW_PATH_PREFIX}/`)) return notFound();

  const match = url.pathname.slice(RAW_PATH_PREFIX.length).match(/^\/([^/]+)\/(.*)$/);
  if (!match || !isDocId(match[1])) return notFound();
  const docId = match[1];

  const via = await cookieAllows(request, docId, deps);
  if (!via) return notFound();

  let rawPath: string;
  try {
    rawPath = decodeURIComponent(match[2]);
  } catch {
    return notFound();
  }
  if (rawPath === '' || rawPath.endsWith('/')) rawPath += 'index.html';
  const path = normalizeDocPath(rawPath);
  if (!path) return notFound();

  const state = await deps.loadDoc(docId);
  const found = state ? findFile(state, path) : null;
  if (!found) return notFound();
  const { rev, meta } = found;

  // 영상·소리: iOS Safari는 범위 요청(206)으로만 재생한다. 저장소가 직접 범위 요청을 받게 넘긴다
  if (meta.contentType.startsWith('video/') || meta.contentType.startsWith('audio/')) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: await deps.signedReadUrl(docId, rev, path),
        'Cache-Control': 'private, no-store',
        ...SECURITY_HEADERS,
      },
    });
  }

  // 관리자: 판 번호 + 파일 해시 ETag (J9). 다시 올리면 바뀐다. 다시 열 때 304로 몸통을 아낀다
  // 공유: 친구 기기 캐시에 사본을 남기지 않는다(no-store). ETag도 304도 없다(T12 의견 3)
  const etag = `"r${rev}-${meta.sha256.slice(0, 16)}"`;
  const headers: Record<string, string> =
    via === 'admin'
      ? { 'Content-Type': meta.contentType, 'Cache-Control': 'private, no-cache', ETag: etag, ...SECURITY_HEADERS }
      : { 'Content-Type': meta.contentType, 'Cache-Control': 'private, no-store', ...SECURITY_HEADERS };
  if (via === 'admin' && request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  const withLength = { ...headers, 'Content-Length': String(meta.bytes) };
  if (method === 'HEAD') return new Response(null, { status: 200, headers: withLength });

  let body: ReadableStream<Uint8Array>;
  try {
    body = await deps.openFile(docId, rev, path);
  } catch (error) {
    console.error(`[library] 문서 파일 열기 실패: ${docId}/${rev}/${path}`, error);
    return notFound();
  }
  return new Response(body, { status: 200, headers: withLength });
}

// ---------- 운영 의존성 ----------

// 판 정보를 읽는 저장소 함수 (운영은 store.ts, 단위 테스트는 가짜)
export interface RawStateLoaders {
  getDoc(docId: string): Promise<LibraryDoc | null>;
  getRevision(docId: string, rev: number): Promise<Revision | null>;
}

// 문서를 읽는 최대 횟수 (처음 한 번 + 다시 읽기 두 번)
const RAW_STATE_ATTEMPTS = 3;

// 문서의 지금 판들을 읽는다
// - 문서가 가리킨 판이 없거나 준비 전이면 문서를 다시 읽는다. 읽는 사이 마무리(finalizeUpload)가 새 판을 켜고
//   앞 판을 지웠을 수 있다(PR #35 리뷰). 마지막 시도에서는 읽은 형식만 준다. 문서가 없으면 null이다.
export async function loadRawDocStateWith(loaders: RawStateLoaders, docId: string): Promise<RawDocState | null> {
  for (let attempt = 1; attempt <= RAW_STATE_ATTEMPTS; attempt += 1) {
    const doc = await loaders.getDoc(docId);
    if (!doc) return null;
    const state: RawDocState = {};
    let stale = false;
    for (const format of ['html', 'md'] as const) {
      const current = doc.formats[format];
      if (!current) continue;
      const revision = await loaders.getRevision(docId, current.rev);
      if (!revision || revision.status !== 'ready') {
        stale = true;
        continue;
      }
      state[format] = {
        rev: current.rev,
        files: new Map(revision.files.map((file) => [file.path, { contentType: file.contentType, bytes: file.bytes, sha256: file.sha256 }])),
      };
    }
    if (!stale || attempt === RAW_STATE_ATTEMPTS) return state.html || state.md ? state : null;
  }
  return null;
}

// 저장소 파일 흐름의 첫 조각을 먼저 읽는다
// - 파일이 없으면 오류가 첫 읽기에서 난다. 여기서 던져야 처리기가 404를 준다.
//   그렇지 않으면 200을 보낸 뒤 본문이 끊긴다(PR #35 리뷰).
// - 돌려준 흐름은 읽은 첫 조각을 내보낸 뒤 나머지를 그대로 넘긴다. 받는 쪽이 취소하면 원래 흐름도 취소한다.
export async function primeStream(stream: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  const reader = stream.getReader();
  const first = await reader.read();
  let pending: Uint8Array | null = first.done ? null : first.value;
  let finished = first.done;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (pending) {
        controller.enqueue(pending);
        pending = null;
        return;
      }
      if (finished) {
        controller.close();
        return;
      }
      const next = await reader.read();
      if (next.done) {
        finished = true;
        controller.close();
      } else {
        controller.enqueue(next.value);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

// 문서 출처 요청의 블로그 출처 (규칙은 host.ts의 blogOriginForDocHost)
// - 운영: astro.config의 site(https://www.cruzlab.dev)
// - 미리보기: raw-preview.cruzlab.dev → https://preview.cruzlab.dev
// - 개발: raw.localhost:4321 → http://localhost:4321
export function siteOriginForRaw(requestUrl: URL): string {
  return blogOriginForDocHost(requestUrl.host, {
    dev: Boolean(import.meta.env.DEV),
    protocol: requestUrl.protocol,
    site: String(import.meta.env.SITE ?? ''),
  });
}

// 운영 의존성을 만든다. 비밀값이 없으면 던진다
export function createRawDeps(requestUrl: URL): RawDeps {
  return {
    now: () => Date.now(),
    secret: assertSecret(import.meta.env.LIBRARY_TICKET_SECRET),
    siteOrigin: siteOriginForRaw(requestUrl),
    forceSecure: !import.meta.env.DEV,
    shareEnabled: isLibraryShareEnabled(import.meta.env.LIBRARY_SHARE_ENABLED),
    checkShare: checkShareAccess,
    loadDoc: (docId) =>
      memoize(rawStateKey(docId), () => loadRawDocStateWith({ getDoc: getLibraryDoc, getRevision }, docId), RAW_STATE_TTL_MS),
    openFile: async (docId, rev, path) => {
      const stream = getLibraryBucket().file(objectPath(docId, rev, path)).createReadStream();
      return primeStream(Readable.toWeb(stream) as ReadableStream<Uint8Array>);
    },
    signedReadUrl: async (docId, rev, path) => {
      const [url] = await getLibraryBucket()
        .file(objectPath(docId, rev, path))
        .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + MEDIA_URL_TTL_MS });
      return url;
    },
  };
}
