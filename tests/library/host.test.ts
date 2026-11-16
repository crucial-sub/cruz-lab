// 문서 출처 호스트·서가 경로 판정 테스트 (서가 1단계 T3, Plan 5.1 미들웨어 분기)
import { describe, expect, it } from 'vitest';
import { isDocHost, isLibraryEnabled, isLibraryPath, isLibraryTokenPath } from '@/library/host';

describe('isDocHost', () => {
  it('설정한 문서 출처 호스트와 같으면 참 (대소문자, 끝 점 무시)', () => {
    expect(isDocHost('raw.cruzlab.dev', 'raw.cruzlab.dev')).toBe(true);
    expect(isDocHost('RAW.cruzlab.dev.', 'raw.cruzlab.dev')).toBe(true);
    expect(isDocHost('raw.cruzlab.dev:443', 'raw.cruzlab.dev')).toBe(true);
  });

  it('블로그 호스트와 비슷한 이름은 거짓', () => {
    expect(isDocHost('www.cruzlab.dev', 'raw.cruzlab.dev')).toBe(false);
    expect(isDocHost('raw.cruzlab.dev.evil.com', 'raw.cruzlab.dev')).toBe(false);
    expect(isDocHost('xraw.cruzlab.dev', 'raw.cruzlab.dev')).toBe(false);
    expect(isDocHost(null, 'raw.cruzlab.dev')).toBe(false);
  });

  it('설정에 포트가 있으면 포트까지 비교한다 (로컬 개발)', () => {
    expect(isDocHost('raw.localhost:4321', 'raw.localhost:4321')).toBe(true);
    expect(isDocHost('raw.localhost:4322', 'raw.localhost:4321')).toBe(false);
  });

  it('설정이 비어 있으면 늘 거짓', () => {
    expect(isDocHost('raw.cruzlab.dev', undefined)).toBe(false);
    expect(isDocHost('', '')).toBe(false);
  });
});

describe('isLibraryPath', () => {
  it('서가 화면과 서가 API', () => {
    for (const p of [
      '/admin/library',
      '/admin/library/',
      '/admin/library/d/abc123',
      '/api/admin/library/uploads',
      '/api/library/token/uploads',
    ]) {
      expect(isLibraryPath(p), p).toBe(true);
    }
  });

  it('블로그 경로와 비슷한 이름은 아니다', () => {
    for (const p of ['/admin', '/admin/libraryx', '/api/admin/libraries', '/library', '/blog/library', '/api/libraryx']) {
      expect(isLibraryPath(p), p).toBe(false);
    }
  });
});

describe('isLibraryTokenPath', () => {
  it('/api/library/token/ 아래만', () => {
    expect(isLibraryTokenPath('/api/library/token/uploads')).toBe(true);
    expect(isLibraryTokenPath('/api/library/token')).toBe(true);
    expect(isLibraryTokenPath('/api/admin/library/uploads')).toBe(false);
    expect(isLibraryTokenPath('/api/library/tokenx')).toBe(false);
  });
});

describe('isLibraryEnabled', () => {
  it('true 또는 1일 때만 켠다', () => {
    expect(isLibraryEnabled('true')).toBe(true);
    expect(isLibraryEnabled('1')).toBe(true);
    expect(isLibraryEnabled(true)).toBe(true);
    for (const v of ['false', '0', '', 'yes', undefined, false]) {
      expect(isLibraryEnabled(v)).toBe(false);
    }
  });
});
