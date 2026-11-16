// 입장권·문서 쿠키 서명 테스트 (서가 1단계 T3, Plan J4·J5)
import { describe, expect, it } from 'vitest';
import {
  DOC_COOKIE_NAME,
  DOC_COOKIE_TTL_SEC,
  TICKET_TTL_SEC,
  assertSecret,
  createDocCookie,
  createTicket,
  docIdForKey,
  sha256Hex,
  verifyBearerToken,
  docCookieHeader,
  isDocId,
  readCookieValues,
  verifyDocCookie,
  verifyTicket,
} from '@/library/ticket';

const SECRET = 's'.repeat(48);
const OTHER = 'o'.repeat(48);
const DOC = 'k7p2q9plan0123456789';
const NOW = Date.UTC(2026, 10, 17, 3, 0, 0);

describe('isDocId', () => {
  it('영문·숫자·-·_ 6~64자만', () => {
    expect(isDocId(DOC)).toBe(true);
    expect(isDocId('abc')).toBe(false);
    expect(isDocId('a.b.c.d.e.f')).toBe(false);
    expect(isDocId('../../x')).toBe(false);
    expect(isDocId('a'.repeat(65))).toBe(false);
  });
});

describe('assertSecret', () => {
  it('32자보다 짧거나 없으면 던진다', () => {
    expect(() => assertSecret(undefined)).toThrow();
    expect(() => assertSecret('short')).toThrow();
    expect(assertSecret(SECRET)).toBe(SECRET);
  });
});

describe('입장권 (1분)', () => {
  it('만든 입장권은 1분 안에 같은 문서 id를 돌려준다', () => {
    const t = createTicket(DOC, NOW, SECRET);
    expect(verifyTicket(t, NOW, SECRET)).toBe(DOC);
    expect(verifyTicket(t, NOW + TICKET_TTL_SEC * 1000, SECRET)).toBe(DOC);
    expect(TICKET_TTL_SEC).toBe(60);
  });

  it('만료, 다른 비밀값, 위조, 망가진 값은 null', () => {
    const t = createTicket(DOC, NOW, SECRET);
    expect(verifyTicket(t, NOW + TICKET_TTL_SEC * 1000 + 1000, SECRET)).toBeNull();
    expect(verifyTicket(t, NOW, OTHER)).toBeNull();
    const [, exp, sig] = t.split('.');
    expect(verifyTicket(`otherdoc123.${exp}.${sig}`, NOW, SECRET)).toBeNull();
    expect(verifyTicket(`${DOC}.${Number(exp) + 3600}.${sig}`, NOW, SECRET)).toBeNull();
    for (const bad of ['', 'x', 'a.b', `${DOC}.abc.${sig}`, `${t}.extra`, null, undefined]) {
      expect(verifyTicket(bad as string, NOW, SECRET)).toBeNull();
    }
  });

  it('문서 쿠키 값은 입장권으로 쓰지 못한다', () => {
    const cookie = createDocCookie(DOC, NOW, SECRET);
    expect(verifyTicket(cookie, NOW, SECRET)).toBeNull();
  });

  it('나쁜 문서 id로는 만들지 않는다', () => {
    expect(() => createTicket('../x', NOW, SECRET)).toThrow();
  });
});

describe('문서 쿠키 (12시간, 문서 하나)', () => {
  it('12시간 동안 그 문서에만 통한다', () => {
    const c = createDocCookie(DOC, NOW, SECRET);
    expect(verifyDocCookie(c, DOC, NOW, SECRET)).toBe(true);
    expect(verifyDocCookie(c, DOC, NOW + DOC_COOKIE_TTL_SEC * 1000, SECRET)).toBe(true);
    expect(verifyDocCookie(c, DOC, NOW + DOC_COOKIE_TTL_SEC * 1000 + 1000, SECRET)).toBe(false);
    expect(verifyDocCookie(c, 'another-doc-id', NOW, SECRET)).toBe(false);
    expect(verifyDocCookie(c, DOC, NOW, OTHER)).toBe(false);
    expect(DOC_COOKIE_TTL_SEC).toBe(12 * 60 * 60);
  });

  it('수명을 줄일 수 있다 (시험용)', () => {
    const c = createDocCookie(DOC, NOW, SECRET, 60);
    expect(verifyDocCookie(c, DOC, NOW + 61_000, SECRET)).toBe(false);
  });

  it('입장권은 문서 쿠키로 쓰지 못한다', () => {
    expect(verifyDocCookie(createTicket(DOC, NOW, SECRET), DOC, NOW, SECRET)).toBe(false);
  });
});

describe('docCookieHeader', () => {
  it('문서 경로에만, HttpOnly·SameSite=Lax, https면 Secure', () => {
    expect(docCookieHeader(DOC, 'v', { secure: true })).toBe(
      `${DOC_COOKIE_NAME}=v; Path=/${DOC}/; Max-Age=${DOC_COOKIE_TTL_SEC}; HttpOnly; Secure; SameSite=Lax`,
    );
    expect(docCookieHeader(DOC, 'v', { secure: false, maxAgeSec: 60 })).toBe(
      `${DOC_COOKIE_NAME}=v; Path=/${DOC}/; Max-Age=60; HttpOnly; SameSite=Lax`,
    );
  });
});

describe('readCookieValues', () => {
  it('같은 이름의 값을 모두 읽는다', () => {
    expect(readCookieValues(`a=1; ${DOC_COOKIE_NAME}=x; b=2; ${DOC_COOKIE_NAME}=y`, DOC_COOKIE_NAME)).toEqual(['x', 'y']);
    expect(readCookieValues(null, DOC_COOKIE_NAME)).toEqual([]);
    expect(readCookieValues('cruz_doc_other=1', DOC_COOKIE_NAME)).toEqual([]);
  });
});

describe('verifyBearerToken: 서가 토큰 (J16)', () => {
  const token = 'lib_' + 'x'.repeat(40);
  const sha = sha256Hex(token);

  it('Bearer 토큰의 SHA-256이 설정값과 같으면 참', () => {
    expect(verifyBearerToken(`Bearer ${token}`, sha)).toBe(true);
    expect(verifyBearerToken(`bearer ${token}`, sha.toUpperCase())).toBe(true);
  });

  it('없거나 틀리거나 설정이 비면 거짓', () => {
    expect(verifyBearerToken(null, sha)).toBe(false);
    expect(verifyBearerToken(token, sha)).toBe(false);
    expect(verifyBearerToken(`Bearer ${token}x`, sha)).toBe(false);
    expect(verifyBearerToken(`Bearer ${token}`, undefined)).toBe(false);
    expect(verifyBearerToken(`Bearer ${token}`, 'short')).toBe(false);
    expect(verifyBearerToken('Bearer ', sha256Hex(''))).toBe(false);
  });
});

describe('docIdForKey: 같은 문서 키 → 문서 id', () => {
  it('키가 같으면 id가 같고, 20자 소문자 16진수다', () => {
    const a = docIdForKey('mac:~/Desktop/docs/x');
    expect(a).toBe(docIdForKey('mac:~/Desktop/docs/x'));
    expect(a).toMatch(/^[0-9a-f]{20}$/);
    expect(isDocId(a)).toBe(true);
    expect(docIdForKey('mac:~/Desktop/docs/y')).not.toBe(a);
  });
});
