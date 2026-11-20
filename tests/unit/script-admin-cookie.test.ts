// 점검 스크립트의 관리자 쿠키 읽기 테스트 (서가 2단계 T10, Plan J54)
// - scripts/migrate/lib/admin.mjs: 이름 고르기와 Set-Cookie 읽기. 로그인 응답에 옛 이름을 지우는 줄이 함께 와도
//   새 이름의 값만 읽는다(이름 앞부분만 맞추면 __Host-cruz_admin과 cruz_admin이 섞인다).
import { describe, expect, it } from 'vitest';
import { adminCookieName, readSetCookie, sessionCookieMatch } from '../../scripts/migrate/lib/admin.mjs';

function headersWith(lines: string[]): Headers {
  const headers = new Headers();
  for (const line of lines) headers.append('set-cookie', line);
  return headers;
}

describe('점검 스크립트의 관리자 쿠키', () => {
  it('https는 __Host-cruz_admin, http는 cruz_admin', () => {
    expect(adminCookieName('https://preview.cruzlab.dev')).toBe('__Host-cruz_admin');
    expect(adminCookieName('http://localhost:4341')).toBe('cruz_admin');
  });

  it('옛 이름을 지우는 줄이 앞에 와도 새 이름의 값을 읽는다', () => {
    const headers = headersWith([
      'cruz_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
      '__Host-cruz_admin=session-value; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax',
    ]);
    expect(readSetCookie(headers, '__Host-cruz_admin')).toBe('session-value');
    expect(readSetCookie(headers, 'cruz_admin')).toBeNull();
    expect(sessionCookieMatch(headers, 'https://www.cruzlab.dev')).toEqual(['__Host-cruz_admin=session-value', 'session-value']);
  });

  it('http에서는 cruz_admin을 읽는다. 없으면 null', () => {
    expect(sessionCookieMatch(headersWith(['cruz_admin=v; Path=/']), 'http://localhost:4341')).toEqual(['cruz_admin=v', 'v']);
    expect(sessionCookieMatch(headersWith([]), 'http://localhost:4341')).toBeNull();
  });
});
