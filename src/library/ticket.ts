// 입장권·문서 쿠키 값의 서명과 검증 (서가 1단계 T3, Plan J4·J5)
// - 입장권: 서가 화면이 만든다. 1분. 문서 출처의 /_open?t= 로 한 번 건넌다.
// - 문서 쿠키: 문서 출처가 입장권을 확인하고 준다. 12시간. Path=/{문서 id}/ 라서 그 문서에만 실린다.
// - 값의 꼴: {문서 id}.{만료 초}.{서명}. 서명 = HMAC-SHA256(비밀값, "{용도}|v1|{문서 id}|{만료 초}")
//   용도(ticket / cookie)를 서명에 넣어 입장권을 쿠키로, 쿠키를 입장권으로 쓰지 못하게 한다.
// - 서버(Node)에서만 쓴다(node:crypto). 저장소·네트워크 I/O는 없다.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const TICKET_TTL_SEC = 60;
export const DOC_COOKIE_TTL_SEC = 12 * 60 * 60;
export const DOC_COOKIE_NAME = 'cruz_doc';
// 비밀값 최소 길이 (환경 변수 LIBRARY_TICKET_SECRET)
export const MIN_SECRET_LENGTH = 32;

type Purpose = 'ticket' | 'cookie';

const DOC_ID = /^[A-Za-z0-9_-]{6,64}$/;

// 문서 id 꼴: 영문·숫자·-·_ 6~64자 (주소 경로와 쿠키 경로에 그대로 들어간다)
export function isDocId(value: unknown): value is string {
  return typeof value === 'string' && DOC_ID.test(value);
}

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
  return `${DOC_COOKIE_NAME}=${value}; Path=/${docId}/; Max-Age=${maxAge}; HttpOnly${secure}; SameSite=Lax`;
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
