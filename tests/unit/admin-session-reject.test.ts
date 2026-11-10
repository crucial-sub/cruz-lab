// 세션 API의 비관리자 인증 기록 삭제 순서 테스트 (재건 5단계 D4)
// - 설정 없음(503)·잘못된 토큰(401)이면 지우지 않는다.
// - ADMIN_UID가 실제 인증 사용자가 아니면(설정 오류) 지우지 않는다.
// - 관리자가 아닌 토큰이면 그 사용자를 지우고 403 details.authRecordDeleted = true.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  verifyIdToken: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  createSessionCookie: vi.fn(),
};
vi.mock('@/lib/server/firebase-server', () => ({ getServerAuth: () => auth }));

const { createAdminSessionCookie } = await import('@/lib/server/admin-session');

const ADMIN = 'admin-uid';
const nowSeconds = () => Math.floor(Date.now() / 1000);

// 던진 ApiError의 상태·코드·details를 꺼낸다
async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const e = error as { status?: number; code?: string; details?: unknown };
    return { status: e.status, code: e.code, details: e.details };
  }
  throw new Error('거부되지 않았다');
}

beforeEach(() => {
  vi.stubEnv('ADMIN_UID', ADMIN);
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.getUser.mockResolvedValue({ uid: ADMIN });
  auth.deleteUser.mockResolvedValue(undefined);
  auth.createSessionCookie.mockResolvedValue('cookie');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createAdminSessionCookie: 비관리자 인증 기록 삭제', () => {
  it('ADMIN_UID가 없으면 503이고 토큰을 확인하지도 지우지도 않는다', async () => {
    vi.stubEnv('ADMIN_UID', '');
    expect(await rejection(createAdminSessionCookie('token'))).toMatchObject({ status: 503 });
    expect(auth.verifyIdToken).not.toHaveBeenCalled();
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it('잘못된 토큰이면 401이고 지우지 않는다', async () => {
    auth.verifyIdToken.mockRejectedValue(new Error('bad'));
    expect(await rejection(createAdminSessionCookie('token'))).toMatchObject({ status: 401 });
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it('관리자가 아니면 그 사용자를 지우고 403 authRecordDeleted true', async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: 'stranger', email_verified: true, auth_time: nowSeconds() });
    expect(await rejection(createAdminSessionCookie('token'))).toMatchObject({
      status: 403,
      code: 'NOT_ADMIN',
      details: { authRecordDeleted: true },
    });
    expect(auth.getUser).toHaveBeenCalledWith(ADMIN);
    expect(auth.deleteUser).toHaveBeenCalledWith('stranger');
  });

  it('ADMIN_UID가 인증 사용자가 아니면(설정 오류) 지우지 않는다', async () => {
    vi.stubEnv('ADMIN_UID', '"admin-uid"');
    auth.getUser.mockRejectedValue(Object.assign(new Error('no user'), { code: 'auth/user-not-found' }));
    auth.verifyIdToken.mockResolvedValue({ uid: ADMIN, email_verified: true, auth_time: nowSeconds() });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await rejection(createAdminSessionCookie('token'))).toMatchObject({
      status: 403,
      details: { authRecordDeleted: false },
    });
    expect(auth.deleteUser).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('이메일 미확인으로 거부된 관리자 본인은 지우지 않는다', async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: ADMIN, email_verified: false, auth_time: nowSeconds() });
    expect(await rejection(createAdminSessionCookie('token'))).toMatchObject({
      status: 403,
      details: { authRecordDeleted: false },
    });
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it('지우기에 실패해도 403이고 authRecordDeleted false', async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: 'stranger', email_verified: true, auth_time: nowSeconds() });
    auth.deleteUser.mockRejectedValue(new Error('network'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await rejection(createAdminSessionCookie('token'))).toMatchObject({
      status: 403,
      details: { authRecordDeleted: false },
    });
    spy.mockRestore();
  });

  it('관리자면 지우지 않고 세션 쿠키를 만든다', async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: ADMIN, email_verified: true, auth_time: nowSeconds() });
    expect(await createAdminSessionCookie('token')).toBe('cookie');
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
});
