// 관리자 쿠키 이름 테스트 (서가 2단계 T10, Plan L10·J54)
// - https: __Host-cruz_admin (Secure, Path=/, Domain 없음). 문서 출처의 스크립트가 같은 이름의 쿠키를 심지 못한다.
// - http(로컬 개발): 옛 이름 cruz_admin (__Host-는 Secure가 필요하다).
// - 로그인·로그아웃 때 옛 이름 쿠키를 지운다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  verifyIdToken: vi.fn(),
  verifySessionCookie: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  createSessionCookie: vi.fn(),
  revokeRefreshTokens: vi.fn(),
};
vi.mock('@/lib/server/firebase-server', () => ({ getServerAuth: () => auth }));

const { adminCookieName, adminCookieOptions, legacyAdminCookieName } = await import('@/lib/server/admin-session');
const session = await import('@/pages/api/admin/session');

const HTTPS = new URL('https://www.cruzlab.dev/api/admin/session');
const HTTP = new URL('http://localhost:4341/api/admin/session');
const ADMIN = 'admin-uid';

describe('adminCookieName (J54)', () => {
  it('https는 __Host-cruz_admin, http는 cruz_admin', () => {
    expect(adminCookieName(HTTPS)).toBe('__Host-cruz_admin');
    expect(adminCookieName(HTTP)).toBe('cruz_admin');
  });

  it('지울 옛 이름: https는 cruz_admin, http는 없음(지금 이름과 같다)', () => {
    expect(legacyAdminCookieName(HTTPS)).toBe('cruz_admin');
    expect(legacyAdminCookieName(HTTP)).toBeNull();
  });

  it('__Host- 쿠키 조건: Secure, Path=/, Domain 없음', () => {
    const options = adminCookieOptions(HTTPS);
    expect(options).toMatchObject({ secure: true, path: '/', httpOnly: true, sameSite: 'lax' });
    expect(options).not.toHaveProperty('domain');
    expect(adminCookieOptions(HTTP).secure).toBe(false);
  });
});

// 세션 API가 쓰는 쿠키 이름 (가짜 쿠키 칸으로 시험한다)
function fakeCookies(values: Record<string, string> = {}) {
  const set: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const deleted: { name: string; options: Record<string, unknown> }[] = [];
  return {
    set,
    deleted,
    get: (name: string) => (name in values ? { value: values[name] } : undefined),
    store: {
      set: (name: string, value: string, options: Record<string, unknown>) => set.push({ name, value, options }),
      delete: (name: string, options: Record<string, unknown>) => deleted.push({ name, options }),
      get: (name: string) => (name in values ? { value: values[name] } : undefined),
    },
  };
}

function context(url: URL, method: string, cookies: ReturnType<typeof fakeCookies>, body?: unknown) {
  const request = new Request(url, {
    method,
    headers: { Origin: url.origin, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    request,
    url,
    cookies: cookies.store,
    locals: { admin: { uid: ADMIN, email: null, expiresAt: '2026-12-01T00:00:00.000Z' } },
  } as unknown as Parameters<typeof session.POST>[0];
}

beforeEach(() => {
  vi.stubEnv('ADMIN_UID', ADMIN);
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.verifyIdToken.mockResolvedValue({ uid: ADMIN, email_verified: true, auth_time: Math.floor(Date.now() / 1000) });
  auth.createSessionCookie.mockResolvedValue('session-value');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/admin/session: 새 이름으로 심고 옛 이름을 지운다', () => {
  it('https: __Host-cruz_admin을 심고 cruz_admin을 지운다', async () => {
    const cookies = fakeCookies();
    const response = await session.POST(context(HTTPS, 'POST', cookies, { idToken: 'token' }));
    expect(response.status).toBe(204);
    expect(cookies.set.map((item) => [item.name, item.value])).toEqual([['__Host-cruz_admin', 'session-value']]);
    expect(cookies.set[0].options).toMatchObject({ secure: true, path: '/' });
    expect(cookies.deleted.map((item) => item.name)).toEqual(['cruz_admin']);
  });

  it('http(로컬 개발): cruz_admin을 심고 지우지 않는다', async () => {
    const cookies = fakeCookies();
    await session.POST(context(HTTP, 'POST', cookies, { idToken: 'token' }));
    expect(cookies.set.map((item) => item.name)).toEqual(['cruz_admin']);
    expect(cookies.deleted).toEqual([]);
  });
});

describe('DELETE /api/admin/session: 두 이름을 모두 지운다', () => {
  it('https: __Host-cruz_admin과 옛 cruz_admin을 지운다', async () => {
    const cookies = fakeCookies();
    const response = await session.DELETE(context(HTTPS, 'DELETE', cookies));
    expect(response.status).toBe(204);
    expect(cookies.deleted.map((item) => item.name).sort()).toEqual(['__Host-cruz_admin', 'cruz_admin']);
    const host = cookies.deleted.find((item) => item.name === '__Host-cruz_admin');
    expect(host?.options).toMatchObject({ secure: true, path: '/' });
  });

  it('http: cruz_admin 하나만 지운다', async () => {
    const cookies = fakeCookies();
    await session.DELETE(context(HTTP, 'DELETE', cookies));
    expect(cookies.deleted.map((item) => item.name)).toEqual(['cruz_admin']);
  });
});
