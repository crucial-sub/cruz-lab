// 문서 출처 응답 (서가 1단계 T5, Plan J4·J5·J9·J11·J12)
// - 문서 출처 호스트(raw.cruzlab.dev)의 모든 요청은 여기로만 온다(미들웨어 분기). 관리자 쿠키를 읽지 않는다.
// - /_open?t={입장권}: 입장권을 확인하고 문서 쿠키(Path=/{문서 id}/, 12시간)를 준 뒤 /{문서 id}/index.html로 302.
//   &pixel=1이면 302 대신 1px 그림을 준다(md 뷰어가 상대 이미지보다 먼저 불러 쿠키를 받는다, J12).
// - /{문서 id}/{파일 경로}: 문서 쿠키가 맞으면 지금 판의 파일을 스트리밍으로 준다. 영상·소리는 저장소 서명 주소(10분)로 302.
//   html 판에 없는 파일은 md 판에서 찾는다(md 뷰어의 상대 이미지).
// - J5: 문서를 열 수 없으면 모든 경로에 같은 404를 준다. 어떤 문서가 있는지 드러내지 않는다.
// - 저장소 접근은 RawDeps로 받는다. 운영은 createRawDeps(), 단위 테스트는 가짜를 쓴다.

import { Readable } from 'node:stream';
import { memoize } from '@/lib/server/memo-cache';
import { normalizeDocPath } from '../rules';
import {
  DOC_COOKIE_NAME,
  assertSecret,
  createDocCookie,
  docCookieHeader,
  isDocId,
  readCookieValues,
  verifyDocCookie,
  verifyTicket,
} from '../ticket';
import { getLibraryBucket, getLibraryDoc, getRevision, objectPath, rawStateKey } from './store';

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
export function rawNotFoundResponse(siteOrigin: string): Response {
  const home = `${siteOrigin.replace(/\/$/, '')}/admin/library`;
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>문서를 열 수 없습니다</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:48px 20px;text-align:center;color:#1d1d1f;background:#fafafa}@media (prefers-color-scheme:dark){body{color:#f5f5f7;background:#111}}a{display:inline-block;margin-top:16px;padding:12px 18px;background:#0a64d8;color:#fff;border-radius:10px;text-decoration:none;font-weight:600}</style></head>
<body><h1>문서를 열 수 없습니다</h1><p>주소가 틀렸거나 열람 시간이 끝났습니다.</p><a href="${home}">서가에서 다시 열기</a></body></html>`;
  return new Response(body, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', ...SECURITY_HEADERS },
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

// /_open: 입장권 → 문서 쿠키
async function openWithTicket(url: URL, deps: RawDeps): Promise<Response> {
  const docId = verifyTicket(url.searchParams.get('t'), deps.now(), deps.secret);
  if (!docId) return rawNotFoundResponse(deps.siteOrigin);
  const state = await deps.loadDoc(docId);
  if (!state || (!state.html && !state.md)) return rawNotFoundResponse(deps.siteOrigin);

  const cookie = docCookieHeader(docId, createDocCookie(docId, deps.now(), deps.secret), {
    secure: Boolean(deps.forceSecure) || url.protocol === 'https:',
  });
  const common = { 'Set-Cookie': cookie, 'Cache-Control': 'private, no-store', ...SECURITY_HEADERS };
  if (url.searchParams.get('pixel') === '1') {
    return new Response(PIXEL_GIF, { status: 200, headers: { ...common, 'Content-Type': 'image/gif' } });
  }
  return new Response(null, { status: 302, headers: { ...common, Location: `/${docId}/index.html` } });
}

// 문서 출처 요청 하나를 처리한다
export async function handleRawRequest(request: Request, deps: RawDeps): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return rawNotFoundResponse(deps.siteOrigin);
  const url = new URL(request.url);
  if (url.pathname === '/_open') return openWithTicket(url, deps);

  const match = url.pathname.match(/^\/([^/]+)\/(.*)$/);
  if (!match || !isDocId(match[1])) return rawNotFoundResponse(deps.siteOrigin);
  const docId = match[1];

  const cookies = readCookieValues(request.headers.get('cookie'), DOC_COOKIE_NAME);
  if (!cookies.some((value) => verifyDocCookie(value, docId, deps.now(), deps.secret))) {
    return rawNotFoundResponse(deps.siteOrigin);
  }

  let rawPath: string;
  try {
    rawPath = decodeURIComponent(match[2]);
  } catch {
    return rawNotFoundResponse(deps.siteOrigin);
  }
  if (rawPath === '' || rawPath.endsWith('/')) rawPath += 'index.html';
  const path = normalizeDocPath(rawPath);
  if (!path) return rawNotFoundResponse(deps.siteOrigin);

  const state = await deps.loadDoc(docId);
  const found = state ? findFile(state, path) : null;
  if (!found) return rawNotFoundResponse(deps.siteOrigin);
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

  // 판 번호 + 파일 해시 (J9). 다시 올리면 바뀐다
  const etag = `"r${rev}-${meta.sha256.slice(0, 16)}"`;
  const headers = {
    'Content-Type': meta.contentType,
    'Cache-Control': 'private, no-cache',
    ETag: etag,
    ...SECURITY_HEADERS,
  };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  const withLength = { ...headers, 'Content-Length': String(meta.bytes) };
  if (method === 'HEAD') return new Response(null, { status: 200, headers: withLength });

  let body: ReadableStream<Uint8Array>;
  try {
    body = await deps.openFile(docId, rev, path);
  } catch (error) {
    console.error(`[library] 문서 파일 열기 실패: ${docId}/${rev}/${path}`, error);
    return rawNotFoundResponse(deps.siteOrigin);
  }
  return new Response(body, { status: 200, headers: withLength });
}

// ---------- 운영 의존성 ----------

// Firestore에서 문서의 지금 판들을 읽는다
async function loadRawDocState(docId: string): Promise<RawDocState | null> {
  const doc = await getLibraryDoc(docId);
  if (!doc) return null;
  const state: RawDocState = {};
  for (const format of ['html', 'md'] as const) {
    const current = doc.formats[format];
    if (!current) continue;
    const revision = await getRevision(docId, current.rev);
    if (!revision || revision.status !== 'ready') continue;
    state[format] = {
      rev: current.rev,
      files: new Map(revision.files.map((file) => [file.path, { contentType: file.contentType, bytes: file.bytes, sha256: file.sha256 }])),
    };
  }
  return state.html || state.md ? state : null;
}

// 문서 출처 요청의 블로그 출처
// - 운영: astro.config의 site(https://www.cruzlab.dev)
// - 개발: 문서 출처 호스트에서 'raw.'를 뗀 주소(raw.localhost:4321 → localhost:4321)
export function siteOriginForRaw(requestUrl: URL): string {
  if (import.meta.env.DEV) return `${requestUrl.protocol}//${requestUrl.host.replace(/^raw\./, '')}`;
  return String(import.meta.env.SITE ?? '').replace(/\/$/, '');
}

// 운영 의존성을 만든다. 비밀값이 없으면 던진다
export function createRawDeps(requestUrl: URL): RawDeps {
  return {
    now: () => Date.now(),
    secret: assertSecret(import.meta.env.LIBRARY_TICKET_SECRET),
    siteOrigin: siteOriginForRaw(requestUrl),
    forceSecure: !import.meta.env.DEV,
    loadDoc: (docId) => memoize(rawStateKey(docId), () => loadRawDocState(docId), RAW_STATE_TTL_MS),
    openFile: async (docId, rev, path) => {
      const stream = getLibraryBucket().file(objectPath(docId, rev, path)).createReadStream();
      return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
    },
    signedReadUrl: async (docId, rev, path) => {
      const [url] = await getLibraryBucket()
        .file(objectPath(docId, rev, path))
        .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + MEDIA_URL_TTL_MS });
      return url;
    },
  };
}
