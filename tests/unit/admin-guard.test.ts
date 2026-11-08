// 관리자 경로 판정 규칙 테스트 (재건 2단계 D5)
import { describe, expect, it } from 'vitest';
import {
  buildLoginRedirect,
  classifyAdminRequest,
  isAdminClaims,
  isRecentLogin,
  isSameOrigin,
  isWriteMethod,
  safeAdminNextPath,
} from '@/lib/admin-guard';

describe('classifyAdminRequest', () => {
  it('공개 경로는 public이다', () => {
    expect(classifyAdminRequest('/', 'GET')).toBe('public');
    expect(classifyAdminRequest('/blog/abc', 'GET')).toBe('public');
    expect(classifyAdminRequest('/administrator', 'GET')).toBe('public');
    expect(classifyAdminRequest('/api/administer', 'POST')).toBe('public');
  });

  it('로그인 페이지는 쿠키 없이 연다', () => {
    expect(classifyAdminRequest('/admin/login', 'GET')).toBe('login-page');
    expect(classifyAdminRequest('/admin/login/', 'GET')).toBe('login-page');
  });

  it('세션 발급(POST)만 쿠키 없이 부른다', () => {
    expect(classifyAdminRequest('/api/admin/session', 'POST')).toBe('session-create');
    expect(classifyAdminRequest('/api/admin/session', 'GET')).toBe('admin-api');
    expect(classifyAdminRequest('/api/admin/session', 'DELETE')).toBe('admin-api');
  });

  it('그 밖의 관리자 경로는 쿠키가 필요하다', () => {
    expect(classifyAdminRequest('/admin', 'GET')).toBe('admin-page');
    expect(classifyAdminRequest('/admin/', 'GET')).toBe('admin-page');
    expect(classifyAdminRequest('/admin/posts/new', 'GET')).toBe('admin-page');
    expect(classifyAdminRequest('/admin/login-help', 'GET')).toBe('admin-page');
    expect(classifyAdminRequest('/api/admin/posts', 'GET')).toBe('admin-api');
    expect(classifyAdminRequest('/api/admin/posts/abc/publish', 'POST')).toBe('admin-api');
  });
});

describe('isWriteMethod', () => {
  it('POST·PUT·PATCH·DELETE만 쓰기다', () => {
    expect(['POST', 'put', 'PATCH', 'DELETE'].every(isWriteMethod)).toBe(true);
    expect(['GET', 'HEAD', 'OPTIONS'].some(isWriteMethod)).toBe(false);
  });
});

describe('isSameOrigin', () => {
  it('같은 origin만 받는다', () => {
    expect(isSameOrigin('http://localhost:4321', 'http://localhost:4321/api/admin/posts')).toBe(true);
    expect(isSameOrigin('http://localhost:4322', 'http://localhost:4321/api/admin/posts')).toBe(false);
    expect(isSameOrigin('https://evil.example', 'https://www.cruzlab.dev/api/admin/posts')).toBe(false);
    expect(isSameOrigin('http://www.cruzlab.dev', 'https://www.cruzlab.dev/api/admin/posts')).toBe(false);
  });

  it('Origin이 없거나 깨졌으면 거부한다', () => {
    expect(isSameOrigin(null, 'http://localhost:4321/x')).toBe(false);
    expect(isSameOrigin('null', 'http://localhost:4321/x')).toBe(false);
  });
});

describe('safeAdminNextPath', () => {
  it('/admin 아래 경로는 그대로 둔다', () => {
    expect(safeAdminNextPath('/admin')).toBe('/admin');
    expect(safeAdminNextPath('/admin/posts?tab=draft')).toBe('/admin/posts?tab=draft');
  });

  it('외부 주소와 관리자 밖 경로는 /admin으로 바꾼다', () => {
    expect(safeAdminNextPath(null)).toBe('/admin');
    expect(safeAdminNextPath('https://evil.example/admin')).toBe('/admin');
    expect(safeAdminNextPath('//evil.example/admin')).toBe('/admin');
    expect(safeAdminNextPath('/\\evil.example')).toBe('/admin');
    expect(safeAdminNextPath('/blog')).toBe('/admin');
    expect(safeAdminNextPath('/admin/login')).toBe('/admin');
    expect(safeAdminNextPath('/admin/../blog')).toBe('/admin');
  });
});

describe('buildLoginRedirect', () => {
  it('돌아갈 경로를 next로 붙인다', () => {
    expect(buildLoginRedirect('/admin', '')).toBe('/admin/login?next=%2Fadmin');
    expect(buildLoginRedirect('/admin/posts', '?q=a')).toBe('/admin/login?next=%2Fadmin%2Fposts%3Fq%3Da');
  });
});

describe('isRecentLogin', () => {
  const now = Date.UTC(2026, 10, 8, 12, 0, 0);
  it('로그인 5분 이내만 받는다', () => {
    expect(isRecentLogin(now / 1000 - 10, now)).toBe(true);
    expect(isRecentLogin(now / 1000 - 300, now)).toBe(true);
    expect(isRecentLogin(now / 1000 - 301, now)).toBe(false);
    expect(isRecentLogin(Number.NaN, now)).toBe(false);
  });
});

describe('isAdminClaims', () => {
  it('UID가 같고 이메일 인증이 된 계정만 관리자다', () => {
    expect(isAdminClaims({ uid: 'u1', email_verified: true }, 'u1')).toBe(true);
    expect(isAdminClaims({ uid: 'u1', email_verified: false }, 'u1')).toBe(false);
    expect(isAdminClaims({ uid: 'u2', email_verified: true }, 'u1')).toBe(false);
    expect(isAdminClaims({ uid: 'u1', email_verified: true }, null)).toBe(false);
    expect(isAdminClaims({ uid: '', email_verified: true }, '')).toBe(false);
  });
});
