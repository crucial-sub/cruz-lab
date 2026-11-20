// 입장권·문서 쿠키 값의 서명과 검증, 서가 토큰 확인, 문서 id 만들기 (서가 1단계 T3·T4, Plan J4·J5·J16)
// - 입장권: 서가 화면이 만든다. 1분. 문서 출처의 /_open?t= 로 한 번 건넌다.
// - 문서 쿠키: 문서 출처가 입장권을 확인하고 준다. 12시간. Path=/d/{문서 id}/ 라서 그 문서에만 실린다.
// - 값의 꼴: {문서 id}.{만료 초}.{서명}. 서명 = HMAC-SHA256(비밀값, "{용도}|v1|{문서 id}|{만료 초}")
//   용도(ticket / cookie)를 서명에 넣어 입장권을 쿠키로, 쿠키를 입장권으로 쓰지 못하게 한다.
// - 서버(Node)에서만 쓴다(node:crypto). 저장소·네트워크 I/O는 없다.
// - 서가 2단계 J47: 공유 입장권·공유 쿠키. 값의 꼴은 {문서 id}.{만료 초}.{공유 id}.{서명}이고,
//   서명 = HMAC-SHA256(비밀값, "{용도}|v1|{문서 id}|{만료 초}|{공유 id}")다. 용도(share-ticket / share-cookie)가 달라
//   관리자 입장권·문서 쿠키와 섞이지 않는다. 공유 쿠키는 이름(cruz_share)도 달라 관리자 문서 쿠키를 덮지 않는다.
// - smoke:library(scripts/smoke/library-private.mjs)가 빌드 없이 Node로 가져온다. 그래서 상대 가져오기에 .ts를 붙인다
//   (tests/library/node-load.test.ts).

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { RAW_PATH_PREFIX } from './host.ts';
import { DOC_COOKIE_TTL_SEC, isDocId, isShareId } from './ids.ts';

// id 꼴 검사와 문서 쿠키 수명은 ids.ts에 있다(화면 스크립트도 쓴다). 여기서 다시 내보낸다
export { DOC_COOKIE_TTL_SEC, isDocId, isShareId };

export const TICKET_TTL_SEC = 60;
export const DOC_COOKIE_NAME = 'cruz_doc';
// 비밀값 최소 길이 (환경 변수 LIBRARY_TICKET_SECRET)
export const MIN_SECRET_LENGTH = 32;

// 공유 쿠키 이름 (서가 2단계 J47). 관리자 문서 쿠키(cruz_doc)와 이름이 달라 서로 덮지 않는다
export const SHARE_COOKIE_NAME = 'cruz_share';

type Purpose = 'ticket' | 'cookie';
type SharePurpose = 'share-ticket' | 'share-cookie';


// 비밀값을 확인한다. 없거나 짧으면 던진다(설정 문제를 인증 실패로 숨기지 않는다)
export function assertSecret(secret: string | undefined): string {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`LIBRARY_TICKET_SECRET은 ${MIN_SECRET_LENGTH}자 이상이어야 합니다.`);
  }
  return secret;
}

function signature(purpose: Purpose, docId: string, expSec: number, secret: string): string {
  return createHmac('sha256', secret).update(`${purpose}|v1|${docId}|${expSec}`).digest('base64url');
}

function issue(purpose: Purpose, docId: string, nowMs: number, secret: string, ttlSec: number): string {
  if (!isDocId(docId)) throw new Error('문서 id 꼴이 틀렸습니다.');
  const expSec = Math.floor(nowMs / 1000) + ttlSec;
  return `${docId}.${expSec}.${signature(purpose, docId, expSec, assertSecret(secret))}`;
}

// 값을 확인한다. 맞으면 문서 id, 틀리거나 만료면 null
function check(purpose: Purpose, value: string | null | undefined, nowMs: number, secret: string): string | null {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [docId, expText, sig] = parts;
  if (!isDocId(docId) || !/^\d{1,12}$/.test(expText)) return null;
  const expSec = Number(expText);
  if (expSec * 1000 < nowMs) return null;
  const want = Buffer.from(signature(purpose, docId, expSec, assertSecret(secret)));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return docId;
}

// 입장권을 만든다 (1분)
export function createTicket(docId: string, nowMs: number, secret: string): string {
  return issue('ticket', docId, nowMs, secret, TICKET_TTL_SEC);
}

// 입장권을 확인한다. 맞으면 문서 id
export function verifyTicket(token: string | null | undefined, nowMs: number, secret: string): string | null {
  return check('ticket', token, nowMs, secret);
}

// 문서 쿠키 값을 만든다 (기본 12시간)
export function createDocCookie(docId: string, nowMs: number, secret: string, ttlSec = DOC_COOKIE_TTL_SEC): string {
  return issue('cookie', docId, nowMs, secret, ttlSec);
}

// 문서 쿠키 값이 이 문서에 맞는지 확인한다
export function verifyDocCookie(value: string | null | undefined, docId: string, nowMs: number, secret: string): boolean {
  return check('cookie', value, nowMs, secret) === docId;
}

// 문서 쿠키의 Set-Cookie 값 (호스트 전용: Domain을 쓰지 않는다)
export function docCookieHeader(docId: string, value: string, options: { secure: boolean; maxAgeSec?: number }): string {
  const maxAge = options.maxAgeSec ?? DOC_COOKIE_TTL_SEC;
  const secure = options.secure ? '; Secure' : '';
  return `${DOC_COOKIE_NAME}=${value}; Path=${RAW_PATH_PREFIX}/${docId}/; Max-Age=${maxAge}; HttpOnly${secure}; SameSite=Lax`;
}

// ---------- 공유 입장권·공유 쿠키 (서가 2단계 J47) ----------

function shareSignature(purpose: SharePurpose, docId: string, expSec: number, shareId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${purpose}|v1|${docId}|${expSec}|${shareId}`).digest('base64url');
}

function issueShare(purpose: SharePurpose, docId: string, shareId: string, nowMs: number, secret: string, ttlSec: number): string {
  if (!isDocId(docId)) throw new Error('문서 id 꼴이 틀렸습니다.');
  if (!isShareId(shareId)) throw new Error('공유 id 꼴이 틀렸습니다.');
  const expSec = Math.floor(nowMs / 1000) + ttlSec;
  return `${docId}.${expSec}.${shareId}.${shareSignature(purpose, docId, expSec, shareId, assertSecret(secret))}`;
}

// 공유 값을 확인한다. 맞으면 { 문서 id, 공유 id }, 틀리거나 만료면 null
function checkShare(
  purpose: SharePurpose,
  value: string | null | undefined,
  nowMs: number,
  secret: string,
): { docId: string; shareId: string } | null {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const [docId, expText, shareId, sig] = parts;
  if (!isDocId(docId) || !isShareId(shareId) || !/^\d{1,12}$/.test(expText)) return null;
  const expSec = Number(expText);
  if (expSec * 1000 < nowMs) return null;
  const want = Buffer.from(shareSignature(purpose, docId, expSec, shareId, assertSecret(secret)));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { docId, shareId };
}

// 공유 입장권을 만든다 (1분). 공유 주소 페이지가 만들어 문서 출처의 /d/_open?t= 로 보낸다
export function createShareTicket(docId: string, shareId: string, nowMs: number, secret: string): string {
  return issueShare('share-ticket', docId, shareId, nowMs, secret, TICKET_TTL_SEC);
}

// 공유 입장권을 확인한다
export function verifyShareTicket(
  token: string | null | undefined,
  nowMs: number,
  secret: string,
): { docId: string; shareId: string } | null {
  return checkShare('share-ticket', token, nowMs, secret);
}

// 공유 쿠키 값을 만든다. 수명은 부르는 쪽이 정한다(12시간과 남은 공유 기간 중 짧은 쪽, share.ts shareCookieTtlSec)
export function createShareCookie(docId: string, shareId: string, nowMs: number, secret: string, ttlSec: number): string {
  return issueShare('share-cookie', docId, shareId, nowMs, secret, ttlSec);
}

// 공유 쿠키 값이 이 문서에 맞으면 공유 id. 아니면 null
// - 공유가 살아 있는지와 문서가 범위 안인지는 문서 출처가 따로 본다(raw.ts, 메모리 60초)
export function verifyShareCookie(value: string | null | undefined, docId: string, nowMs: number, secret: string): string | null {
  const checked = checkShare('share-cookie', value, nowMs, secret);
  return checked?.docId === docId ? checked.shareId : null;
}

// 공유 쿠키의 Set-Cookie 값 (문서 쿠키와 같은 속성. 이름만 다르다)
export function shareCookieHeader(docId: string, value: string, options: { secure: boolean; maxAgeSec: number }): string {
  const secure = options.secure ? '; Secure' : '';
  return `${SHARE_COOKIE_NAME}=${value}; Path=${RAW_PATH_PREFIX}/${docId}/; Max-Age=${options.maxAgeSec}; HttpOnly${secure}; SameSite=Lax`;
}

// Cookie 머리에서 같은 이름의 값을 모두 읽는다 (경로가 다른 문서 쿠키가 함께 올 수 있다)
export function readCookieValues(header: string | null | undefined, name: string): string[] {
  if (!header) return [];
  const values: string[] = [];
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) values.push(part.slice(eq + 1).trim());
  }
  return values;
}

// 글자의 SHA-256 (소문자 16진수)
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// 서가 토큰 확인 (J16)
// - Authorization: Bearer <토큰>. 서버는 토큰의 SHA-256만 안다(LIBRARY_TOKEN_SHA256).
// - 설정이 없거나 꼴이 틀리면 늘 거짓이다.
export function verifyBearerToken(authorization: string | null | undefined, expectedSha256: string | null | undefined): boolean {
  if (!authorization || !expectedSha256 || !/^[0-9a-fA-F]{64}$/.test(expectedSha256)) return false;
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return false;
  const got = Buffer.from(sha256Hex(match[1]), 'hex');
  const want = Buffer.from(expectedSha256.toLowerCase(), 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

// 같은 문서 키 → 문서 id: 키의 SHA-256 앞 20자 (J8)
// - 같은 키는 늘 같은 id다. 다시 올려도 문서 출처 경로가 같다(J4).
// - 키에 든 맥 경로(사용자 이름 등)가 주소에 드러나지 않는다.
export function docIdForKey(key: string): string {
  return sha256Hex(key.normalize('NFC')).slice(0, 20);
}
